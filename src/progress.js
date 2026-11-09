// Validated operations on the save. Each returns { ok: false, reason } and changes
// nothing, or applies the whole change. Coin rewards go through grant() so every
// wallet change leaves a ledger line. Time is always passed in, for testable clocks.
import {
  REWARDS, XP, UPGRADES, ACHIEVEMENTS, MISSIONS, DAILY_TRACK, JOURNAL_TIERS, LIMITS,
  cosmeticById, upgradeById, eventById, heroById,
} from './catalog.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function grant(save, source, id, amount, now) {
  save.wallet.graveCoins += amount;
  save.ledger.push({ source, id, amount, at: now });
  if (save.ledger.length > LIMITS.ledger) save.ledger.splice(0, save.ledger.length - LIMITS.ledger);
}

// ---------------- Runs ----------------

// What a run starts with. Levels are copied so menus can't change a run in progress.
export function runLoadout(save, eventId = null) {
  const ev = eventId ? eventById(eventId) : null;
  const upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, ev ? 0 : save.upgradeLevels[u.id]]));
  const value = (id) => upgradeById(id).values[upgrades[id]];
  // The chosen heroes play with their own perks, on top of (never below) the bought upgrades.
  const heroes = { keeper: save.heroes.selected.keeper, survivor: save.heroes.selected.survivor };
  const kp = heroById(heroes.keeper).perks, sp = heroById(heroes.survivor).perks;
  return {
    eventId,
    upgrades,
    heroes,
    equipped: JSON.parse(JSON.stringify(save.equippedByCampaign)),
    keeper: {
      waveCounts: ev?.waveCounts ?? null,
      pulseCooldown: value('pulseRecovery') * (kp.pulseCooldown ?? 1), soulReach: value('soulReach'),
      maxHealth: kp.maxHealth ?? 3, slashRange: kp.slashRange ?? 1, slashArc: kp.slashArc ?? 1,
      slashCooldown: kp.slashCooldown ?? 1, pulseWounds: !!kp.pulseWounds,
    },
    survivor: {
      distractCooldown: value('distractRecovery'), distractDuration: value('lastingRattle'),
      blade: Math.max(value('blade'), sp.blade ?? 1),
      rounds: Math.max(value('pistol'), sp.rounds ?? 0),
      pistolLevel: Math.max(upgrades.pistol, sp.pistolLevel ?? 0),
      secondWind: sp.secondWind ?? 0, speed: sp.speed ?? 1,
    },
  };
}

// The rewards a finished run earns. Standard and event runs never share a path.
export function computeRewards(summary, save) {
  const lines = [];
  if (summary.eventId) {
    const ev = eventById(summary.eventId);
    const first = summary.result === 'victory' && !save.events.firstClearClaimedIds.includes(ev.id);
    if (first) lines.push({ label: 'First clear', amount: ev.firstClearCoins });
    return { lines, coins: lines.reduce((n, l) => n + l.amount, 0), xp: 0, firstClear: first };
  }
  let xp = 0;
  if (summary.campaign === 'keeper') {
    const r = REWARDS.keeper;
    if (summary.souls) lines.push({ label: plural(summary.souls, 'soul collected', 'souls collected'), amount: summary.souls * r.soul });
    if (summary.seals) lines.push({ label: plural(summary.seals, 'wave sealed', 'waves sealed'), amount: summary.seals * r.seal });
    if (summary.result === 'victory') lines.push({ label: 'Victory', amount: r.win });
    xp = summary.souls * XP.soul + summary.seals * XP.wave;
  } else {
    const r = REWARDS.survivor;
    if (summary.tasks) lines.push({ label: plural(summary.tasks, 'task completed', 'tasks completed'), amount: summary.tasks * r.task });
    if (summary.result === 'victory') lines.push({ label: 'Reached the refuge', amount: r.win });
    xp = summary.tasks * XP.task;
  }
  if (summary.result === 'victory') xp += XP.win;
  return { lines, coins: lines.reduce((n, l) => n + l.amount, 0), xp, firstClear: false };
}

