// Rules shared by the game and the scores API. `.mjs` so the Vercel function can import it.
import { KEEPER_SCORE } from './score-values.mjs';

export const TOP_COUNT = 10;
export const NAME_MAX = 12;
const MAX_UNDEAD = 18, MAX_SEALS = 3, MAX_HEALTH = 3, MAX_BREACHES = 3;

// A small list, checked after undoing common letter swaps. It catches the obvious, not everything.
// Short words only match whole words, so "Peacock" and "Grape" stay allowed.
const BLOCKED_ANYWHERE = ['fuck', 'shit', 'cunt', 'nigg', 'bitch', 'hitler', 'whore', 'slut', 'pussy', 'asshole', 'retard', 'kike', 'chink'];
const BLOCKED_WORDS = ['fag', 'rape', 'nazi', 'dick', 'cock', 'spic'];
const SWAPS = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', $: 's', '@': 'a' };

export function cleanName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, reason: 'Enter a name.' };
  if (name.length > NAME_MAX) return { ok: false, reason: `Use ${NAME_MAX} characters or fewer.` };
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) return { ok: false, reason: 'Use letters, numbers, spaces, - or _ only.' };
  const words = name.toLowerCase().replace(/[013457$@]/g, (c) => SWAPS[c]).split(/[^a-z]+/);
  const plain = words.join('');
  if (BLOCKED_ANYWHERE.some((w) => plain.includes(w)) || words.some((w) => BLOCKED_WORDS.includes(w))) {
    return { ok: false, reason: 'Please choose a different name.' };
  }
  return { ok: true, name };
}

const count = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

// Recomputes the score from the run's totals and rejects anything the game can't produce.
// A browser game can't prove a run really happened; this only stops impossible results.
export function checkRun(r) {
  if (!r || typeof r !== 'object') return 'Bad run.';
  const { score, time, defeated, souls, seals, health, breaches, result } = r;
  if (result !== 'victory' && result !== 'defeat') return 'Bad result.';
  if (!count(defeated, MAX_UNDEAD) || !count(souls, defeated) || !count(seals, MAX_SEALS)) return 'Impossible totals.';
  if (!count(health, MAX_HEALTH) || !count(breaches, MAX_BREACHES)) return 'Impossible totals.';
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0 || time > 86400) return 'Bad time.';
  const v = KEEPER_SCORE;
  let expected = defeated * v.defeat + souls * v.soul + seals * v.seal;
  if (result === 'victory') {
    if (seals !== MAX_SEALS || health < 1 || breaches >= MAX_BREACHES) return 'Impossible win.';
    expected += health * v.healthBonus + (MAX_BREACHES - breaches) * v.breachBonus;
  }
  if (score !== expected) return 'Score does not add up.';
  if (score <= 0) return 'Nothing to post.';
  // Undead rise at most about one every 1.7 seconds.
  if (time < (defeated - 1) * 1.5) return 'Too fast.';
  return null;
}
