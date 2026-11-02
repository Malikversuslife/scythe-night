import { createKeeperRun, stepKeeper, KEEPER } from '../src/keeper.js';
import { createSurvivorRun, stepSurvivor, interactionTarget, canSee, TASKS, PATROLS, SURVIVOR } from '../src/survivor.js';
import { distanceField, isSolid, lineOfSight, moveCircle } from '../src/world.js';
import { sanitize, createStore, defaultSave } from '../src/storage.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.stack || String(e) }); }
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

test('Storage: corrupted and older records are sanitized to defaults', () => {
  eq(JSON.stringify(sanitize(null)), JSON.stringify(defaultSave()));
  const s = sanitize({ settings: { music: 'loud', sfx: 400, reducedMotion: 'maybe' }, keeperBest: -5, completed: { keeper: 'yes' } });
  eq(s.settings.music, 60); eq(s.settings.sfx, 100); eq(s.settings.reducedMotion, 'system');
  eq(s.keeperBest, 0); eq(s.completed.keeper, false);
});

test('Storage: works in memory when storage throws, and reset clears records', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const store = createStore(broken);
  store.update((d) => { d.keeperBest = 123; });
  eq(store.data.keeperBest, 123);
  const mem = new Map();
  const ok = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const s2 = createStore(ok);
  s2.update((d) => { d.keeperBest = 50; d.settings.music = 10; });
  eq(createStore(ok).data.keeperBest, 50);
  s2.reset();
  eq(createStore(ok).data.keeperBest, 0);
  ok.setItem('scythe-night:save', '{not json');
  eq(createStore(ok).data.keeperBest, 0);
});

// ---------------- Report ----------------

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