// Reward, records, progress, XP and receipt all land together, exactly once per run id.
export function commitRun(save, summary, now) {
  if (save.processedRunIds.includes(summary.id)) return fail('duplicate');
  const before = save.wallet.graveCoins;
  const rewards = computeRewards(summary, save);
  const win = summary.result === 'victory';
  const notes = {};
  grant(save, summary.eventId ? 'event-first-clear' : 'run', summary.id, rewards.coins, now);

  if (summary.eventId) {
    const ev = save.events;
    if (rewards.firstClear) ev.firstClearClaimedIds.push(summary.eventId);
    if (win && !ev.completedIds.includes(summary.eventId)) ev.completedIds.push(summary.eventId);
    const prev = ev.bestByEvent[summary.eventId] || 0;
    notes.previousBest = prev;
    notes.newBest = summary.score > prev;
    if (notes.newBest) ev.bestByEvent[summary.eventId] = summary.score;
  } else {
    const stats = save.lifetimeStats, rec = save.records;
    if (summary.time >= REWARDS.minCountedRunSeconds) stats.countedRuns++;
    if (summary.campaign === 'keeper') {
      stats.souls += summary.souls;
      stats.seals += summary.seals;
      save.missionProgress.souls += summary.souls;
      save.missionProgress.seals += summary.seals;
      if (win) {
        stats.keeperWins++;
        rec.completions.keeper++;
        if (summary.breaches === 0) stats.flawlessWins++;
      }
      const prev = rec.keeperBest?.score ?? 0;
      notes.previousBest = prev;
      notes.newBest = summary.score > prev;
      if (notes.newBest) rec.keeperBest = { score: summary.score, upgrades: summary.upgrades, runId: summary.id };
    } else {
      stats.survivorTasks += summary.tasks;
      save.missionProgress.tasks += summary.tasks;
      if (win) {
        stats.survivorWins++;
        rec.completions.survivor++;
        const prev = rec.survivorFastest?.time ?? Infinity;
        notes.previousBest = prev === Infinity ? null : prev;
        notes.newBest = summary.time < prev;
        if (notes.newBest) rec.survivorFastest = { time: summary.time, upgrades: summary.upgrades, runId: summary.id };
      }
    }
    save.nightJournal.xp += rewards.xp;
  }

  save.records.recentRuns.unshift({
    id: summary.id, campaign: summary.campaign, eventId: summary.eventId, result: summary.result,
    time: summary.time, score: summary.campaign === 'keeper' ? summary.score : null,
    coins: rewards.coins, upgrades: summary.upgrades, at: now,
  });
  save.records.recentRuns.length = Math.min(save.records.recentRuns.length, LIMITS.recentRuns);
  save.processedRunIds.push(summary.id);
  if (save.processedRunIds.length > LIMITS.processedRunIds) save.processedRunIds.shift();
  return { ok: true, ...rewards, ...notes, walletBefore: before, walletAfter: save.wallet.graveCoins };
}

// ---------------- Heroes ----------------

export const ownsHero = (save, id) => {
  const h = heroById(id);
  return !!h && (h.cost === 0 || save.heroes.owned.includes(id));
};

export function buyHero(save, id, now) {
  const h = heroById(id);
  if (!h || h.cost === 0) return fail('unknown');
  if (save.heroes.owned.includes(id)) return fail('owned');
  if (save.wallet.graveCoins < h.cost) return fail('funds', { need: h.cost - save.wallet.graveCoins });
  save.wallet.graveCoins -= h.cost;
  save.heroes.owned.push(id);
  save.heroes.selected[h.campaign] = id;
  save.ledger.push({ source: 'hero', id, amount: -h.cost, at: now });
  return { ok: true, spent: h.cost };
}

export function selectHero(save, id) {
  const h = heroById(id);
  if (!h) return fail('unknown');
  if (!ownsHero(save, id)) return fail('locked');
  save.heroes.selected[h.campaign] = id;
  return { ok: true };
}

// ---------------- Shop, equipment, upgrades ----------------

export const ownsCosmetic = (save, id) => {
  const c = cosmeticById(id);
  return !!c && (c.cost === 0 || save.ownedCosmeticIds.includes(id));
};

export function buyCosmetic(save, id, now) {
  const c = cosmeticById(id);
  if (!c || c.cost === 0) return fail('unknown');
  if (save.ownedCosmeticIds.includes(id)) return fail('owned');
  if (save.wallet.graveCoins < c.cost) return fail('funds', { need: c.cost - save.wallet.graveCoins });
  save.wallet.graveCoins -= c.cost;
  save.ownedCosmeticIds.push(id);
  save.ledger.push({ source: 'purchase', id, amount: -c.cost, at: now });
  return { ok: true, spent: c.cost };
}

export function equipCosmetic(save, id) {
  const c = cosmeticById(id);
  if (!c) return fail('unknown');
  if (!ownsCosmetic(save, id)) return fail('locked');
  save.equippedByCampaign[c.campaign][c.slot] = id;
  return { ok: true };
}

