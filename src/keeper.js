// Campaign A — Cemetery Keeper. Pure simulation: no DOM, no rendering.
import { parseMap, moveCircle, lineOfSight, distanceField, isSolid, dist2, tileOf, center, DIRS } from './world.js';

// '#' wall, 'T' tombstone (solid), '.' path, 'S' breach (spawn), 'G' city gate, 'P' start.
export const KEEPER_MAP = [
  '#############',
  '#S...T#T...S#',
  '#.##.....##.#',
  '#.#..#.#..#.#',
  '#...##.##...#',
  '##.T.....T.##',
  '#..#.#.#.#..#',
  '#.##.....##.#',
  '#....#P#....#',
  '#.T#.....#T.#',
  '#...##.##...#',
  '##.#.....#.##',
  '#..#.#T#.#..#',
  '#.T.......T.#',
  '#.#.#.#.#.#.#',
  '#...........#',
  '#.T##...##T.#',
  '#...........#',
  '######G######',
];

export const KEEPER = {
  maxHealth: 3,
  maxBreaches: 3,
  playerSpeed: 3.4,
  playerRadius: 0.3,
  enemyRadius: 0.3,
  invulnTime: 1.0,
  slashCooldown: 0.45,
  slashDuration: 0.22,
  slashRange: 1.3,
  slashHalfAngle: (65 * Math.PI) / 180,
  soulPickup: 0.75,
  sealPickup: 0.75,
  spawnWarning: 1.0,
  spawnMinPlayerDist: 3,
  maxActive: 4,
  waves: [
    { count: 4, speed: 1.35, interval: 2.4 },
    { count: 6, speed: 1.5, interval: 2.0 },
    { count: 8, speed: 1.65, interval: 1.7 },
  ],
  intermission: 1.5,
  score: { defeat: 10, soul: 25, seal: 100, healthBonus: 100, breachBonus: 50 },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createKeeperRun(seed = Date.now()) {
  const map = parseMap(KEEPER_MAP, '#T');
  const start = map.marks.P[0];
  const gates = map.marks.G;
  const run = {
    campaign: 'keeper',
    map,
    rng: mulberry32(seed),
    gateField: distanceField(map, gates),
    spawns: map.marks.S,
    gate: gates[0],
    player: { x: start.c + 0.5, y: start.r + 0.5, r: KEEPER.playerRadius, fx: 0, fy: -1, moving: false },
    health: KEEPER.maxHealth,
    breaches: 0,
    invuln: 0,
    cooldown: 0,
    slash: null, // { t, angle }
    enemies: [],
    souls: [],
    nextId: 1,
    wave: 0, // index into KEEPER.waves
    queue: KEEPER.waves[0].count,
    spawnTimer: 0.8,
    spawnCursor: 0,
    phase: 'wave', // 'wave' | 'seal' | 'intermission'
    seal: null, // { x, y }
    intermission: 0,
    stats: { defeated: 0, souls: 0, seals: 0 },
    score: 0,
    time: 0,
    outcome: null, // { result: 'victory'|'defeat', reason }
  };
  return run;
}

function award(run, key, events) {
  run.score += KEEPER.score[key];
  events.push({ type: 'score', key, amount: KEEPER.score[key] });
}

// Advance the run by dt seconds. Returns a list of events for audio/UI.
export function stepKeeper(run, input, dt) {
  const events = [];
  if (run.outcome) return events;
  run.time += dt;
  const p = run.player;
  let lost = null;
  let won = false;

  // ---- Player movement & facing ----
  const mag = Math.hypot(input.x, input.y);
  p.moving = mag > 0.1;
  if (p.moving) {
    p.fx = input.x / mag;
    p.fy = input.y / mag;
    moveCircle(run.map, p, input.x * KEEPER.playerSpeed * dt, input.y * KEEPER.playerSpeed * dt);
  }

  // ---- Slash ----
  run.cooldown = Math.max(0, run.cooldown - dt);
  if (run.slash) {
    run.slash.t += dt;
    if (run.slash.t >= KEEPER.slashDuration) run.slash = null;
  }
  if (input.action && run.cooldown === 0) {
    run.cooldown = KEEPER.slashCooldown;
    run.slash = { t: 0, angle: Math.atan2(p.fy, p.fx) };
    events.push({ type: 'slash' });
    for (const e of run.enemies) {
      if (e.state !== 'active' || e.dead) continue;
      if (slashHits(run, e)) {
        e.dead = true;
        run.stats.defeated++;
        award(run, 'defeat', events);
        run.souls.push({ id: run.nextId++, x: e.x, y: e.y, born: run.time });
        events.push({ type: 'defeat', x: e.x, y: e.y });
      }
    }
    run.enemies = run.enemies.filter((e) => !e.dead);
  }

  // ---- Souls ----
  const pick2 = KEEPER.soulPickup ** 2;
  run.souls = run.souls.filter((s) => {
    if (dist2(s, p) > pick2) return true;
    run.stats.souls++;
    award(run, 'soul', events);
    events.push({ type: 'soul', x: s.x, y: s.y });
    return false;
  });

  // ---- Wave flow ----
  const wave = KEEPER.waves[run.wave];
  if (run.phase === 'intermission') {
    run.intermission -= dt;
    if (run.intermission <= 0) {
      run.phase = 'wave';
      run.queue = wave.count;
      run.spawnTimer = 1.0;
      events.push({ type: 'waveStart', wave: run.wave + 1 });
    }
  } else if (run.phase === 'wave') {
    run.spawnTimer -= dt;
    if (run.queue > 0 && run.spawnTimer <= 0 && run.enemies.length < KEEPER.maxActive) {
      const tile = chooseSpawn(run);
      if (tile) {
        run.enemies.push({
          id: run.nextId++,
          x: tile.c + 0.5, y: tile.r + 0.5, r: KEEPER.enemyRadius,
          state: 'rising', rise: KEEPER.spawnWarning,
          target: null, speed: wave.speed, fx: 0, fy: 1,
        });
        run.queue--;
        run.spawnTimer = wave.interval;
        events.push({ type: 'spawn', x: tile.c + 0.5, y: tile.r + 0.5 });
      } else {
        run.spawnTimer = 0.25; // every breach is too close to the player; try again shortly
      }
    }
    if (run.queue === 0 && run.enemies.length === 0 && run.souls.length === 0) {
      const s = run.spawns[run.wave % run.spawns.length];
      run.phase = 'seal';
      run.seal = center(s);
      events.push({ type: 'sealReady' });
    }
  } else if (run.phase === 'seal') {
    if (dist2(run.seal, p) <= KEEPER.sealPickup ** 2) {
      run.stats.seals++;
      award(run, 'seal', events);
      events.push({ type: 'sealed', wave: run.wave + 1 });
      run.seal = null;
      if (run.wave === KEEPER.waves.length - 1) {
        won = true;
      } else {
        run.wave++;
        run.phase = 'intermission';
        run.intermission = KEEPER.intermission;
      }
    }
  }

  // ---- Enemies ----
  run.invuln = Math.max(0, run.invuln - dt);
  const touch2 = (KEEPER.playerRadius + KEEPER.enemyRadius) ** 2 * 0.85;
  for (const e of run.enemies) {
    if (e.state === 'rising') {
      e.rise -= dt;
      if (e.rise <= 0) e.state = 'active';
      continue;
    }
    advanceEnemy(run, e, dt);
    const t = tileOf(e);
    if (t.c === run.gate.c && t.r === run.gate.r && e.y >= run.gate.r + 0.45) {
      e.breached = true;
      continue;
    }
    if (run.invuln === 0 && dist2(e, p) < touch2) {
      run.health--;
      run.invuln = KEEPER.invulnTime;
      events.push({ type: 'damage', health: run.health });
      if (run.health <= 0) lost = 'health';
    }
  }
  const before = run.enemies.length;
  run.enemies = run.enemies.filter((e) => !e.breached);
  const breached = before - run.enemies.length;
  if (breached) {
    run.breaches += breached;
    events.push({ type: 'breach', breaches: run.breaches });
    if (run.breaches >= KEEPER.maxBreaches) lost = lost || 'breach';
  }

  // ---- Terminal outcome: defeat takes precedence over a same-step win ----
  if (lost) {
    run.outcome = { result: 'defeat', reason: lost };
    events.push({ type: 'defeatRun', reason: lost });
  } else if (won) {
    const bonusHealth = run.health * KEEPER.score.healthBonus;
    const bonusBreach = (KEEPER.maxBreaches - run.breaches) * KEEPER.score.breachBonus;
    run.bonus = { health: bonusHealth, breach: bonusBreach };
    run.score += bonusHealth + bonusBreach;
    run.outcome = { result: 'victory' };
    events.push({ type: 'victoryRun' });
  }
  return events;
}

export function slashHits(run, e) {
  const p = run.player;
  const dx = e.x - p.x, dy = e.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > KEEPER.slashRange + e.r) return false;
  if (d > 0.05) {
    const cos = (dx * p.fx + dy * p.fy) / d;
    if (cos < Math.cos(KEEPER.slashHalfAngle)) return false;
  }
  return lineOfSight(run.map, p.x, p.y, e.x, e.y);
}

