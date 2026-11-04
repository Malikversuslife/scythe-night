// Destination pages. Every button routes through one delegated handler to a validated
// operation in progress.js; pages re-render from the save, so nothing is tracked twice.
import {
  COSMETICS, UPGRADES, ACHIEVEMENTS, MISSIONS, DAILY_TRACK, JOURNAL_TIERS, EVENTS, XP,
  SLOTS, SLOT_LABELS, cosmeticById, upgradeById, eventById,
} from './catalog.js';
import { TOP_COUNT } from './leaderboard-rules.mjs';
import {
  ownsCosmetic, buyCosmetic, equipCosmetic, buyUpgrade, achievementStatus, claimAchievement,
  missionStatus, claimMission, dailyStatus, claimDaily, nextResetMs, journalTierStatus,
  claimJournalTier, hasJournalBadge, claimableCounts,
} from './progress.js';
import { drawPreview } from './render.js';
import { fetchBoard } from './leaderboard.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);

export const coinTag = (n) =>
  `<span class="price"><img src="assets/img/ui/coin.png" alt="">${n.toLocaleString()}<span class="visually-hidden"> Grave Coins</span></span>`;

export const formatTime = (sec) => {
  const t = Math.floor(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const EARN_HINT = 'Earn Grave Coins by freeing souls, sealing waves, completing tasks and winning runs.';

// Overlay of the chosen cosmetics onto the rig's images.
export function skinFor(images, ids) {
  const out = {};
  let glow;
  for (const id of ids) {
    const c = cosmeticById(id);
    if (!c) continue;
    for (const [key, path] of Object.entries(c.skin)) if (images[path]) out[key] = images[path];
    if (c.glow) glow = c.glow;
  }
  return { overrides: out, glow };
}

const progressBar = (value, target) =>
  `<div class="bar" role="img" aria-label="${value} of ${target}"><i style="width:${Math.round((value / target) * 100)}%"></i><b>${value} / ${target}</b></div>`;

const STATE_TEXT = { locked: '\u{1F512} Locked', progress: '⏳ In progress', unclaimed: '✨ Ready to claim', claimed: '✓ Claimed' };

function upgradeSummary(upgrades) {
  const parts = UPGRADES.filter((u) => upgrades?.[u.id] > 0).map((u) => `${u.name} ${upgrades[u.id]}`);
  return parts.length ? parts.join(', ') : 'No upgrades';
}

export function boardRowsHtml(board) {
  if (!board.top.length) return '<p class="empty">No scores yet. Play Cemetery Keeper and claim the top spot.</p>';
  return `<ol class="board-list">${board.top.map((e) => `<li class="board-row${e.rank <= 3 ? ` top-${e.rank}` : ''}${board.you && board.you.rank === e.rank ? ' mine' : ''}">
      <span class="board-rank">${e.rank}</span><span class="board-name">${escapeHtml(e.name)}</span><span class="board-score">${e.score.toLocaleString()}</span></li>`).join('')}</ol>`;
}

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function createScreens({ store, images, confirmDialog, openOverlay, closeOverlay, announce, startEvent, refreshGlobal, openPage, playerId }) {
  let current = null;
  let note = '';
  const charView = { tab: 'keeper', preview: {} };

  const walletText = () => `You have ${store.data.wallet.graveCoins} Grave Coins.`;

  function setNote(text) {
    note = text;
    announce(text);
  }

  function saveWarning(result) {
    return result.saved ? '' : ' Not saved: this is a temporary session.';
  }

  // ---------------- Page templates ----------------

  const PAGES = {
    more: {
      title: 'More',
      html() {
        const c = claimableCounts(store.data, Date.now());
        const tile = (route, art, label, count, cls = '') => `
          <button class="grave-btn ${cls}" type="button" data-act="route" data-id="${route}" data-key="route-${route}">
            <img src="assets/img/menu/${art}.png" alt="" draggable="false">
            ${cls ? `<span class="plaque-label">${label}</span>` : `<span class="grave-label">${label}</span>`}
            ${count ? `<span class="badge" aria-label="${count} ready to claim">${count}</span>` : ''}
          </button>`;
        return `<div class="grave-grid more-grid">
          ${tile('records', 'records', 'Leaderboard', 0, 'has-plaque plaque-records')}
          ${tile('achievements', 'achievements', 'Achievements', c.achievements)}
          ${tile('missions', 'missions', 'Missions', c.missions)}
          ${tile('daily', 'daily', 'Daily Rewards', c.daily)}
          ${tile('events', 'events', 'Events', 0)}
          ${tile('journal', 'journal', 'Night Journal', c.journal, 'has-plaque plaque-journal')}
        </div>`;
      },
    },

    shop: {
      title: 'Shop',
      html() {
        const d = store.data;
        const items = COSMETICS.filter((c) => c.cost > 0).map((c) => {
          const owned = ownsCosmetic(d, c.id);
          const equipped = d.equippedByCampaign[c.campaign][c.slot] === c.id;
          const status = equipped ? '✓ Equipped' : owned ? '✓ Owned' : coinTag(c.cost);
          return `<button class="stone-card shop-item" type="button" data-act="item" data-id="${c.id}" data-key="item-${c.id}">
            <canvas class="thumb" data-preview="${c.id}" aria-hidden="true"></canvas>
            <span class="shop-text"><strong>${c.name}</strong><small>${c.appliesTo}</small><span class="shop-status">${status}</span></span>
          </button>`;
        }).join('');
        return `<p class="page-intro">Cosmetics only change how characters look. ${EARN_HINT}</p><div class="card-stack">${items}</div>`;
      },
    },

    characters: {
      title: 'Characters',
      html() {
        const d = store.data, tab = charView.tab;
        const who = tab === 'keeper'
          ? { name: 'Pip', desc: 'The small reaper who keeps Hush Hollow.' }
          : { name: 'Mara', desc: 'A late-working courier, out of time and out of the city.' };
        const slots = SLOTS[tab].map((slot) => {
          const options = COSMETICS.filter((c) => c.campaign === tab && c.slot === slot).map((c) => {
            const owned = ownsCosmetic(d, c.id);
            const equipped = d.equippedByCampaign[tab][slot] === c.id;
            const previewing = (charView.preview[slot] ?? d.equippedByCampaign[tab][slot]) === c.id;
            const status = equipped ? '✓ Equipped' : owned ? '✓ Owned' : '\u{1F512} Locked';
            const action = equipped ? ''
              : owned ? `<button class="stone-btn small" type="button" data-act="equip" data-id="${c.id}" data-key="equip-${c.id}">Equip</button>`
              : `<button class="stone-btn small" type="button" data-act="item" data-id="${c.id}" data-key="item-${c.id}">See in shop</button>`;
            return `<div class="option${previewing ? ' selected' : ''}">
              <button class="option-main" type="button" data-act="preview" data-id="${c.id}" data-key="preview-${c.id}" aria-pressed="${previewing}">
                <strong>${c.name}</strong><small>${status}</small>
              </button>${action}
            </div>`;
          }).join('');
          return `<h2 class="panel-heading">${SLOT_LABELS[slot]}</h2>${options}`;
        }).join('');
        return `<div class="tabs" role="group" aria-label="Campaign">
            <button class="stone-btn small${tab === 'keeper' ? ' primary' : ''}" type="button" data-act="tab" data-id="keeper" data-key="tab-keeper" aria-pressed="${tab === 'keeper'}">Keeper</button>
            <button class="stone-btn small${tab === 'survivor' ? ' primary' : ''}" type="button" data-act="tab" data-id="survivor" data-key="tab-survivor" aria-pressed="${tab === 'survivor'}">Survivor</button>
          </div>
          <div class="stone-card char-head">
            <canvas class="char-preview" data-char-preview aria-hidden="true"></canvas>
            <div><h2 class="char-name">${who.name}</h2><p>${who.desc}</p><p class="fine-print">Tap a look to preview it. Equipped looks apply from your next run.</p></div>
          </div>
          ${slots}`;
      },
    },

    upgrades: {
      title: 'Upgrades',
      html() {
        const d = store.data;
        const rows = UPGRADES.map((u) => {
          const level = d.upgradeLevels[u.id];
          const maxed = level >= u.costs.length;
          const cost = u.costs[level];
          const short = !maxed && d.wallet.graveCoins < cost;
          const skill = u.campaign === 'keeper' ? 'Cemetery Keeper' : 'Last Survivor';
          return `<div class="stone-card upgrade">
            <div class="upgrade-top"><strong>${u.name}</strong><small>${skill} · Level ${level} of ${u.costs.length}</small></div>
            <p>Now: ${u.format(u.values[level])}</p>
            ${maxed ? '<p class="done-line">✓ Maximum level</p>' : `<p>Next: ${u.format(u.values[level + 1])}</p>
              <div class="row-end">${coinTag(cost)}
                <button class="stone-btn small primary" type="button" data-act="upgrade" data-id="${u.id}" data-key="upgrade-${u.id}"${short ? ' disabled' : ''}>Buy</button></div>
              ${short ? `<p class="fine-print">\u{1F512} You need ${cost - d.wallet.graveCoins} more coins.</p>` : ''}`}
          </div>`;
        }).join('');
        return `<p class="page-intro">Permanent on this save, and locked in when a run starts. Upgrades never change health, gate breaches, one-touch failure or how far zombies see.</p><div class="card-stack">${rows}</div>`;
      },
    },

    records: {
      title: 'Leaderboard',
      html() {
        const d = store.data, r = d.records, s = d.lifetimeStats;
        const best = r.keeperBest, fast = r.survivorFastest;
        const tile = (label, value, sub = '') => `<div class="stat"><small>${label}</small><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
        const ev = EVENTS.map((e) => tile(`${e.name} best`, d.events.bestByEvent[e.id]?.toLocaleString() ?? '—', d.events.completedIds.includes(e.id) ? '✓ Cleared' : 'Not cleared')).join('');
        const runs = r.recentRuns.map((x) => {
          const mode = x.eventId ? eventById(x.eventId).name : x.campaign === 'keeper' ? 'Cemetery Keeper' : 'Last Survivor';
          return `<li class="run-row"><strong>${mode}</strong> <span class="${x.result}">${x.result === 'victory' ? '✓ Won' : '✗ Lost'}</span>
            <small>${formatTime(x.time)}${x.score !== null ? ` · Score ${x.score.toLocaleString()}` : ''} · +${x.coins} coins · ${x.eventId ? 'Event rules' : 'Standard'} · ${upgradeSummary(x.upgrades)}</small></li>`;
        }).join('');
        return `<h2 class="panel-heading">Top ${TOP_COUNT}: all players</h2>
          <div class="stone-card board-card" id="board-slot"><p class="board-status">Loading the top scores\u2026</p></div>
          <p class="fine-print">Cemetery Keeper scores, highest first; ties go to the faster run. Each player's best run counts.</p>
          <h2 class="panel-heading">Your records</h2>
          ${hasJournalBadge(d) ? '<p class="badge-line">\u{1F3C5} Journal Keeper</p>' : ''}
          <div class="stat-grid">
            ${tile('Keeper best', best ? best.score.toLocaleString() : '—', best ? upgradeSummary(best.upgrades) : 'No score yet')}
            ${tile('Survivor fastest', fast ? formatTime(fast.time) : '—', fast ? upgradeSummary(fast.upgrades) : 'No win yet')}
            ${tile('Keeper wins', r.completions.keeper)}
            ${tile('Survivor wins', r.completions.survivor)}
            ${tile('Souls freed', s.souls.toLocaleString())}
            ${ev}
          </div>
          <h2 class="panel-heading">Recent runs</h2>
          ${runs ? `<ul class="run-list">${runs}</ul>` : '<p class="empty">No finished runs yet. Play a story and it will appear here.</p>'}`;
      },
    },

    achievements: {
      title: 'Achievements',
      html() {
        const d = store.data;
        return `<div class="card-stack">${ACHIEVEMENTS.map((a) => claimRow(a, achievementStatus(d, a), 'achievement')).join('')}</div>
          <p class="fine-print">Lifetime progress from standard runs. Events don't count.</p>`;
      },
    },

    missions: {
      title: 'Missions',
      html() {
        const d = store.data;
        const done = d.claimedMissionIds.length === MISSIONS.length;
        return `${done ? '<p class="badge-line">✓ Starter board complete</p>' : '<p class="page-intro">A fixed starter board. Each pays out once.</p>'}
          <div class="card-stack">${MISSIONS.map((m) => claimRow(m, missionStatus(d, m), 'mission')).join('')}</div>`;
      },
    },

    daily: {
      title: 'Daily Rewards',
      html() {
        const d = store.data, now = Date.now();
        const st = dailyStatus(d, now);
        const steps = DAILY_TRACK.map((amount, i) => `<li class="day${i === st.step ? ' next' : ''}"><small>Step ${i + 1}</small>${coinTag(amount)}</li>`).join('');
        const reset = new Date(nextResetMs(now)).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
        const action = st.state === 'ready'
          ? `<button class="stone-btn primary" type="button" data-act="daily" data-key="daily">Claim ${st.amount} coins</button>`
          : st.state === 'claimed'
            ? `<p class="done-line">✓ Claimed today. Next reward: ${reset}.</p>`
            : '<p class="warn-line">⚠ Your device clock is set before your last claim. Claiming resumes once the date catches up.</p>';
        return `<ol class="day-track">${steps}</ol>${action}
          <p class="fine-print">One claim per UTC day; missing a day never loses your place, and step 7 wraps back to step 1. This uses your device clock and browser save, so it isn't tamper-proof and doesn't follow you to other devices.</p>`;
      },
    },

    events: {
      title: 'Events',
      html() {
        const d = store.data;
        return EVENTS.map((e) => {
          const paid = d.events.firstClearClaimedIds.includes(e.id);
          const best = d.events.bestByEvent[e.id];
          return `<div class="stone-card event">
            <h2 class="panel-heading">${e.name}</h2>
            <p>${e.desc}</p>
            <ul class="rule-list compact">${e.modifiers.map((m) => `<li>${m}</li>`).join('')}</ul>
            <p>First clear: ${coinTag(e.firstClearCoins)} ${paid ? '✓ Claimed' : 'once per save'}</p>
            <p>Best score: ${best ? best.toLocaleString() : '—'}</p>
            <p class="fine-print">Replays pay no coins. Event runs don't count toward missions, achievements or the Night Journal. Quitting pays nothing.</p>
            <button class="stone-btn primary" type="button" data-act="event" data-id="${e.id}" data-key="event-${e.id}"><img class="btn-icon" src="assets/img/ui/icon-play.png" alt="">Start Challenge</button>
          </div>`;
        }).join('');
      },
    },

    journal: {
      title: 'Night Journal',
      html() {
        const d = store.data, xp = d.nightJournal.xp;
        const next = JOURNAL_TIERS.find((t) => xp < t.xp);
        const complete = d.nightJournal.claimedTierIds.length === JOURNAL_TIERS.length;
        const rows = JOURNAL_TIERS.map((t, i) => {
          const state = journalTierStatus(d, t);
          return `<div class="stone-card claim-row">
            <div class="claim-text"><strong>Tier ${i + 1}</strong><small>${t.xp} Night XP · ${STATE_TEXT[state]}</small>
              <span>${coinTag(t.coins)}${t.badge ? ` + ${t.badge} badge` : ''}</span></div>
            ${state === 'unclaimed' ? `<button class="stone-btn small primary" type="button" data-act="journal" data-id="${t.id}" data-key="journal-${t.id}">Claim</button>` : ''}
          </div>`;
        }).join('');
        return `<p class="page-intro">A free track that never expires. Earn Night XP in standard runs: ${XP.soul} per soul, ${XP.wave} per wave sealed, ${XP.task} per task, ${XP.win} per win.</p>
          ${complete ? '<p class="badge-line">\u{1F3C5} Journal complete</p>' : next ? progressBar(xp, next.xp) : `<p class="badge-line">${xp} Night XP</p>`}
          <div class="card-stack">${rows}</div>`;
      },
    },
  };

  function claimRow(def, status, kind) {
    return `<div class="stone-card claim-row">
      <div class="claim-text"><strong>${def.name}</strong><small>${def.desc}</small>
        <span>${coinTag(def.reward)} · ${STATE_TEXT[status.state]}</span>
        ${status.state === 'claimed' ? '' : progressBar(status.progress, status.target)}</div>
      ${status.state === 'unclaimed' ? `<button class="stone-btn small primary" type="button" data-act="${kind}" data-id="${def.id}" data-key="${kind}-${def.id}">Claim</button>` : ''}
    </div>`;
  }

  // ---------------- Rendering ----------------

  function drawPreviews() {
    for (const cv of document.querySelectorAll('#page-body canvas[data-preview]')) {
      const c = cosmeticById(cv.dataset.preview);
      const others = Object.entries(store.data.equippedByCampaign[c.campaign]).filter(([slot]) => slot !== c.slot).map(([, id]) => id);
      drawPreview(cv, c.campaign, images, skinFor(images, [...others, c.id]).overrides);
    }
    const cv = document.querySelector('#page-body canvas[data-char-preview]');
    if (cv) {
      const tab = charView.tab;
      const ids = SLOTS[tab].map((slot) => charView.preview[slot] ?? store.data.equippedByCampaign[tab][slot]);
      drawPreview(cv, tab, images, skinFor(images, ids).overrides);
    }
  }

  function render(pageId, { keepFocus = false } = {}) {
    current = pageId;
    const key = keepFocus ? document.activeElement?.dataset?.key : null;
    const page = PAGES[pageId];
    $('page-title').textContent = page.title;
    const noteHtml = note ? `<p class="page-note" role="status">${note}</p>` : '';
    $('page-body').innerHTML = noteHtml + page.html();
    note = '';
    drawPreviews();
    refreshGlobal();
    if (pageId === 'records') loadBoard();
    if (key) {
      const again = document.querySelector(`#page-body [data-key="${key}"]`);
      (again || $('page-title')).focus({ preventScroll: true });
    }
  }

  // Fills the slot when the answer arrives, unless the player has moved on.
  async function loadBoard() {
    const board = await fetchBoard(playerId());
    const slot = $('board-slot');
    if (!slot) return;
    if (!board.ok) {
      slot.innerHTML = `<p class="board-status">\u26A0 ${board.error} Your own records below are still here.</p>`;
      return;
    }
    const you = board.you ? `<p class="board-you">Your best: #${board.you.rank} with ${board.you.score.toLocaleString()}</p>` : '';
    slot.innerHTML = boardRowsHtml(board) + you;
  }

  const rerender = () => { if (current) render(current, { keepFocus: true }); };

  // ---------------- Claims ----------------

  function claimResult(result, label) {
    if (result.ok) {
      audio.sfx.coin();
      setNote(`${label}: +${result.amount} coins.${saveWarning(result)} ${walletText()}`);
    } else {
      audio.sfx.denied();
      setNote(result.reason === 'clock' ? 'Your device clock is behind your last claim.' : 'Nothing to claim there.');
    }
    rerender();
  }

  async function buyUpgradeFlow(id) {
    const u = upgradeById(id);
    const seen = store.data.upgradeLevels[id];
    const cost = u.costs[seen];
    if (cost === undefined) return;
    const ok = await confirmDialog(`Buy ${u.name}?`, `${u.format(u.values[seen])} becomes ${u.format(u.values[seen + 1])} for ${cost} Grave Coins. It applies from your next run.`, 'Buy');
    if (!ok) return;
    const result = store.transact((d) => buyUpgrade(d, id, seen, Date.now()));
    if (result.ok) {
      audio.sfx.coin();
      setNote(`${u.name} is now level ${result.level}.${saveWarning(result)} ${walletText()}`);
    } else {
      audio.sfx.denied();
      setNote(result.reason === 'funds' ? `You need ${result.need} more coins. ${EARN_HINT}` : 'That purchase is no longer available.');
    }
    rerender();
  }

  // ---------------- Shop item details ----------------

  function renderItem(id) {
    const c = cosmeticById(id), d = store.data;
    const owned = ownsCosmetic(d, id);
    const equipped = d.equippedByCampaign[c.campaign][c.slot] === id;
    $('item-title').textContent = c.name;
    $('item-desc').textContent = `${c.desc} ${c.appliesTo}. Looks only: no effect on gameplay.`;
    const short = c.cost - d.wallet.graveCoins;
    $('item-status').innerHTML = equipped ? '✓ Equipped' : owned ? '✓ Owned'
      : short > 0 ? `${coinTag(c.cost)} \u{1F512} You need ${short} more coins. ${EARN_HINT}` : coinTag(c.cost);
    const buttons = [];
    if (!owned && short <= 0) buttons.push(`<button class="stone-btn primary" type="button" data-item-act="buy">Buy for ${c.cost}</button>`);
    if (owned && !equipped) buttons.push('<button class="stone-btn primary" type="button" data-item-act="equip">Equip</button>');
    buttons.push('<button class="stone-btn" type="button" data-item-act="close">Close</button>');
    $('item-actions').innerHTML = buttons.join('');
    $('item-actions').dataset.id = id;
    const others = Object.entries(d.equippedByCampaign[c.campaign]).filter(([slot]) => slot !== c.slot).map(([, x]) => x);
    drawPreview($('item-preview'), c.campaign, images, skinFor(images, [...others, id]).overrides);
  }

  function openItem(id) {
    const key = document.activeElement?.dataset?.key;
    openOverlay('overlay-item', () => {
      rerender();
      document.querySelector(`#page-body [data-key="${key}"]`)?.focus({ preventScroll: true });
    });
    renderItem(id);
    $('item-actions').querySelector('button')?.focus({ preventScroll: true });
  }

  $('item-actions').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-item-act]')?.dataset.itemAct;
    if (!act) return;
    const id = $('item-actions').dataset.id, c = cosmeticById(id);
    if (act === 'close') { closeOverlay(); return; }
    if (act === 'buy') {
      const ok = await confirmDialog(`Buy ${c.name}?`, `This spends ${c.cost} of your ${store.data.wallet.graveCoins} Grave Coins.`, 'Buy');
      if (!ok) return;
      const result = store.transact((d) => buyCosmetic(d, id, Date.now()));
      if (result.ok) { audio.sfx.coin(); announce(`Bought ${c.name}.${saveWarning(result)} ${walletText()}`); }
      else { audio.sfx.denied(); announce(result.reason === 'funds' ? `You need ${result.need} more coins.` : 'That item is no longer available.'); }
    } else if (act === 'equip') {
      store.transact((d) => equipCosmetic(d, id));
      audio.sfx.click();
      announce(`${c.name} equipped.`);
    }
    renderItem(id);
    refreshGlobal();
    $('item-actions').querySelector('button')?.focus({ preventScroll: true });
  });

  // ---------------- Delegated actions ----------------

  $('page-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const { act, id } = btn.dataset;
    const now = Date.now();
    switch (act) {
      case 'route': openPage(id); break;
      case 'item': openItem(id); break;
      case 'tab': charView.tab = id; charView.preview = {}; rerender(); break;
      case 'preview': charView.preview[cosmeticById(id).slot] = id; rerender(); break;
      case 'equip': {
        const r = store.transact((d) => equipCosmetic(d, id));
        if (r.ok) { audio.sfx.click(); delete charView.preview[cosmeticById(id).slot]; setNote(`${cosmeticById(id).name} equipped.`); }
        rerender();
        break;
      }
      case 'upgrade': buyUpgradeFlow(id); break;
      case 'achievement': claimResult(store.transact((d) => claimAchievement(d, id, now)), ACHIEVEMENTS.find((a) => a.id === id).name); break;
      case 'mission': claimResult(store.transact((d) => claimMission(d, id, now)), MISSIONS.find((m) => m.id === id).name); break;
      case 'daily': claimResult(store.transact((d) => claimDaily(d, now)), 'Daily reward'); break;
      case 'journal': claimResult(store.transact((d) => claimJournalTier(d, id, now)), 'Night Journal'); break;
      case 'event': startEvent(id); break;
    }
  });

  return { render, rerender, get current() { return current; }, clear() { current = null; } };
}
