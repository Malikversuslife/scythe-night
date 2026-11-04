// Scores logic, kept apart from HTTP and Cloudflare so it can be tested with a fake database.
// (Vercel doesn't route files starting with an underscore.)
import { TOP_COUNT, cleanName, checkRun } from '../src/leaderboard-rules.mjs';

const ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

const TOP_SQL = `SELECT name, score, time_s FROM scores ORDER BY score DESC, time_s ASC, created_at ASC LIMIT ${TOP_COUNT}`;
const MINE_SQL = 'SELECT score, time_s FROM scores WHERE player_id = ?';
const RANK_SQL = 'SELECT COUNT(*) + 1 AS rank FROM scores WHERE score > ? OR (score = ? AND time_s < ?)';
// One row per player: only a better result replaces the old one.
const SAVE_SQL = `INSERT INTO scores (player_id, name, score, time_s, created_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(player_id) DO UPDATE SET name = excluded.name, score = excluded.score, time_s = excluded.time_s, created_at = excluded.created_at
  WHERE excluded.score > scores.score OR (excluded.score = scores.score AND excluded.time_s < scores.time_s)`;

async function standing(db, playerId) {
  if (!playerId || !ID_PATTERN.test(playerId)) return null;
  const [mine] = await db(MINE_SQL, [playerId]);
  if (!mine) return null;
  const [{ rank }] = await db(RANK_SQL, [mine.score, mine.score, mine.time_s]);
  return { rank, score: mine.score, time: mine.time_s };
}

const toEntry = (row, i) => ({ rank: i + 1, name: row.name, score: row.score, time: row.time_s });

export async function getBoard(db, playerId) {
  const rows = await db(TOP_SQL, []);
  return { status: 200, body: { top: rows.map(toEntry), you: await standing(db, playerId) } };
}

export async function postScore(db, body, now) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.playerId !== 'string' || !ID_PATTERN.test(b.playerId)) return { status: 400, body: { error: 'Bad player.' } };
  const name = cleanName(b.name);
  if (!name.ok) return { status: 400, body: { error: name.reason } };
  const problem = checkRun(b.run);
  if (problem) return { status: 422, body: { error: problem } };
  await db(SAVE_SQL, [b.playerId, name.name, b.run.score, Math.round(b.run.time * 100) / 100, now]);
  const rows = await db(TOP_SQL, []);
  return { status: 200, body: { top: rows.map(toEntry), you: await standing(db, b.playerId) } };
}
