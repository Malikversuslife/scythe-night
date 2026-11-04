// Browser side of the shared leaderboard: two public Supabase database functions.
// The publishable key is meant to be public. The functions in supabase/leaderboard.sql
// do the checking, and nobody can touch the table directly.
const API = 'https://ieijitlqbyiuiwqjxavt.supabase.co/rest/v1/rpc';
const KEY = 'sb_publishable_-llQKA4a_CUu7THlYelQnA_ahDbDqGV';
const UNAVAILABLE = 'The leaderboard is unavailable right now.';

async function call(fn, args, fetchFn) {
  try {
    const res = await fetchFn(`${API}/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    if (!res.ok || !data) return { ok: false, error: UNAVAILABLE };
    // A refusal from submit_score is written for the player.
    if (data.error) return { ok: false, error: data.error };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export const fetchBoard = (playerId, fetchFn = fetch) =>
  call('get_leaderboard', { p_player: playerId }, fetchFn);

export const submitScore = (playerId, name, run, fetchFn = fetch) =>
  call('submit_score', { p_player: playerId, p_name: name, p_run: run }, fetchFn);
