import { createKeeperRun, stepKeeper, KEEPER } from '../src/keeper.js';
import { createSurvivorRun, stepSurvivor, interactionTarget, canSee, distractionLanding, TASKS, PATROLS, SURVIVOR } from '../src/survivor.js';
import { distanceField, isSolid, lineOfSight, moveCircle } from '../src/world.js';
import { sanitize, createStore, defaultSave } from '../src/storage.js';
import { COSMETICS, ACHIEVEMENTS, MISSIONS, JOURNAL_TIERS } from '../src/catalog.js';
import { cleanName } from '../src/leaderboard-rules.mjs';
import { RIGS, GAITS, drawRig, facingView, pose, undeadRig } from '../src/rig.js';
import { createAnimator } from '../src/render-common.js';
import { fetchBoard, submitScore } from '../src/leaderboard.js';
import { boardRowsHtml } from '../src/screens.js';
import {
  commitRun, runLoadout, buyCosmetic, equipCosmetic, buyUpgrade, achievementStatus, claimAchievement,
  missionStatus, claimMission, claimDaily, dailyStatus, nextResetMs, journalTierStatus, claimJournalTier,
  hasJournalBadge, claimableCounts,
} from '../src/progress.js';

const results = [];
const pending = [];
function test(name, fn) {
  const entry = { name, ok: true };
  results.push(entry);
  const fail = (e) => { entry.ok = false; entry.err = e.stack || String(e); };
  try {
    const out = fn();
    if (out?.then) pending.push(out.catch(fail));
  } catch (e) { fail(e); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'expected equal'}: got ${a}, expected ${b}`); }

const IDLE = { x: 0, y: 0, action: false };
const DT = 1 / 60;
const tick = (run, step, inp = IDLE, n = 1) => { let ev = []; for (let i = 0; i < n; i++) ev = ev.concat(step(run, inp, DT)); return ev; };

function activeEnemy(run, x, y) {
  const e = { id: run.nextId++, x, y, r: KEEPER.enemyRadius, state: 'active', rise: 0, target: null, speed: 0, fx: 0, fy: 1 };
  run.enemies.push(e);
  return e;
}

// Stop the wave from spawning so tests control every enemy.
function quiet(run) { run.queue = 0; run.spawnTimer = 1e9; return run; }

// ---------------- Keeper ----------------

test('Keeper map: every breach, the start and the gate are connected', () => {
  const run = createKeeperRun(1);
  const { map, gateField } = run;
  for (const s of run.spawns) assert(gateField[s.r * map.w + s.c] > 0, `spawn ${s.c},${s.r} cannot reach gate`);
  const p = map.marks.P[0];
  assert(gateField[p.r * map.w + p.c] > 0, 'start cannot reach gate');
});

test('Keeper: third valid hit loses the run', () => {
  const run = quiet(createKeeperRun(2));
  for (let i = 0; i < 3; i++) {
    run.enemies = [];
    activeEnemy(run, run.player.x, run.player.y);
    run.invuln = 0;
    tick(run, stepKeeper);
  }
  eq(run.health, 0, 'health');
  eq(run.outcome?.result, 'defeat');
  eq(run.outcome?.reason, 'health');
});

test('Keeper: overlapping enemies cost only one health (invulnerability)', () => {
  const run = quiet(createKeeperRun(3));
  activeEnemy(run, run.player.x, run.player.y);
  activeEnemy(run, run.player.x + 0.1, run.player.y);
  activeEnemy(run, run.player.x - 0.1, run.player.y);
  tick(run, stepKeeper, IDLE, 30); // half a second of contact
  eq(run.health, 2);
  assert(!run.outcome, 'should still be alive');
});

test('Keeper: third breach loses even at full health', () => {
  const run = quiet(createKeeperRun(4));
  const g = run.gate;
  for (let i = 0; i < 3; i++) {
    const e = activeEnemy(run, g.c + 0.5, g.r + 0.5);
    e.target = null;
    tick(run, stepKeeper);
  }
  eq(run.breaches, 3);
  eq(run.health, 3);
  eq(run.outcome?.reason, 'breach');
});

test('Keeper: slash never hits through a wall', () => {
  const run = quiet(createKeeperRun(5));
  // Row 8 is "#....#P#....#": walls at columns 5 and 7 beside the start tile.
  run.player.x = 4.5; run.player.y = 8.5; run.player.fx = 1; run.player.fy = 0;
  const e = activeEnemy(run, 6.5, 8.5); // 2 tiles away, wall at column 5 in between
  // Bring it into range but keep the wall between them.
  e.x = 5.85; e.y = 8.5;
  run.player.x = 4.7;
  assert(isSolid(run.map, 5, 8), 'expected wall');
  tick(run, stepKeeper, { x: 0, y: 0, action: true });
  eq(run.enemies.length, 1, 'enemy behind wall must survive');
  eq(run.stats.defeated, 0);
});

test('Keeper: slash hits an enemy in front, and each soul scores exactly once', () => {
  const run = quiet(createKeeperRun(6));
  run.player.x = 2.5; run.player.y = 15.5; run.player.fx = 1; run.player.fy = 0;
  activeEnemy(run, 3.4, 15.5);
  tick(run, stepKeeper, { x: 0, y: 0, action: true });
  eq(run.stats.defeated, 1);
  eq(run.score, KEEPER.score.defeat);
  eq(run.souls.length, 1);
  // Soul spawned within pickup range? Walk onto it and stand there.
  run.player.x = run.souls[0].x; run.player.y = run.souls[0].y;
  tick(run, stepKeeper, IDLE, 20);
  eq(run.stats.souls, 1);
  eq(run.score, KEEPER.score.defeat + KEEPER.score.soul);
});

test('Keeper: slash cooldown limits one swing per 450 ms', () => {
  const run = quiet(createKeeperRun(7));
  let slashes = 0;
  for (let i = 0; i < 60; i++) slashes += stepKeeper(run, { x: 0, y: 0, action: true }, DT).filter((e) => e.type === 'slash').length;
  eq(slashes, 3, 'slashes in one second'); // t=0, 0.45, 0.90
});

test('Keeper: enemies only spawn on breach tiles and at least 3 tiles from the player', () => {
  const run = createKeeperRun(8);
  run.player.x = run.spawns[0].c + 0.5; run.player.y = run.spawns[0].r + 0.5; // camp a breach
  const ev = tick(run, stepKeeper, IDLE, 60 * 6);
  const spawns = ev.filter((e) => e.type === 'spawn');
  assert(spawns.length > 0, 'something spawned');
  for (const s of spawns) {
    assert(run.spawns.some((t) => t.c + 0.5 === s.x && t.r + 0.5 === s.y), 'spawned off a breach tile');
    assert(Math.hypot(s.x - (run.spawns[0].c + 0.5), s.y - (run.spawns[0].r + 0.5)) >= KEEPER.spawnMinPlayerDist, 'spawned beside player');
  }
});

test('Keeper: at most 4 undead are active at once', () => {
  const run = createKeeperRun(9);
  run.wave = 2; run.queue = 8;
  run.player.x = 6.5; run.player.y = 8.5;
  let peak = 0;
  for (let i = 0; i < 60 * 20 && !run.outcome; i++) {
    stepKeeper(run, IDLE, DT);
    run.invuln = 1; // ignore contact for this test
    peak = Math.max(peak, run.enemies.length);
  }
  assert(peak <= KEEPER.maxActive, `peak ${peak}`);
});

// Scripted "perfect" player: teleports beside each active undead, slashes, collects souls, touches seals.
function playPerfectKeeper(run) {
  for (let guard = 0; guard < 60 * 600 && !run.outcome; guard++) {
    let inp = IDLE;
    const target = run.enemies.find((e) => e.state === 'active');
    if (target) {
      run.player.x = target.x - 0.8 < 1.3 ? target.x + 0.8 : target.x - 0.8;
      run.player.y = target.y;
      if (isSolid(run.map, Math.floor(run.player.x), Math.floor(run.player.y))) { run.player.x = target.x; run.player.y = target.y - 0.01; }
      run.player.fx = Math.sign(target.x - run.player.x) || 1; run.player.fy = 0;
      inp = { x: 0, y: 0, action: true };
    } else if (run.souls.length) {
      run.player.x = run.souls[0].x; run.player.y = run.souls[0].y;
    } else if (run.seal) {
      run.player.x = run.seal.x; run.player.y = run.seal.y;
    } else {
      run.player.x = 6.5; run.player.y = 8.5;
    }
    run.invuln = 1; // the script stands on enemies; this test is about wave flow and scoring
    stepKeeper(run, inp, DT);
  }
}

test('Keeper: all three waves can be won and the score adds up', () => {
  const run = createKeeperRun(10);
  playPerfectKeeper(run);
  eq(run.outcome?.result, 'victory', 'outcome');
  const total = 4 + 6 + 8;
  eq(run.stats.defeated + run.breaches, total, 'every undead resolved');
  eq(run.stats.souls, run.stats.defeated, 'every soul collected');
  eq(run.stats.seals, 3);
  const expected = run.stats.defeated * 10 + run.stats.souls * 25 + 300 + run.health * 100 + (3 - run.breaches) * 50;
  eq(run.score, expected, 'score');
});

test('Keeper: defeat takes precedence over a same-step win', () => {
  const run = quiet(createKeeperRun(11));
  run.wave = 2; run.phase = 'seal'; run.seal = { x: run.player.x, y: run.player.y };
  run.health = 1; run.invuln = 0;
  activeEnemy(run, run.player.x, run.player.y);
  tick(run, stepKeeper);
  eq(run.outcome?.result, 'defeat');
});

test('Keeper: a souls left on the ground blocks the seal (nothing is discarded)', () => {
  const run = quiet(createKeeperRun(12));
  run.souls.push({ id: 99, x: 1.5, y: 17.5, born: 0 });
  run.player.x = 11.5; run.player.y = 15.5;
  tick(run, stepKeeper, IDLE, 10);
  eq(run.phase, 'wave');
  eq(run.souls.length, 1);
});

test('Keeper: retry creates a clean run', () => {
  const a = createKeeperRun(13);
  a.health = 1; a.score = 500; a.breaches = 2;
  const b = createKeeperRun(13);
  eq(b.health, 3); eq(b.score, 0); eq(b.breaches, 0); eq(b.wave, 0);
});

test('Collision: the player cannot walk through walls', () => {
  const run = quiet(createKeeperRun(14));
  for (let i = 0; i < 120; i++) stepKeeper(run, { x: 1, y: 0, action: false }, DT);
  // Start (6,8) is boxed by walls at columns 5 and 7.
  assert(run.player.x < 7 - run.player.r + 1e-6, `x=${run.player.x}`);
  for (let i = 0; i < 60 * 10; i++) stepKeeper(quiet(run), { x: 0.7071, y: 0.7071, action: false }, DT);
  const p = run.player;
  assert(!isSolid(run.map, Math.floor(p.x), Math.floor(p.y)), 'ended inside a wall');
});

test('Movement: diagonal speed is normalized', () => {
  const m = { x: 0.5, y: 0.5 };
  const len = Math.hypot(m.x * 2, m.y * 2);
  assert(len > 1); // raw input can exceed 1; input.read() normalizes (see input.js)
  const run = quiet(createKeeperRun(15));
  run.player.x = 5.5; run.player.y = 15.5; // open ground to the lower right
  const x0 = run.player.x, y0 = run.player.y;
  stepKeeper(run, { x: Math.SQRT1_2, y: Math.SQRT1_2, action: false }, 0.1);
  const d = Math.hypot(run.player.x - x0, run.player.y - y0);
  assert(Math.abs(d - KEEPER.playerSpeed * 0.1) < 1e-6, `moved ${d}`);
});

// ---------------- Survivor ----------------

test('Survivor map: start, every task object and the door are reachable', () => {
  const run = createSurvivorRun();
  const { map } = run;
  const start = map.marks.P[0];
  const field = distanceField(map, [start]);
  const reachableNeighbour = (t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => field[(t.r + dy) * map.w + t.c + dx] >= 0);
  for (const t of TASKS) assert(reachableNeighbour(run.objects[t.id]), `${t.id} unreachable`);
  assert(reachableNeighbour(run.door), 'door unreachable');
});

test('Survivor: patrol routes run along open street', () => {
  const run = createSurvivorRun();
  for (const route of PATROLS) {
    for (let i = 0; i < route.length; i++) {
      const [c0, r0] = route[i], [c1, r1] = route[(i + 1) % route.length];
      assert(c0 === c1 || r0 === r1, 'route legs must be straight');
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
        for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
          assert(!isSolid(run.map, c, r), `route crosses solid tile ${c},${r}`);
    }
  }
});

test('Survivor: the starting area is never visible from any point on any patrol', () => {
  const run = createSurvivorRun();
  const start = { x: run.player.x, y: run.player.y };
  // Check the start tile and its open neighbours.
  const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: start.x + dx, y: start.y + dy }))
    .filter((s) => !isSolid(run.map, Math.floor(s.x), Math.floor(s.y)));
  for (const route of PATROLS) {
    for (let i = 0; i < route.length; i++) {
      const [c0, r0] = route[i], [c1, r1] = route[(i + 1) % route.length];
      for (let k = 0; k <= 40; k++) {
        const zx = c0 + 0.5 + ((c1 - c0) * k) / 40, zy = r0 + 0.5 + ((r1 - r0) * k) / 40;
        for (const s of spots) {
          const seen = Math.hypot(zx - s.x, zy - s.y) <= SURVIVOR.detectRange && lineOfSight(run.map, zx, zy, s.x, s.y);
          assert(!seen, `patrol ${route} sees start area ${s.x},${s.y} from ${zx.toFixed(1)},${zy.toFixed(1)}`);
        }
      }
    }
  }
});

test('Survivor: standing still at the start for 60 s is safe', () => {
  const run = createSurvivorRun();
  for (let i = 0; i < 60 * 60 && !run.outcome; i++) stepSurvivor(run, IDLE, DT);
  assert(!run.outcome, 'caught while idle at the start');
});

test('Survivor: zombies cannot see through walls', () => {
  const run = createSurvivorRun();
  const z = run.zombies[0];
  // Row 20 "####.#.#.####": stand at (5,21) under the wall at (5,20) with a zombie at (5,19).
  z.x = 5.5; z.y = 19.5;
  run.player.x = 5.5; run.player.y = 21.5;
  assert(isSolid(run.map, 5, 20));
  assert(!canSee(run, z), 'saw through a wall');
  run.player.x = 6.5; run.player.y = 21.5; z.x = 6.5;
  assert(canSee(run, z), 'should see down the open alley');
});

function standBeside(run, tile) {
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (!isSolid(run.map, tile.c + dx, tile.r + dy)) { run.player.x = tile.c + dx + 0.5; run.player.y = tile.r + dy + 0.5; return; }
  }
  throw new Error('no free side');
}

function noZombies(run) { run.zombies = []; return run; }
const press = { x: 0, y: 0, action: true };

test('Survivor: tasks cannot be skipped and the refuge stays locked', () => {
  const run = noZombies(createSurvivorRun());
  standBeside(run, run.objects.bell);
  let ev = stepSurvivor(run, press, DT);
  assert(ev.some((e) => e.type === 'denied'), 'bell should be denied');
  eq(run.done.bell, false);
  standBeside(run, run.objects.power);
  stepSurvivor(run, press, DT);
  eq(run.done.power, false);
  // Walking into the locked door does nothing.
  run.player.x = 6.5; run.player.y = 2.5;
  for (let i = 0; i < 60; i++) stepSurvivor(run, { x: 0, y: -1, action: false }, DT);
  assert(!run.outcome, 'entered a locked refuge');
  assert(run.player.y > 2 + run.player.r - 1e-6, 'walked through locked door');
});

test('Survivor: tasks complete once each and the full route wins', () => {
  const run = noZombies(createSurvivorRun());
  for (const t of TASKS) {
    standBeside(run, run.objects[t.id]);
    const it = interactionTarget(run);
    assert(it?.enabled, `${t.id} should be available`);
    const ev = stepSurvivor(run, press, DT);
    eq(ev.filter((e) => e.type === 'task').length, 1, `${t.id} completes`);
    const again = stepSurvivor(run, press, DT);
    eq(again.filter((e) => e.type === 'task').length, 0, `${t.id} awarded twice`);
  }
  assert(run.doorOpen, 'door opens after bell');
  run.player.x = 6.5; run.player.y = 2.5;
  for (let i = 0; i < 60 && !run.outcome; i++) stepSurvivor(run, { x: 0, y: -1, action: false }, DT);
  eq(run.outcome?.result, 'victory');
});

test('Survivor: one zombie contact loses', () => {
  const run = createSurvivorRun();
  const z = run.zombies[0];
  z.x = run.player.x + 0.2; z.y = run.player.y;
  stepSurvivor(run, IDLE, DT);
  eq(run.outcome?.result, 'defeat');
});

test('Survivor: a zombie that loses sight gives up after 3 s and returns to patrol', () => {
  const run = createSurvivorRun();
  run.zombies = [run.zombies[2]]; // row 9 patrol
  const z = run.zombies[0];
  z.x = 6.5; z.y = 9.5;
  run.player.x = 6.5; run.player.y = 11.5; // straight below through (6,10) '.'
  stepSurvivor(run, IDLE, DT);
  eq(z.state, 'chase');
  // Teleport the player far away behind buildings.
  run.player.x = 1.5; run.player.y = 23.5;
  for (let i = 0; i < 60 * 3.2; i++) stepSurvivor(run, IDLE, DT);
  assert(z.state === 'return' || z.state === 'patrol', `state ${z.state}`);
  for (let i = 0; i < 60 * 15 && z.state !== 'patrol'; i++) stepSurvivor(run, IDLE, DT);
  eq(z.state, 'patrol');
});

test('Survivor: player outruns a chasing zombie', () => {
  assert(SURVIVOR.playerSpeed > SURVIVOR.chaseSpeed);
});

test('Survivor: an honest run (keyboard pathing, real zombies) can reach the refuge', () => {
  // Greedy walker on the street grid that waits when a zombie could see the next tile.
  const run = createSurvivorRun();
  const goals = () => {
    const i = TASKS.findIndex((t) => !run.done[t.id]);
    return i >= 0 ? run.objects[TASKS[i].id] : run.door;
  };
  for (let i = 0; i < 60 * 240 && !run.outcome; i++) {
    const g = goals();
    const solid = (m, c, r) => (run.doorOpen && c === run.door.c && r === run.door.r ? false : isSolid(m, c, r));
    const field = distanceField(run.map, [g], () => false);
    const pc = Math.floor(run.player.x), pr = Math.floor(run.player.y);
    const it = interactionTarget(run);
    if (it?.enabled) { stepSurvivor(run, press, DT); continue; }
    // Walk BFS toward goal, routing around tiles a zombie can currently see (re-planned
    // every 10 ticks); fall back to the plain route when every way is watched.
    if (i % 10 === 0 || !run._botField) {
      const watched = (m, c, r) => solid(m, c, r) || run.zombies.some((z) =>
        Math.hypot(z.x - c - 0.5, z.y - r - 0.5) < SURVIVOR.detectRange + 0.5 && lineOfSight(m, z.x, z.y, c + 0.5, r + 0.5));
      let f = distanceField(run.map, [{ ...g, force: true }], watched);
      if (f[pr * run.map.w + pc] < 0) f = distanceField(run.map, [{ ...g, force: true }], solid);
      run._botField = f;
    }
    const f = run._botField;
    let best = null, bd = f[pr * run.map.w + pc];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const d = f[(pr + dy) * run.map.w + pc + dx];
      if (d >= 0 && d < bd && !solid(run.map, pc + dx, pr + dy)) { bd = d; best = { x: pc + dx + 0.5, y: pr + dy + 0.5 }; }
    }
    let tx = best ? best.x : pc + 0.5, ty = best ? best.y : pr + 0.5;
    // Danger: a zombie could see the next tile, or one is already close. Then step to the
    // neighbouring tile (or stay) that keeps the most distance from the nearest zombie.
    const nearest = (x, y) => Math.min(...run.zombies.map((z) => Math.hypot(z.x - x, z.y - y)));
    const seenAt = (x, y) => run.zombies.some((z) => Math.hypot(z.x - x, z.y - y) < SURVIVOR.detectRange + 0.8 && lineOfSight(run.map, z.x, z.y, x, y));
    if (seenAt(tx, ty) || nearest(run.player.x, run.player.y) < 2.2) {
      let bestScore = -Infinity;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (solid(run.map, pc + dx, pr + dy)) continue;
        const cx = pc + dx + 0.5, cy = pr + dy + 0.5;
        const score = nearest(cx, cy) - (seenAt(cx, cy) ? 3 : 0);
        if (score > bestScore) { bestScore = score; tx = cx; ty = cy; }
      }
    }
    let dx = tx - run.player.x, dy = ty - run.player.y;
    const len = Math.hypot(dx, dy);
    const inp = len < 0.05 ? IDLE : { x: dx / len, y: dy / len, action: false };
    void field;
    stepSurvivor(run, inp, DT);
  }
  if (run.outcome?.result === 'defeat') {
    const z = run.zombies.reduce((a, b) => (Math.hypot(a.x - run.player.x, a.y - run.player.y) < Math.hypot(b.x - run.player.x, b.y - run.player.y) ? a : b));
    window.__botDeath = { t: run.time.toFixed(1), p: [run.player.x.toFixed(1), run.player.y.toFixed(1)], zombie: z.id, zstate: z.state, done: run.done };
  }
  // This is a smoke test of solvability with timing; a careful human does better than this bot.
  assert(run.outcome?.result === 'victory', `bot result: ${run.outcome ? run.outcome.result : 'timeout'}; tasks ${JSON.stringify(run.done)}`);
});

// ---------------- Storage ----------------

const memBackend = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), raw: m };
};
const NOW = Date.UTC(2026, 10, 4, 12);

test('Save: a v1 save migrates without losing records or settings, and keeps a backup', () => {
  const v1 = JSON.stringify({ version: 1, settings: { music: 25, sfx: 40, muted: true, reducedMotion: 'on' }, keeperBest: 1840, completed: { keeper: true, survivor: false }, tutorialSeen: { keeper: true, survivor: false } });
  const b = memBackend({ 'scythe-night:save': v1 });
  const s = createStore(b);
  eq(s.data.version, 2);
  eq(s.data.settings.music, 25);
  eq(s.data.settings.muted, true);
  eq(s.data.records.keeperBest.score, 1840);
  eq(s.data.records.completions.keeper, 1);
  eq(s.data.lifetimeStats.keeperWins, 1);
  eq(s.data.tutorialSeen.keeper, true);
  eq(s.data.wallet.graveCoins, 0);
  eq(b.getItem('scythe-night:save:backup-v1'), v1);
});

test('Save: corrupted data, bad numbers and unknown IDs fall back safely', () => {
  eq(JSON.stringify(sanitize(null)), JSON.stringify(defaultSave()));
  const s = sanitize({ version: 2, settings: { music: 'loud', sfx: 400, reducedMotion: 'maybe' },
    wallet: { graveCoins: -50 }, ownedCosmeticIds: ['pip-moon', 'not-real', 'pip-default'],
    equippedByCampaign: { keeper: { appearance: 'pip-moss', weapon: 'mara-amber' } },
    upgradeLevels: { soulReach: 99, pulseRecovery: -3, nonsense: 2 }, claimedAchievementIds: ['fake'] });
  eq(s.settings.music, 60); eq(s.settings.sfx, 100); eq(s.settings.reducedMotion, 'system');
  eq(s.wallet.graveCoins, 0);
  eq(s.ownedCosmeticIds.join(), 'pip-moon');
  eq(s.equippedByCampaign.keeper.appearance, 'pip-default', 'cannot equip what is not owned');
  eq(s.equippedByCampaign.keeper.weapon, 'scythe-default', 'cannot equip into the wrong slot');
  eq(s.upgradeLevels.soulReach, 2); eq(s.upgradeLevels.pulseRecovery, 0);
  eq(s.upgradeLevels.nonsense, undefined);
  eq(s.claimedAchievementIds.length, 0);
  const b = memBackend({ 'scythe-night:save': '{not json' });
  eq(createStore(b).data.wallet.graveCoins, 0);
  eq(b.getItem('scythe-night:save:corrupt'), '{not json', 'the unreadable copy is kept');
});

test('Save: blocked storage works in memory and reports it was not saved; reset clears', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const s = createStore(broken);
  const r = s.transact((d) => { d.wallet.graveCoins = 123; return {}; });
  eq(r.saved, false);
  eq(s.available, false);
  eq(s.data.wallet.graveCoins, 123);
  const b = memBackend();
  const s2 = createStore(b);
  eq(s2.transact((d) => { d.wallet.graveCoins = 50; return {}; }).saved, true);
  eq(createStore(b).data.wallet.graveCoins, 50, 'survives a reload');
  s2.reset();
  eq(createStore(b).data.wallet.graveCoins, 0);
});

test('Save: two tabs on one save cannot double-spend or undo each other', () => {
  const b = memBackend();
  const a = createStore(b), other = createStore(b);
  a.transact((d) => { d.wallet.graveCoins = 100; return {}; });
  eq(other.transact((d) => buyCosmetic(d, 'pip-moon', NOW)).ok, true, 'the stale tab reads the new balance first');
  const again = a.transact((d) => buyCosmetic(d, 'pip-moon', NOW));
  eq(again.ok, false);
  eq(again.reason, 'owned');
  eq(createStore(b).data.wallet.graveCoins, 0);
  a.transact((d) => { d.wallet.graveCoins += 5; return {}; });
  eq(createStore(b).data.ownedCosmeticIds.join(), 'pip-moon', 'the other tab\'s purchase is not overwritten');
});

// ---------------- Economy ----------------

const keeperSummary = (over = {}) => ({ id: 'r1', campaign: 'keeper', eventId: null, result: 'defeat', time: 60, score: 300, upgrades: {}, souls: 0, seals: 0, breaches: 0, tasks: 0, ...over });
const survivorSummary = (over = {}) => ({ id: 's1', campaign: 'survivor', eventId: null, result: 'defeat', time: 60, score: null, upgrades: {}, souls: 0, seals: 0, breaches: 0, tasks: 0, ...over });

test('Rewards: Keeper pays 1 per soul, 10 per seal, 30 for victory; XP matches', () => {
  const s = defaultSave();
  const r = commitRun(s, keeperSummary({ result: 'victory', souls: 18, seals: 3 }), NOW);
  eq(r.coins, 18 + 30 + 30);
  eq(r.xp, 18 * 2 + 3 * 10 + 30);
  eq(s.wallet.graveCoins, 78);
  eq(s.nightJournal.xp, 96);
  eq(r.walletBefore, 0); eq(r.walletAfter, 78);
});

test('Rewards: Survivor pays 10 per task, 30 for the refuge; a defeat keeps earned actions only', () => {
  const s = defaultSave();
  const win = commitRun(s, survivorSummary({ id: 'a', result: 'victory', tasks: 3 }), NOW);
  eq(win.coins, 60); eq(win.xp, 3 * 15 + 30);
  const lose = commitRun(s, survivorSummary({ id: 'b', tasks: 1 }), NOW);
  eq(lose.coins, 10); eq(lose.xp, 15);
  const none = commitRun(s, keeperSummary({ id: 'c' }), NOW);
  eq(none.coins, 0, 'no defeat bonus'); eq(none.xp, 0);
});

test('Rewards: the same run can never pay twice', () => {
  const s = defaultSave();
  const sum = keeperSummary({ souls: 5 });
  eq(commitRun(s, sum, NOW).ok, true);
  const again = commitRun(s, sum, NOW);
  eq(again.ok, false); eq(again.reason, 'duplicate');
  eq(s.wallet.graveCoins, 5);
  eq(s.lifetimeStats.souls, 5);
  eq(s.records.recentRuns.length, 1);
});

test('Rewards: runs under 10 active seconds still pay but do not count as played', () => {
  const s = defaultSave();
  eq(commitRun(s, keeperSummary({ id: 'x', time: 9, souls: 2 }), NOW).coins, 2);
  eq(s.lifetimeStats.countedRuns, 0);
  commitRun(s, keeperSummary({ id: 'y', time: 10 }), NOW);
  eq(s.lifetimeStats.countedRuns, 1);
});

test('Records: a Survivor failure never sets the fastest time; recent runs cap at 20', () => {
  const s = defaultSave();
  commitRun(s, survivorSummary({ id: 'fail', time: 5, tasks: 0 }), NOW);
  eq(s.records.survivorFastest, null);
  commitRun(s, survivorSummary({ id: 'w1', result: 'victory', time: 200, tasks: 3 }), NOW);
  commitRun(s, survivorSummary({ id: 'w2', result: 'victory', time: 150, tasks: 3 }), NOW);
  commitRun(s, survivorSummary({ id: 'w3', result: 'victory', time: 300, tasks: 3 }), NOW);
  eq(s.records.survivorFastest.time, 150);
  eq(s.records.completions.survivor, 3);
  for (let i = 0; i < 30; i++) commitRun(s, keeperSummary({ id: `k${i}` }), NOW);
  eq(s.records.recentRuns.length, 20);
});

// ---------------- Shop & upgrades ----------------

test('Shop: insufficient funds buys nothing; owned and free items cannot be bought', () => {
  const s = defaultSave();
  s.wallet.graveCoins = 99;
  const short = buyCosmetic(s, 'pip-moon', NOW);
  eq(short.ok, false); eq(short.reason, 'funds'); eq(short.need, 1);
  eq(s.wallet.graveCoins, 99); eq(s.ownedCosmeticIds.length, 0);
  s.wallet.graveCoins = 250;
  eq(buyCosmetic(s, 'pip-moon', NOW).ok, true);
  eq(s.wallet.graveCoins, 150);
  eq(buyCosmetic(s, 'pip-moon', NOW).reason, 'owned', 'a double tap cannot deduct twice');
  eq(s.wallet.graveCoins, 150);
  eq(buyCosmetic(s, 'pip-default', NOW).ok, false);
  eq(buyCosmetic(s, 'nope', NOW).ok, false);
});

test('Equip: needs ownership, fills its own slot, and defaults are always available', () => {
  const s = defaultSave();
  eq(equipCosmetic(s, 'pip-moon').reason, 'locked');
  s.ownedCosmeticIds.push('pip-moon', 'scythe-moon');
  eq(equipCosmetic(s, 'pip-moon').ok, true);
  eq(equipCosmetic(s, 'scythe-moon').ok, true);
  eq(s.equippedByCampaign.keeper.appearance, 'pip-moon');
  eq(s.equippedByCampaign.keeper.weapon, 'scythe-moon');
  eq(s.equippedByCampaign.survivor.appearance, 'mara-default', 'Pip gear never touches Mara');
  eq(equipCosmetic(s, 'pip-default').ok, true);
});

test('Cosmetics: every shop item has a real, distinct art change', () => {
  for (const c of COSMETICS.filter((x) => x.cost > 0)) assert(Object.keys(c.skin).length > 0, `${c.id} changes nothing`);
});

test('Upgrades: prices and levels follow the catalog; a repeated confirm buys one level', () => {
  const s = defaultSave();
  s.wallet.graveCoins = 500;
  eq(buyUpgrade(s, 'pulseRecovery', 0, NOW).spent, 100);
  eq(buyUpgrade(s, 'pulseRecovery', 0, NOW).reason, 'stale', 'same confirm twice');
  eq(s.wallet.graveCoins, 400);
  eq(buyUpgrade(s, 'pulseRecovery', 1, NOW).spent, 180);
  eq(buyUpgrade(s, 'pulseRecovery', 2, NOW).reason, 'max');
  eq(s.wallet.graveCoins, 220);
  const poor = defaultSave();
  eq(buyUpgrade(poor, 'soulReach', 0, NOW).reason, 'funds');
});

test('Upgrades: each level produces its displayed value in the run snapshot', () => {
  const s = defaultSave();
  const at = (id, level) => { s.upgradeLevels[id] = level; return runLoadout(s); };
  eq(at('pulseRecovery', 0).keeper.pulseCooldown, 18);
  eq(at('pulseRecovery', 1).keeper.pulseCooldown, 16);
  eq(at('pulseRecovery', 2).keeper.pulseCooldown, 14);
  eq(at('soulReach', 2).keeper.soulReach, 1.3);
  eq(at('distractRecovery', 2).survivor.distractCooldown, 18);
  eq(at('lastingRattle', 1).survivor.distractDuration, 3.5);
  const snap = runLoadout(s);
  s.upgradeLevels.pulseRecovery = 0;
  eq(snap.keeper.pulseCooldown, 14, 'a later menu change cannot alter a started run');
});

test('Soul Reach: the longer radius really collects from further away', () => {
  const near = (reach) => {
    const run = createKeeperRun(1, { soulReach: reach });
    run.queue = 0; run.spawnTimer = 1e9;
    run.player.x = 3.5; run.player.y = 15.5;
    run.souls.push({ id: 7, x: 3.5 + KEEPER.soulPickup * 1.1, y: 15.5, born: 0 });
    stepKeeper(run, IDLE, DT);
    return run.stats.souls;
  };
  eq(near(1), 0);
  eq(near(1.15), 1);
});

// ---------------- Achievements, missions ----------------

test('Achievements: states progress, claim pays once, and locked claims are refused', () => {
  const s = defaultSave();
  const def = ACHIEVEMENTS.find((a) => a.id === 'soul-guide');
  eq(achievementStatus(s, def).state, 'locked');
  eq(claimAchievement(s, 'soul-guide', NOW).ok, false);
  commitRun(s, keeperSummary({ id: 'a', souls: 20 }), NOW);
  eq(achievementStatus(s, def).state, 'progress');
  eq(achievementStatus(s, def).progress, 20);
  commitRun(s, keeperSummary({ id: 'b', souls: 40 }), NOW);
  eq(achievementStatus(s, def).state, 'unclaimed');
  const before = s.wallet.graveCoins;
  eq(claimAchievement(s, 'soul-guide', NOW).amount, 30);
  eq(claimAchievement(s, 'soul-guide', NOW).reason, 'claimed');
  eq(s.wallet.graveCoins, before + 30);
});

test('Achievements: wins, flawless wins and Both Sides read committed results', () => {
  const s = defaultSave();
  const st = (id) => achievementStatus(s, ACHIEVEMENTS.find((a) => a.id === id)).state;
  commitRun(s, keeperSummary({ id: 'a', result: 'victory', breaches: 1 }), NOW);
  eq(st('night-keeper'), 'unclaimed');
  eq(st('sealed-tight'), 'locked', 'a breach rules out Sealed Tight');
  commitRun(s, keeperSummary({ id: 'b', result: 'victory', breaches: 0 }), NOW);
  eq(st('sealed-tight'), 'unclaimed');
  eq(st('both-sides'), 'progress');
  commitRun(s, survivorSummary({ id: 'c', result: 'victory', tasks: 3 }), NOW);
  eq(st('still-here'), 'unclaimed');
  eq(st('both-sides'), 'unclaimed');
});

test('Missions: partial progress is kept across runs and each claims once', () => {
  const s = defaultSave();
  const def = MISSIONS.find((m) => m.id === 'free-souls');
  commitRun(s, keeperSummary({ id: 'a', souls: 6 }), NOW);
  eq(missionStatus(s, def).progress, 6);
  eq(claimMission(s, 'free-souls', NOW).ok, false);
  commitRun(s, keeperSummary({ id: 'b', souls: 6 }), NOW);
  eq(claimMission(s, 'free-souls', NOW).amount, 20);
  eq(claimMission(s, 'free-souls', NOW).reason, 'claimed');
});

// ---------------- Daily ----------------

test('Daily: one claim per UTC day, in track order, wrapping after step 7, with no reset on a gap', () => {
  const s = defaultSave();
  const day = (d, h = 12) => Date.UTC(2026, 10, d, h);
  eq(claimDaily(s, day(1)).amount, 10);
  eq(claimDaily(s, day(1, 23)).reason, 'claimed');
  eq(dailyStatus(s, Date.UTC(2026, 10, 1, 23, 59, 59)).state, 'claimed');
  eq(dailyStatus(s, Date.UTC(2026, 10, 2, 0, 0, 0)).state, 'ready', 'rolls over exactly at UTC midnight');
  eq(claimDaily(s, day(2)).amount, 15);
  eq(claimDaily(s, day(20)).amount, 20, 'missing days keeps the place');
  for (const [d, amount] of [[21, 25], [22, 30], [23, 40], [24, 60], [25, 10]]) eq(claimDaily(s, day(d)).amount, amount);
});

test('Daily: a clock moved backward cannot claim again until the date catches up', () => {
  const s = defaultSave();
  const day = (d) => Date.UTC(2026, 10, d, 12);
  claimDaily(s, day(10));
  eq(claimDaily(s, day(9)).reason, 'clock');
  eq(s.wallet.graveCoins, 10);
  eq(claimDaily(s, day(10)).reason, 'claimed');
  eq(claimDaily(s, day(11)).ok, true);
  eq(nextResetMs(day(10)), Date.UTC(2026, 10, 11));
});

// ---------------- Journal ----------------

test('Night Journal: tiers unlock by XP, claim independently, pay once, and award the badge', () => {
  const s = defaultSave();
  eq(claimJournalTier(s, 'tier-1', NOW).reason, 'locked');
  s.nightJournal.xp = 130;
  eq(journalTierStatus(s, JOURNAL_TIERS[1]), 'unclaimed');
  eq(claimJournalTier(s, 'tier-2', NOW).amount, 30);
  eq(claimJournalTier(s, 'tier-2', NOW).reason, 'claimed');
  eq(claimJournalTier(s, 'tier-1', NOW).amount, 20, 'tiers need not be claimed in order');
  eq(hasJournalBadge(s), false);
  s.nightJournal.xp = 500;
  const t5 = claimJournalTier(s, 'tier-5', NOW);
  eq(t5.amount, 80); eq(t5.badge, 'Journal Keeper');
  eq(hasJournalBadge(s), true);
  eq(s.wallet.graveCoins, 130);
  eq(s.nightJournal.xp, 500, 'claims earn no XP');
});

test('Badges: count only what can really be claimed, and opening screens changes nothing', () => {
  const s = defaultSave();
  eq(claimableCounts(s, NOW).total, 1, 'only today\'s daily');
  claimDaily(s, NOW);
  eq(claimableCounts(s, NOW).total, 0);
  commitRun(s, keeperSummary({ souls: 1 }), NOW);
  eq(claimableCounts(s, NOW).achievements, 1);
  eq(claimableCounts(s, NOW).achievements, 1);
});

// ---------------- Event ----------------

test('Event: first clear pays 50 once; replays pay nothing; standard progress is untouched', () => {
  const s = defaultSave();
  const ev = (o) => keeperSummary({ campaign: 'keeper', eventId: 'keepers-trial', souls: 14, seals: 2, ...o });
  const lose = commitRun(s, ev({ id: 'e0' }), NOW);
  eq(lose.coins, 0, 'a lost event pays nothing');
  const first = commitRun(s, ev({ id: 'e1', result: 'victory', score: 900 }), NOW);
  eq(first.coins, 50);
  const replay = commitRun(s, ev({ id: 'e2', result: 'victory', score: 1200 }), NOW);
  eq(replay.coins, 0);
  eq(s.wallet.graveCoins, 50);
  eq(s.events.bestByEvent['keepers-trial'], 1200);
  eq(s.events.completedIds.join(), 'keepers-trial');
  eq(s.lifetimeStats.souls, 0); eq(s.lifetimeStats.keeperWins, 0);
  eq(s.missionProgress.souls, 0); eq(s.nightJournal.xp, 0);
  eq(s.records.keeperBest, null); eq(s.records.completions.keeper, 0);
  eq(s.records.recentRuns[0].eventId, 'keepers-trial');
});

test('Event: the Trial run has 6 and 8 undead with no upgrades, and leaves standard rules alone', () => {
  const s = defaultSave();
  s.upgradeLevels.pulseRecovery = 2; s.upgradeLevels.soulReach = 2;
  const lo = runLoadout(s, 'keepers-trial');
  eq(lo.keeper.pulseCooldown, 18); eq(lo.keeper.soulReach, 1);
  eq(lo.upgrades.pulseRecovery, 0);
  const run = createKeeperRun(3, lo.keeper);
  eq(run.rules.waves.map((w) => w.count).join(), '6,8');
  eq(run.queue, 6);
  eq(createKeeperRun(3).rules.waves.map((w) => w.count).join(), '4,6,8');
  eq(KEEPER.waves.map((w) => w.count).join(), '4,6,8');
  eq(run.health, 3);
});

test('Event: the Trial can be played through to a win on its two waves', () => {
  const run = createKeeperRun(21, runLoadout(defaultSave(), 'keepers-trial').keeper);
  playPerfectKeeper(run);
  eq(run.outcome?.result, 'victory');
  eq(run.stats.seals, 2);
  eq(run.stats.defeated + run.breaches, 14);
});

// ---------------- Skills ----------------

test('Soul Pulse: pushes nearby undead, deals no damage, and goes on cooldown', () => {
  const run = quiet(createKeeperRun(30));
  run.player.x = 5.5; run.player.y = 15.5;
  const close = activeEnemy(run, 6.3, 15.5), far = activeEnemy(run, 10.5, 15.5);
  const ev = stepKeeper(run, { x: 0, y: 0, skill: true }, DT);
  eq(ev.find((e) => e.type === 'pulse').pushed, 1);
  eq(run.skillCooldown, 18);
  for (let i = 0; i < 20; i++) stepKeeper(run, IDLE, DT);
  assert(close.x > 7, `pushed away, x=${close.x}`);
  eq(far.push ?? null, null);
  eq(run.enemies.length, 2, 'no damage'); eq(run.stats.defeated, 0); eq(run.score, 0);
  eq(run.invuln, 0, 'grants no invulnerability');
});

test('Soul Pulse: cooldown runs on simulation time, starts ready, and blocks reuse', () => {
  const run = quiet(createKeeperRun(31, { pulseCooldown: 14 }));
  eq(run.skillCooldown, 0);
  stepKeeper(run, { x: 0, y: 0, skill: true }, DT);
  eq(run.skillCooldown, 14);
  const held = run.skillCooldown;
  const ev = stepKeeper(run, { x: 0, y: 0, skill: true }, DT);
  eq(ev.filter((e) => e.type === 'pulse').length, 0);
  assert(run.skillCooldown < held);
  const paused = run.skillCooldown; // paused means no steps run, so it holds
  eq(run.skillCooldown, paused);
  for (let i = 0; i < 60 * 15; i++) stepKeeper(run, IDLE, DT);
  eq(run.skillCooldown, 0);
});

test('Soul Pulse: undead are never shoved into walls, off the map or through the gate', () => {
  const run = quiet(createKeeperRun(32));
  // Stand above an undead pressed against the closed gate, then shove it downward.
  run.player.x = 6.5; run.player.y = 16.6;
  const atGate = activeEnemy(run, 6.5, 17.6);
  const atWall = activeEnemy(run, 5.5, 16.5); // a wall stands left of the opening on row 16
  stepKeeper(run, { x: 0, y: 0, skill: true }, DT);
  for (let i = 0; i < 20; i++) {
    stepKeeper(run, IDLE, DT);
    run.invuln = 1;
    if (atGate.push) { assert(atGate.y + atGate.r <= run.gate.r + 1e-6 || Math.floor(atGate.x) !== run.gate.c, `in gate at y=${atGate.y}`); }
    for (const e of [atGate, atWall]) assert(!isSolid(run.map, Math.floor(e.x), Math.floor(e.y)), `in solid tile at ${e.x},${e.y}`);
  }
  eq(run.breaches, 0, 'a shove is not a breach');
});

test('Soul Pulse: a pushed undead resumes its walk and can still reach the gate', () => {
  const run = quiet(createKeeperRun(33));
  run.player.x = 6.5; run.player.y = 13.5;
  const e = activeEnemy(run, 7.2, 13.5);
  e.speed = 2;
  stepKeeper(run, { x: 0, y: 0, skill: true }, DT);
  for (let i = 0; i < 60 * 30 && !run.breaches; i++) { run.invuln = 1; run.player.x = 1.5; run.player.y = 1.5; stepKeeper(run, IDLE, DT); }
  eq(run.breaches, 1);
});

const clearStart = (run) => { run.zombies = []; return run; };

test('Distraction: lands 2 tiles ahead on open street, and stops short of walls', () => {
  const run = clearStart(createSurvivorRun());
  run.player.x = 3.5; run.player.y = 13.5; run.player.fx = 1; run.player.fy = 0;
  const open = distractionLanding(run);
  assert(Math.abs(open.x - 5.5) < 0.06, `x=${open.x}`);
  // Row 9 is open, walls lie above: face the building from one tile away.
  run.player.x = 2.5; run.player.y = 9.5; run.player.fx = 0; run.player.fy = -1;
  eq(distractionLanding(run), null, 'a wall right ahead leaves no room');
  run.player.x = 1.5; run.player.y = 9.5;
  const blocked = distractionLanding(run);
  assert(blocked.y > 6.9 && !isSolid(run.map, Math.floor(blocked.x), Math.floor(blocked.y)), `y=${blocked.y}`);
});

test('Distraction: with no room it explains why and does not spend the cooldown', () => {
  const run = clearStart(createSurvivorRun());
  run.player.x = 2.5; run.player.y = 9.5; run.player.fx = 0; run.player.fy = -1;
  const ev = stepSurvivor(run, { x: 0, y: 0, skill: true }, DT);
  assert(ev.some((e) => e.type === 'skillDenied'));
  eq(run.skillCooldown, 0);
  eq(run.noise, null);
});

test('Distraction: zombies in earshot investigate for the set time, then return to patrol', () => {
  const run = createSurvivorRun({ distractDuration: 3 });
  const z = run.zombies[2]; // row 9 patrol
  run.zombies = [z];
  z.x = 2.5; z.y = 9.5; z.wp = 1;
  run.player.x = 6.5; run.player.y = 9.5; run.player.fx = -1; run.player.fy = 0; // lands at x=4.5
  stepSurvivor(run, { x: 0, y: 0, skill: true }, DT);
  eq(z.state, 'investigate');
  eq(run.skillCooldown, 22);
  run.player.x = 6.5; run.player.y = 23.5; // well out of sight
  for (let i = 0; i < 60 * 2.5; i++) stepSurvivor(run, IDLE, DT);
  eq(z.state, 'investigate');
  assert(Math.abs(z.x - 4.5) < 1.2, `walked to the noise, x=${z.x}`);
  for (let i = 0; i < 60; i++) stepSurvivor(run, IDLE, DT);
  assert(z.state === 'return' || z.state === 'patrol', `state ${z.state}`);
  for (let i = 0; i < 60 * 15 && z.state !== 'patrol'; i++) stepSurvivor(run, IDLE, DT);
  eq(z.state, 'patrol');
});

test('Distraction: Lasting Rattle lasts longer, and zombies out of earshot ignore it', () => {
  const run = createSurvivorRun({ distractDuration: 4 });
  const z = run.zombies[2];
  const far = run.zombies[0];
  run.zombies = [z, far];
  z.x = 2.5; z.y = 9.5;
  run.player.x = 6.5; run.player.y = 9.5; run.player.fx = -1; run.player.fy = 0;
  stepSurvivor(run, { x: 0, y: 0, skill: true }, DT);
  run.player.x = 6.5; run.player.y = 23.5;
  for (let i = 0; i < 60 * 3.5; i++) stepSurvivor(run, IDLE, DT);
  eq(z.state, 'investigate');
  eq(far.state, 'patrol');
});

test('Distraction: a zombie that can see Mara keeps chasing; one that spots her mid-check chases', () => {
  const run = createSurvivorRun();
  const z = run.zombies[2];
  run.zombies = [z];
  z.x = 4.5; z.y = 9.5;
  run.player.x = 6.5; run.player.y = 9.5; run.player.fx = 1; run.player.fy = 0;
  stepSurvivor(run, IDLE, DT);
  eq(z.state, 'chase');
  stepSurvivor(run, { x: 0, y: 0, skill: true }, DT);
  eq(z.state, 'chase', 'not invisibility');
  const run2 = createSurvivorRun();
  const y = run2.zombies[2];
  run2.zombies = [y];
  y.x = 2.5; y.y = 9.5;
  run2.player.x = 6.5; run2.player.y = 9.5; run2.player.fx = -1; run2.player.fy = 0;
  stepSurvivor(run2, { x: 0, y: 0, skill: true }, DT);
  eq(y.state, 'investigate');
  run2.player.x = y.x + 2; run2.player.y = y.y;
  stepSurvivor(run2, IDLE, DT);
  eq(y.state, 'chase');
});

test('Skills: neither changes the core loss rules', () => {
  const k = quiet(createKeeperRun(40));
  stepKeeper(k, { x: 0, y: 0, skill: true }, DT);
  eq(k.health, 3); eq(KEEPER.maxHealth, 3); eq(KEEPER.maxBreaches, 3);
  const s = createSurvivorRun();
  stepSurvivor(s, { x: 0, y: 0, skill: true }, DT);
  s.zombies[0].x = s.player.x; s.zombies[0].y = s.player.y;
  stepSurvivor(s, IDLE, DT);
  eq(s.outcome?.result, 'defeat', 'one touch still loses');
});

// ---------------- Character views ----------------

test('Character views: the drawing follows the direction, and diagonals do not flicker', () => {
  eq(facingView(0, -1), 'back');
  eq(facingView(0, 1), 'front');
  eq(facingView(1, 0), 'side');
  eq(facingView(-1, 0), 'side');
  const d = Math.SQRT1_2;
  eq(facingView(d, d, 'side'), 'side', 'a diagonal keeps the previous view');
  eq(facingView(d, -d, 'back'), 'back');
  eq(facingView(0, 0, 'back'), 'back', 'standing still keeps the view');
});

test('Character views: every Pip costume covers all three views', () => {
  const keys = new Set([RIGS.reaper, RIGS.reaperSide, RIGS.reaperBack].flatMap((r) => Object.values(r.parts).map((p) => p.img)));
  for (const c of COSMETICS.filter((x) => x.slot === 'appearance' && x.campaign === 'keeper' && x.cost > 0)) {
    for (const k of keys) {
      if (k === 'reaperScythe' || k === 'reaperLantern') continue;
      assert(c.skin[k], `${c.id} is missing ${k}`);
    }
  }
});

test('Character views: every Mara costume changes her jacket in all three views', () => {
  const keys = ['maraBody', 'maraArmBack', 'maraArmFront', 'maraSideBody', 'maraSideArm', 'maraSideArmFront', 'maraBackBody', 'maraBackArm'];
  for (const c of COSMETICS.filter((x) => x.slot === 'appearance' && x.campaign === 'survivor' && x.cost > 0)) {
    for (const k of keys) assert(c.skin[k], `${c.id} is missing ${k}`);
  }
});

test('Zombie strides: a planted foot keeps pace with the ground at patrol and chase speed', () => {
  for (const [kind, height] of [['zombie', 400], ['zgirl', 420]]) {
    const g = GAITS[kind], unitsPerTile = height / 1.62;
    for (const tilesPerSecond of [SURVIVOR.patrolSpeed, SURVIVOR.chaseSpeed, 1.35]) {
      const radiansPerSecond = g.perTile * tilesPerSecond;
      const plantedFoot = (2 * g.stride) / (g.planted * ((Math.PI * 2) / radiansPerSecond));
      const ground = tilesPerSecond * unitsPerTile;
      assert(Math.abs(plantedFoot - ground) / ground < 0.01, `${kind} foot ${plantedFoot.toFixed(0)} vs ground ${ground.toFixed(0)}`);
    }
  }
});

test('Animator: stepping by distance follows how far a character actually moved', () => {
  const animator = createAnimator();
  const e = { x: 0, y: 0 };
  const first = animator.step(e, 1 / 60, 0, 10).phase;
  e.x = 0.5;
  eq(Math.round((animator.step(e, 1 / 60, 0, 10).phase - first) * 100) / 100, 5, 'half a tile at 10 per tile');
  const still = animator.step(e, 1 / 60, 0, 10).phase;
  eq(animator.step(e, 1 / 60, 0, 10).phase, still, 'no distance, no stepping');
});

test('Rigs: each view draws its own art, even when two views share part names', () => {
  const drawn = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? (img) => drawn.push(img) : () => {}), set: () => true });
  const images = new Proxy({}, { get: (_, k) => ({ key: k, width: 8, height: 8 }) });
  for (const view of ['front', 'side', 'back']) {
    drawn.length = 0;
    drawRig(ctx, images, undeadRig('zombie', view), pose(), 0, 0, 100);
    const head = view === 'side' ? 'zombieSideHead' : view === 'back' ? 'zombieBackHead' : 'zombieHead';
    assert(drawn.some((i) => i.key === head), `${view} should draw ${head}`);
  }
});

test('Mara\'s stride: a planted foot moves back about as fast as the ground passes', () => {
  // Rig units per second at her run speed, against the planted foot's speed at the game's animation pace.
  const unitsPerTile = RIGS.mara.height / 1.6;
  const ground = SURVIVOR.playerSpeed * unitsPerTile;
  const cycleSeconds = (Math.PI * 2) / 21;
  const plantedFoot = (2 * 48) / (0.4 * cycleSeconds);
  assert(Math.abs(plantedFoot - ground) / ground < 0.1, `foot ${plantedFoot.toFixed(0)} vs ground ${ground.toFixed(0)}`);
});

// ---------------- Shared leaderboard ----------------

const ID = 'abcdef12-3456-7890-abcd-ef1234567890';
test('Leaderboard names: valid names pass; long, odd and rude ones are refused', () => {
  eq(cleanName('  Mossy  Pip ').name, 'Mossy Pip');
  eq(cleanName('Pip_99-x').ok, true);
  eq(cleanName('').ok, false);
  eq(cleanName('ThisNameIsWayTooLong').ok, false);
  eq(cleanName('<b>pip</b>').ok, false);
  eq(cleanName('sh1t head').ok, false, 'undoes letter swaps');
  eq(cleanName('FUCK').ok, false);
  eq(cleanName('Peacock').ok, true, 'innocent words stay allowed');
  eq(cleanName('Grape Ape').ok, true);
  eq(cleanName('big cock').ok, false);
});

test('Leaderboard scoring: the game still scores runs the way supabase/leaderboard.sql checks them', () => {
  const run = createKeeperRun(55);
  playPerfectKeeper(run);
  const { defeated, souls, seals } = run.stats;
  eq(run.outcome.result, 'victory');
  eq(run.score, defeated * 10 + souls * 25 + seals * 100 + run.health * 100 + (3 - run.breaches) * 50, 'if this fails, update submit_score too');
  assert(defeated <= 18, 'the database refuses more than 18 undead');
  assert(run.time >= (defeated - 1) * 1.5, 'the database refuses faster runs');
});

test('Leaderboard client: an outage or missing service reports honestly, and names are escaped', async () => {
  const down = await fetchBoard(ID, async () => { throw new Error('offline'); });
  eq(down.ok, false);
  const missing = await fetchBoard(ID, async () => new Response('<!doctype html>', { status: 404 }));
  eq(missing.ok, false);
  const refused = await submitScore(ID, 'Pip', {}, async () => new Response(JSON.stringify({ error: 'Too fast.' })));
  eq(refused.error, 'Too fast.');
  const html = boardRowsHtml({ top: [{ rank: 1, name: '<img onerror=x>', score: 10 }], you: null });
  assert(!html.includes('<img'), 'stored names are not trusted as HTML');
  assert(boardRowsHtml({ top: [], you: null }).includes('No scores yet'));
});

// ---------------- Report ----------------

await Promise.all(pending);
const ol = document.getElementById('results');
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = (r.ok ? 'PASS ' : 'FAIL ') + r.name;
  if (!r.ok) { const pre = document.createElement('pre'); pre.textContent = r.err; li.append(pre); }
  ol.append(li);
}
const failed = results.filter((r) => !r.ok).length;
document.getElementById('summary').textContent = `${results.length - failed}/${results.length} passed`;
document.title = failed ? `FAIL (${failed})` : 'PASS';
window.__testResults = results;
