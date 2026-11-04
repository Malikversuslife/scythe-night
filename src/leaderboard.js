// Browser side of the shared leaderboard.
const URL_BASE = '/api/scores';

async function read(res) {
  let data = null;
  try { data = await res.json(); } catch { /* not JSON: treated as unavailable below */ }
  if (res.ok && data) return { ok: true, ...data };
  // 4xx messages are written for the player; anything else just means we can't reach it.
  return { ok: false, error: res.status >= 400 && res.status < 500 && data?.error ? data.error : 'The leaderboard is unavailable right now.' };
}

const offline = () => ({ ok: false, error: 'The leaderboard is unavailable right now.' });

export async function fetchBoard(playerId, fetchFn = fetch) {
  try {
    return await read(await fetchFn(`${URL_BASE}?player=${encodeURIComponent(playerId)}`));
  } catch {
    return offline();
  }
}

export async function submitScore(playerId, name, run, fetchFn = fetch) {
  try {
    return await read(await fetchFn(URL_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name, run }),
    }));
  } catch {
    return offline();
  }
}
