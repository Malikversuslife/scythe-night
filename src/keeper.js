// Campaign A — Cemetery Keeper. Pure simulation: no DOM, no rendering.
import { parseMap, moveCircle, lineOfSight, distanceField, isSolid, dist2, tileOf, center, DIRS } from './world.js';
import { SKILLS } from './catalog.js';
import { KEEPER_SCORE } from './score-values.mjs';

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
  // `specials` replace the last undead of a wave, so wave sizes (and scores) don't change.
  waves: [
    { count: 4, speed: 1.35, interval: 2.4, specials: [] },
    { count: 6, speed: 1.5, interval: 2.0, specials: ['brute'] },
    { count: 8, speed: 1.65, interval: 1.7, specials: ['wraith', 'brute', 'wraith'] },
  ],
  // Brutes take three slashes and barely feel the Soul Pulse. Wraiths drift through walls
  // and can only be hit, or hurt you, while they're solid.
  brute: { hp: 3, speed: 0.72, r: 0.42, knock: 0.5, pulse: 0.3 },
  wraith: { speed: 0.8, solidFor: 2.2, mistFor: 1.3 },
  intermission: 1.5,
  score: KEEPER_SCORE,
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

// Rules for one run. Standard runs use the base waves; an event swaps in its own counts
// using the tougher end of the wave table. Nothing here changes the shared definition.
export function keeperRules(loadout = {}) {
  const counts = loadout.waveCounts;
  const waves = counts
    ? counts.map((count, i) => ({ ...KEEPER.waves[KEEPER.waves.length - counts.length + i], count }))
    : KEEPER.waves;
  return { waves, pulseCooldown: loadout.pulseCooldown ?? 18, soulReach: loadout.soulReach ?? 1 };
}

export function createKeeperRun(seed = Date.now(), loadout = {}) {
  const map = parseMap(KEEPER_MAP, '#T');
  const rules = keeperRules(loadout);
  const start = map.marks.P[0];
  const gates = map.marks.G;
  const run = {
    campaign: 'keeper',
    rules,
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
    queue: rules.waves[0].count,
    skillCooldown: 0,
    pulse: null, // { t }: drawn expanding ring
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
        if (e.hp > 1) {
          e.hp--;
          const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          const kb = KEEPER.brute.knock / 0.15;
          e.push = { vx: ((e.x - p.x) / d) * kb, vy: ((e.y - p.y) / d) * kb, t: 0.15 };
          e.target = null;
          events.push({ type: 'hit', x: e.x, y: e.y, hp: e.hp });
          continue;
        }
        e.dead = true;
        run.stats.defeated++;
        award(run, 'defeat', events);
        run.souls.push({ id: run.nextId++, x: e.x, y: e.y, born: run.time });
        events.push({ type: 'defeat', x: e.x, y: e.y });
      }
    }
    run.enemies = run.enemies.filter((e) => !e.dead);
  }

  // ---- Soul Pulse: shoves nearby undead away. No damage, score or invulnerability. ----
  run.skillCooldown = Math.max(0, run.skillCooldown - dt);
  if (run.pulse) {
    run.pulse.t += dt;
    if (run.pulse.t >= 0.45) run.pulse = null;
  }
  if (input.skill && run.skillCooldown === 0) {
    const sk = SKILLS.keeper;
    run.skillCooldown = run.rules.pulseCooldown;
    run.pulse = { t: 0 };
    let pushed = 0;
    for (const e of run.enemies) {
      if (e.state !== 'active') continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > sk.radius + e.r) continue;
      const ux = d > 0.01 ? dx / d : -p.fx, uy = d > 0.01 ? dy / d : -p.fy;
      const k = e.kind === 'brute' ? KEEPER.brute.pulse : 1;
      e.push = { vx: (ux * sk.push * k) / sk.pushTime, vy: (uy * sk.push * k) / sk.pushTime, t: sk.pushTime };
      e.target = null;
      pushed++;
    }
    events.push({ type: 'pulse', x: p.x, y: p.y, pushed });
  }

  // ---- Souls ----
  const pick2 = (KEEPER.soulPickup * run.rules.soulReach) ** 2;
  run.souls = run.souls.filter((s) => {
    if (dist2(s, p) > pick2) return true;
    run.stats.souls++;
    award(run, 'soul', events);
    events.push({ type: 'soul', x: s.x, y: s.y });
    return false;
  });

  // ---- Wave flow ----
  const wave = run.rules.waves[run.wave];
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
        const kind = specialFor(wave, run.queue);
        const b = KEEPER.brute;
        run.enemies.push({
          id: run.nextId++, kind,
          x: tile.c + 0.5, y: tile.r + 0.5, r: kind === 'brute' ? b.r : KEEPER.enemyRadius,
          hp: kind === 'brute' ? b.hp : 1,
          state: 'rising', rise: KEEPER.spawnWarning,
          target: null, speed: wave.speed * (kind === 'brute' ? b.speed : kind === 'wraith' ? KEEPER.wraith.speed : 1), fx: 0, fy: 1,
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
      if (run.wave === run.rules.waves.length - 1) {
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
  for (const e of run.enemies) {
    if (e.state === 'rising') {
      e.rise -= dt;
      if (e.rise <= 0) e.state = 'active';
      continue;
    }
    if (e.kind === 'wraith') e.solid = isWraithSolid(run, e);
    if (e.push) {
      // Pushed through normal collision; the closed gate counts as a wall here. Wraiths ignore walls.
      const gate = run.gate;
      if (e.kind === 'wraith') { e.x += e.push.vx * dt; e.y += e.push.vy * dt; clampInside(run, e); }
      else moveCircle(run.map, e, e.push.vx * dt, e.push.vy * dt, (m, c, r) => isSolid(m, c, r) || (c === gate.c && r === gate.r));
      e.push.t -= dt;
      if (e.push.t <= 0) e.push = null;
    } else {
      if (e.kind === 'wraith') driftToGate(run, e, dt);
      else advanceEnemy(run, e, dt);
      const t = tileOf(e);
      if (t.c === run.gate.c && t.r === run.gate.r && e.y >= run.gate.r + 0.45) {
        e.breached = true;
        continue;
      }
    }
    if (e.kind === 'wraith' && !e.solid) continue;
    if (run.invuln === 0 && dist2(e, p) < (KEEPER.playerRadius + e.r) ** 2 * 0.85) {
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
  if (e.kind === 'wraith' && !isWraithSolid(run, e)) return false;
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

// Which kind the next spawn is: the wave's specials take the last places in its queue.
export function specialFor(wave, queue) {
  const sp = wave.specials || [];
  return queue <= sp.length ? sp[sp.length - queue] : 'walker';
}

// A wraith is solid for a while, then mist for a while, each on its own rhythm.
export function isWraithSolid(run, e) {
  const w = KEEPER.wraith, cycle = w.solidFor + w.mistFor;
  return (run.time + e.id * 0.83) % cycle < w.solidFor;
}

function clampInside(run, e) {
  e.x = Math.min(run.map.w - 1.5, Math.max(1.5, e.x));
  e.y = Math.min(run.map.h - 1.05, Math.max(1.5, e.y));
}

// Straight for the gate, through walls and tombstones.
function driftToGate(run, e, dt) {
  const gx = run.gate.c + 0.5, gy = run.gate.r + 0.5;
  const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy) || 1;
  const step = Math.min(d, e.speed * dt);
  e.fx = dx / d; e.fy = dy / d;
  e.x += e.fx * step; e.y += e.fy * step;
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
