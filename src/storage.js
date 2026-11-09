// Versioned, namespaced local save with migration and an in-memory fallback.
// Every write re-reads the stored copy first, so a change made elsewhere is never
// overwritten; main.js also keeps one tab active at a time with a Web Lock.
import { COSMETICS, UPGRADES, ACHIEVEMENTS, MISSIONS, JOURNAL_TIERS, EVENTS, DAILY_TRACK, LIMITS, cosmeticById, defaultCosmetic, SLOTS, HEROES, heroById, defaultHero } from './catalog.js';

export const SAVE_KEY = 'scythe-night:save';
export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    settings: { music: 60, sfx: 80, muted: false, reducedMotion: 'system' },
    tutorialSeen: { keeper: false, survivor: false },
    wallet: { graveCoins: 0 },
    ownedCosmeticIds: [],
    equippedByCampaign: {
      keeper: { appearance: 'pip-default', weapon: 'scythe-default', lantern: 'lantern-default' },
      survivor: { appearance: 'mara-default' },
    },
    upgradeLevels: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    heroes: { owned: [], selected: { keeper: 'pip', survivor: 'mara' } },
    lifetimeStats: { souls: 0, seals: 0, survivorTasks: 0, keeperWins: 0, flawlessWins: 0, survivorWins: 0, countedRuns: 0 },
    claimedAchievementIds: [],
    missionProgress: { souls: 0, seals: 0, tasks: 0 },
    claimedMissionIds: [],
    dailyRewards: { lastClaimDayUTC: null, nextStep: 0 },
    nightJournal: { xp: 0, claimedTierIds: [] },
    records: { keeperBest: null, survivorFastest: null, completions: { keeper: 0, survivor: 0 }, recentRuns: [] },
    events: { firstClearClaimedIds: [], bestByEvent: {}, completedIds: [] },
    processedRunIds: [],
    ledger: [],
    player: { id: null, name: '' },
  };
}

const clampInt = (v, lo, hi, fallback) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
const count = (v) => clampInt(v, 0, 1e9, 0);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const knownIds = (v, ids) => [...new Set(list(v).filter((id) => ids.includes(id)))];