function chooseSpawn(run) {
  const n = run.spawns.length;
  for (let i = 0; i < n; i++) {
    const s = run.spawns[(run.spawnCursor + i) % n];
    const c = center(s);
    const busy = run.enemies.some((e) => dist2(e, c) < 0.8);
    if (!busy && Math.sqrt(dist2(c, run.player)) >= KEEPER.spawnMinPlayerDist) {
      run.spawnCursor = (run.spawnCursor + i + 1) % n;
      return s;
    }
  }
  return null;
}

// Walk downhill on the gate distance field, choosing randomly between equal branches.
function advanceEnemy(run, e, dt) {
  const { map, gateField } = run;
  if (!e.target) {
    const t = tileOf(e);
    const here = gateField[t.r * map.w + t.c];
    const options = [];
    for (const [ox, oy] of DIRS) {
      const nc = t.c + ox, nr = t.r + oy;
      if (isSolid(map, nc, nr)) continue;
      const d = gateField[nr * map.w + nc];
      if (d >= 0 && d < here) options.push({ c: nc, r: nr });
    }
    if (!options.length) return;
    e.target = center(options[Math.floor(run.rng() * options.length)]);
  }
  const dx = e.target.x - e.x, dy = e.target.y - e.y;
  const d = Math.hypot(dx, dy);
  const step = e.speed * dt;
  if (d <= step) {
    e.x = e.target.x;
    e.y = e.target.y;
    e.target = null;
  } else {
    e.fx = dx / d;
    e.fy = dy / d;
    e.x += e.fx * step;
    e.y += e.fy * step;
  }
}
