// GET /api/scores?player=<id>  top 10, plus this player's standing
// POST /api/scores             submit a Keeper run; only a player's best is kept
// Talks to Cloudflare D1 over its REST API. The token stays on the server.
import { getBoard, postScore } from './_scores.mjs';

function d1() {
  const { CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_API_TOKEN } = process.env;
  if (!CF_ACCOUNT_ID || !CF_D1_DATABASE_ID || !CF_API_TOKEN) return null;
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;
  return async (sql, params) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(`D1 query failed (${res.status})`);
    return data.result[0].results;
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const db = d1();
  if (!db) return res.status(503).json({ error: 'Leaderboard is not set up.' });
  try {
    if (req.method === 'GET') {
      const out = await getBoard(db, req.query?.player);
      return res.status(out.status).json(out.body);
    }
    if (req.method === 'POST') {
      const out = await postScore(db, req.body, Date.now());
      return res.status(out.status).json(out.body);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Leaderboard is unavailable right now.' });
  }
}
