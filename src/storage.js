// Versioned, namespaced local save. Falls back to memory when storage is unavailable.

const KEY = 'scythe-night:save';
export const SAVE_VERSION = 1;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    settings: { music: 60, sfx: 80, muted: false, reducedMotion: 'system' },
    keeperBest: 0,
    completed: { keeper: false, survivor: false },
    tutorialSeen: { keeper: false, survivor: false },
  };
}

const clampInt = (v, lo, hi, fallback) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;

// Accepts anything (including older or corrupted records) and returns a valid save.
export function sanitize(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    version: SAVE_VERSION,
    settings: {
      music: clampInt(s.music, 0, 100, d.settings.music),
      sfx: clampInt(s.sfx, 0, 100, d.settings.sfx),
      muted: s.muted === true,
      reducedMotion: ['system', 'on', 'off'].includes(s.reducedMotion) ? s.reducedMotion : 'system',
    },
    keeperBest: clampInt(raw.keeperBest, 0, 1e9, 0),
    completed: {
      keeper: raw.completed?.keeper === true,
      survivor: raw.completed?.survivor === true,
    },
    tutorialSeen: {
      keeper: raw.tutorialSeen?.keeper === true,
      survivor: raw.tutorialSeen?.survivor === true,
    },
  };
}

export function createStore(backend = safeLocalStorage()) {
  let available = !!backend;
  let data = defaultSave();
  if (available) {
    try {
      const text = backend.getItem(KEY);
      data = sanitize(text ? JSON.parse(text) : null);
    } catch {
      data = defaultSave();
    }
  }

  function persist() {
    if (!available) return;
    try {
      backend.setItem(KEY, JSON.stringify(data));
    } catch {
      available = false;
    }
  }

  return {
    get data() { return data; },
    get available() { return available; },
    update(fn) { fn(data); data = sanitize(data); persist(); },
    reset() {
      data = defaultSave();
      if (available) {
        try { backend.removeItem(KEY); } catch { available = false; }
      }
    },
  };
}

function safeLocalStorage() {
  try {
    const ls = window.localStorage;
    const probe = KEY + ':probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
