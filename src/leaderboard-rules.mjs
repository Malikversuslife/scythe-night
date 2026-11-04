// Instant feedback on the name field. The database applies the same name rules for real,
// along with the run checks, in supabase/leaderboard.sql.

export const TOP_COUNT = 10;
export const NAME_MAX = 12;

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