function sanitizeBest(b, field) {
  const o = obj(b);
  const value = Number(o[field]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { [field]: value, upgrades: obj(o.upgrades), runId: typeof o.runId === 'string' ? o.runId : null };
}

function sanitizeRun(r) {
  const o = obj(r);
  if (typeof o.id !== 'string' || !['keeper', 'survivor'].includes(o.campaign)) return null;
  return {
    id: o.id,
    campaign: o.campaign,
    eventId: EVENTS.some((e) => e.id === o.eventId) ? o.eventId : null,
    result: o.result === 'victory' ? 'victory' : 'defeat',
    time: Math.max(0, Number(o.time) || 0),
    score: o.campaign === 'keeper' ? count(o.score) : null,
    coins: count(o.coins),
    upgrades: obj(o.upgrades),
    at: count(o.at),
  };
}

// Owned heroes are bought ones; a selection must be a hero of that story the player can use.
function sanitizeHeroes(h) {
  const owned = knownIds(h.owned, HEROES.filter((x) => x.cost > 0).map((x) => x.id));
  const selected = {};
  for (const campaign of ['keeper', 'survivor']) {
    const pick = heroById(obj(h.selected)[campaign]);
    const usable = pick && pick.campaign === campaign && (pick.cost === 0 || owned.includes(pick.id));
    selected[campaign] = usable ? pick.id : defaultHero(campaign).id;
  }
  return { owned, selected };
}

// v1 only had settings, keeperBest, completed flags and tutorial flags.
export function migrate(raw) {
  const o = obj(raw);
  if ((Number(o.version) || 1) >= 2) return o;
  const m = { ...defaultSave(), settings: o.settings, tutorialSeen: o.tutorialSeen };
  const keeper = o.completed?.keeper === true, survivor = o.completed?.survivor === true;
  m.records.keeperBest = o.keeperBest > 0 ? { score: o.keeperBest, upgrades: {}, runId: null } : null;
  m.records.completions = { keeper: keeper ? 1 : 0, survivor: survivor ? 1 : 0 };
  m.lifetimeStats.keeperWins = keeper ? 1 : 0;
  m.lifetimeStats.survivorWins = survivor ? 1 : 0;
  return m;
}

// Accepts anything (older, partial or corrupted) and returns a valid save.
export function sanitize(input) {
  const d = defaultSave();
  if (!input || typeof input !== 'object') return d;
  const raw = migrate(input);
  const s = obj(raw.settings);
  const stats = obj(raw.lifetimeStats), mp = obj(raw.missionProgress), daily = obj(raw.dailyRewards), nj = obj(raw.nightJournal);
  const rec = obj(raw.records), ev = obj(raw.events), comp = obj(rec.completions);
  const owned = knownIds(raw.ownedCosmeticIds, COSMETICS.filter((c) => c.cost > 0).map((c) => c.id));
  const equipped = {};
  for (const [campaign, slots] of Object.entries(SLOTS)) {
    equipped[campaign] = {};
    const stored = obj(obj(raw.equippedByCampaign)[campaign]);
    for (const slot of slots) {
      const item = cosmeticById(stored[slot]);
      const usable = item && item.campaign === campaign && item.slot === slot && (item.cost === 0 || owned.includes(item.id));
      equipped[campaign][slot] = usable ? item.id : defaultCosmetic(campaign, slot).id;
    }
  }
  const eventIds = EVENTS.map((e) => e.id);
  const best = {};
  for (const id of eventIds) if (count(obj(ev.bestByEvent)[id]) > 0) best[id] = count(obj(ev.bestByEvent)[id]);
  return {
    version: SAVE_VERSION,
    settings: {
      music: clampInt(s.music, 0, 100, d.settings.music),
      sfx: clampInt(s.sfx, 0, 100, d.settings.sfx),
      muted: s.muted === true,
      reducedMotion: ['system', 'on', 'off'].includes(s.reducedMotion) ? s.reducedMotion : 'system',
    },
    tutorialSeen: { keeper: raw.tutorialSeen?.keeper === true, survivor: raw.tutorialSeen?.survivor === true },
    wallet: { graveCoins: count(obj(raw.wallet).graveCoins) },
    ownedCosmeticIds: owned,
    equippedByCampaign: equipped,
    upgradeLevels: Object.fromEntries(UPGRADES.map((u) => [u.id, clampInt(obj(raw.upgradeLevels)[u.id], 0, u.costs.length, 0)])),
    heroes: sanitizeHeroes(obj(raw.heroes)),
    lifetimeStats: Object.fromEntries(Object.keys(d.lifetimeStats).map((k) => [k, count(stats[k])])),
    claimedAchievementIds: knownIds(raw.claimedAchievementIds, ACHIEVEMENTS.map((a) => a.id)),
    missionProgress: { souls: count(mp.souls), seals: count(mp.seals), tasks: count(mp.tasks) },
    claimedMissionIds: knownIds(raw.claimedMissionIds, MISSIONS.map((m) => m.id)),
    dailyRewards: {
      lastClaimDayUTC: /^\d{4}-\d{2}-\d{2}$/.test(daily.lastClaimDayUTC) ? daily.lastClaimDayUTC : null,
      nextStep: clampInt(daily.nextStep, 0, DAILY_TRACK.length - 1, 0),
    },
    nightJournal: { xp: count(nj.xp), claimedTierIds: knownIds(nj.claimedTierIds, JOURNAL_TIERS.map((t) => t.id)) },
    records: {
      keeperBest: sanitizeBest(rec.keeperBest, 'score'),
      survivorFastest: sanitizeBest(rec.survivorFastest, 'time'),
      completions: { keeper: count(comp.keeper), survivor: count(comp.survivor) },
      recentRuns: list(rec.recentRuns).map(sanitizeRun).filter(Boolean).slice(0, LIMITS.recentRuns),
    },
    events: {
      firstClearClaimedIds: knownIds(ev.firstClearClaimedIds, eventIds),
      completedIds: knownIds(ev.completedIds, eventIds),
      bestByEvent: best,
    },
    processedRunIds: list(raw.processedRunIds).filter((x) => typeof x === 'string').slice(-LIMITS.processedRunIds),
    ledger: list(raw.ledger).filter((x) => x && typeof x.source === 'string' && Number.isFinite(x.amount)).slice(-LIMITS.ledger),
    player: {
      id: /^[A-Za-z0-9-]{16,64}$/.test(obj(raw.player).id) ? obj(raw.player).id : null,
      name: typeof obj(raw.player).name === 'string' ? obj(raw.player).name.slice(0, 12) : '',
    },
  };
}

export function createStore(backend = safeLocalStorage()) {
  let available = !!backend;
  let data = defaultSave();

  function load() {
    if (!available) return;
    let text = null;
    try {
      text = backend.getItem(SAVE_KEY);
      data = sanitize(text ? JSON.parse(text) : null);
      // Keep the old file once, so a migration problem can be recovered from.
      const version = text ? Number(JSON.parse(text).version) || 1 : SAVE_VERSION;
      if (version < SAVE_VERSION && !backend.getItem(`${SAVE_KEY}:backup-v${version}`)) {
        backend.setItem(`${SAVE_KEY}:backup-v${version}`, text);
      }
    } catch {
      if (text) { try { backend.setItem(`${SAVE_KEY}:corrupt`, text); } catch { /* full: nothing more to do */ } }
      data = defaultSave();
    }
  }

  function persist() {
    if (!available) return false;
    try {
      backend.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      available = false; // blocked or full: carry on as a labelled temporary session
      return false;
    }
  }

  load();

  return {
    get data() { return data; },
    get available() { return available; },
    reload: load,
    // Run a change against the latest stored copy. A result of { ok: false } writes nothing.
    transact(fn) {
      load();
      const result = fn(data);
      if (result && result.ok === false) return result;
      data = sanitize(data);
      const saved = persist();
      return { ok: true, ...result, saved };
    },
    update(fn) { this.transact((d) => { fn(d); }); },
    reset() {
      data = defaultSave();
      if (available) {
        try { backend.removeItem(SAVE_KEY); } catch { available = false; }
      }
    },
  };
}

function safeLocalStorage() {
  try {
    const ls = window.localStorage;
    const probe = SAVE_KEY + ':probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