// The level the buyer saw is checked again, so a double tap can't buy two levels.
export function buyUpgrade(save, id, seenLevel, now) {
  const u = upgradeById(id);
  if (!u) return fail('unknown');
  const level = save.upgradeLevels[id];
  if (level !== seenLevel) return fail('stale');
  if (level >= u.costs.length) return fail('max');
  const cost = u.costs[level];
  if (save.wallet.graveCoins < cost) return fail('funds', { need: cost - save.wallet.graveCoins });
  save.wallet.graveCoins -= cost;
  save.upgradeLevels[id] = level + 1;
  save.ledger.push({ source: 'upgrade', id: `${id}:${level + 1}`, amount: -cost, at: now });
  return { ok: true, spent: cost, level: level + 1 };
}

// ---------------- Achievements & missions ----------------

function statValue(save, stat) {
  const s = save.lifetimeStats;
  if (stat === 'campaignsWon') return (s.keeperWins > 0 ? 1 : 0) + (s.survivorWins > 0 ? 1 : 0);
  return s[stat] ?? 0;
}

const stateOf = (progress, target, claimed) =>
  claimed ? 'claimed' : progress >= target ? 'unclaimed' : progress > 0 ? 'progress' : 'locked';

export function achievementStatus(save, a) {
  const progress = Math.min(statValue(save, a.stat), a.target);
  return { progress, target: a.target, state: stateOf(progress, a.target, save.claimedAchievementIds.includes(a.id)) };
}

export function claimAchievement(save, id, now) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return fail('unknown');
  const { state } = achievementStatus(save, a);
  if (state === 'claimed') return fail('claimed');
  if (state !== 'unclaimed') return fail('locked');
  save.claimedAchievementIds.push(id);
  grant(save, 'achievement', id, a.reward, now);
  return { ok: true, amount: a.reward };
}

export function missionStatus(save, m) {
  const progress = Math.min(save.missionProgress[m.stat], m.target);
  return { progress, target: m.target, state: stateOf(progress, m.target, save.claimedMissionIds.includes(m.id)) };
}

export function claimMission(save, id, now) {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return fail('unknown');
  const { state } = missionStatus(save, m);
  if (state === 'claimed') return fail('claimed');
  if (state !== 'unclaimed') return fail('locked');
  save.claimedMissionIds.push(id);
  grant(save, 'mission', id, m.reward, now);
  return { ok: true, amount: m.reward };
}

// ---------------- Daily rewards ----------------

export const dayKeyUTC = (now) => new Date(now).toISOString().slice(0, 10);
export const nextResetMs = (now) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

export function dailyStatus(save, now) {
  const today = dayKeyUTC(now), last = save.dailyRewards.lastClaimDayUTC;
  let state = 'ready';
  if (last === today) state = 'claimed';
  else if (last && today < last) state = 'clock';
  return { state, step: save.dailyRewards.nextStep, amount: DAILY_TRACK[save.dailyRewards.nextStep] };
}

export function claimDaily(save, now) {
  const { state, step, amount } = dailyStatus(save, now);
  if (state !== 'ready') return fail(state);
  save.dailyRewards.lastClaimDayUTC = dayKeyUTC(now);
  save.dailyRewards.nextStep = (step + 1) % DAILY_TRACK.length;
  grant(save, 'daily', dayKeyUTC(now), amount, now);
  return { ok: true, amount, step };
}

// ---------------- Night Journal ----------------

export function journalTierStatus(save, t) {
  if (save.nightJournal.claimedTierIds.includes(t.id)) return 'claimed';
  return save.nightJournal.xp >= t.xp ? 'unclaimed' : 'locked';
}

export function claimJournalTier(save, id, now) {
  const t = JOURNAL_TIERS.find((x) => x.id === id);
  if (!t) return fail('unknown');
  const state = journalTierStatus(save, t);
  if (state !== 'unclaimed') return fail(state);
  save.nightJournal.claimedTierIds.push(id);
  grant(save, 'journal', id, t.coins, now);
  return { ok: true, amount: t.coins, badge: t.badge ?? null };
}

export const hasJournalBadge = (save) =>
  JOURNAL_TIERS.some((t) => t.badge && save.nightJournal.claimedTierIds.includes(t.id));

// ---------------- Notification badges: only what can really be claimed ----------------

export function claimableCounts(save, now) {
  const achievements = ACHIEVEMENTS.filter((a) => achievementStatus(save, a).state === 'unclaimed').length;
  const missions = MISSIONS.filter((m) => missionStatus(save, m).state === 'unclaimed').length;
  const journal = JOURNAL_TIERS.filter((t) => journalTierStatus(save, t) === 'unclaimed').length;
  const daily = dailyStatus(save, now).state === 'ready' ? 1 : 0;
  return { achievements, missions, journal, daily, total: achievements + missions + journal + daily };
}
