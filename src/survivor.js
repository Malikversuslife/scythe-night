// Campaign B — Last Survivor. Pure simulation: no DOM, no rendering.
import { parseMap, moveCircle, lineOfSight, distanceField, nextStep, isSolid, dist2, tileOf, center } from './world.js';
import { SKILLS } from './catalog.js';

// '#' building, 'x' cars, bins, planters and trees (solid), '.' street, 'P' start,
// 'F' maintenance kiosk (fuse), 'B' refuge power box, 'L' plaza bell, 'R' town hall door (the refuge).
// Avenues are two tiles wide; buildings stand on large lots between them. The old town is the west
// half; the east district (from column 22) has a park, the bell's plaza and a car park. The tasks
// are spread across both, so a run crosses the whole city: fuse far west, power far east.
export const SURVIVOR_MAP = [
  '###########################################',
  '#.........................................#',
  '#.............................x...........#',
  '#..####..#####..####..####..#####..#####..#',
  '#x.####..#####..####.x####..#####..#####..#',
  '#..####..#####..####..####..#####..#####..#',
  '#..####..##R##..####..####..#####..#####..#',
  '#.........................................#',
  '#....................................x....#',
  '#..####..##.##..####..####.....x...#####..#',
  '#..####..##.##..####..####...x.....#####.B#',
  '#..####.x##.##..####..####.........#####..#',
  '#..####..##.##..####..####..x..x...#####..#',
  '#.........................................#',
  '#.......................x.................#',
  '#..####..x...x..####..####..x...x..#####..#',
  '#F.####.........####..####....L....#####..#',
  '#..####..x...x..####..####..x...x..#####..#',
  '#.........................................#',
  '#...................................x.....#',
  '#..x..x..#####.x####..####..#####..#####..#',
  '#........#####........####..#####..#####..#',
  '#...x....#####..####.x####..#####..#####..#',
  '#..x..x..#####..####..####..#####..#####..#',
  '#.........................................#',
  '#............................x............#',
  '#..#.##..#####..####..####..#####.........#',
  '#..#.##..#####..####..####..#####...x.x...#',
  '#x.#.##..#####..####.x####..#####.........#',
  '#..#.##..#####..####..####..#####...x..x..#',
  '#.......x..P..x...........................#',
  '#.....................................x...#',
  '###########################################',
];

// Patrol loops in tile coordinates; consecutive points share a row or column of open street.
export const PATROLS = [
  [[1, 1], [21, 1]],                      // north avenue
  [[2, 7], [20, 7]],                      // past the town hall door
  [[14, 8], [14, 25]],                    // east-centre avenue
  [[2, 13], [20, 13]],                    // middle avenue
  [[8, 14], [8, 25]],                     // west-centre avenue
  [[2, 18], [7, 18], [7, 24], [2, 24]],   // around the park
  [[20, 14], [20, 25]],                   // east avenue
  // The east district.
  [[23, 7], [41, 7]],                     // east district, north cross-street
  [[27, 8], [27, 24]],                    // beside the park and the plaza
  [[34, 8], [34, 30]],                    // east district, long avenue
  [[40, 2], [40, 30]],                    // the far east edge
  [[23, 24], [41, 24]],                   // east district, south cross-street
];

export const SURVIVOR = {
  playerSpeed: 3.4,
  playerRadius: 0.3,
  zombieRadius: 0.3,
  patrolSpeed: 1.1,
  chaseSpeed: 2.3,
  detectRange: 3.2,
  loseSightTime: 3.0,
  interactRange: 1.3,
  contact: 0.52,
  repath: 0.25,
  investigateSpeed: 1.8,
};

// Mara's weapons. A hit stuns a zombie so she can slip past; only the top upgrades can kill.
// The worse things are tougher: they take several killing hits and shake off stuns faster.
export const WEAPONS = {
  knife: { reach: 1.15, halfAngle: (70 * Math.PI) / 180, cooldown: 0.7, stun: [0, 3, 4, 5] },
  pistol: { range: 5.5, halfAngle: (12 * Math.PI) / 180, cooldown: 0.5, stun: 4, loud: 6, listen: 3 },
  toughness: { walker: 1, screamer: 2, crawler: 2, stalker: 3, brute: 4 },
  stunScale: { walker: 1, screamer: 0.75, crawler: 0.75, stalker: 0.6, brute: 0.5 },
};

// The worse things in the city. Each has its own rule that changes how you play around it.
export const MONSTERS = {
  // Hunts you by sound wherever you are, but can't move while your flashlight is on it.
  stalker: { r: 0.3, speed: 1.9, farSpeed: 1.2, near: 9, linger: 1.0, huntFor: 18, restFor: 14, beamLength: 4.6, beamHalfAngle: (26 * Math.PI) / 180, start: [21, 1] },
  // A walker that shrieks when it sees you, calling every zombie in earshot to it.
  screamer: { route: 3, call: 6, cooldown: 10, chaseSpeed: 1.9 },
  // Slow and huge. Distractions don't work on it, and it smashes cars and trees in its way.
  brute: { route: 5, r: 0.42, contact: 0.64, patrolSpeed: 0.85, chaseSpeed: 1.85 },
  // Hides beside a parked car, rattles, then lunges.
  crawler: { r: 0.28, trigger: 2.3, rattle: 0.45, lungeSpeed: 4.0, lungeTime: 1.0, crawlSpeed: 1.0, rest: 4, lairs: [[20, 4], [2, 28], [37, 27]] },
};

export const TASKS = [
  { id: 'fuse', mark: 'F', label: 'Get the fuse from the maintenance kiosk', short: 'Fuse', verb: 'Take fuse' },
  { id: 'power', mark: 'B', label: 'Install the fuse in the refuge power box', short: 'Power', verb: 'Install fuse' },
  { id: 'bell', mark: 'L', label: 'Ring the courtyard bell', short: 'Bell', verb: 'Ring bell' },
];

const NEEDS = {
  power: 'The power box is dead. Find a fuse first.',
  bell: 'The bell is chained until the refuge has power.',
};

export function createSurvivorRun(loadout = {}) {
  const map = parseMap(SURVIVOR_MAP, '#xFBLR');
  const start = map.marks.P[0];
  const door = map.marks.R[0];
  const objects = {};
  for (const t of TASKS) objects[t.id] = map.marks[t.mark][0];
  const kindOf = (i) => (i === MONSTERS.screamer.route ? 'screamer' : i === MONSTERS.brute.route ? 'brute' : 'walker');
  const zombies = PATROLS.map((route, i) => ({
    id: i + 1,
    kind: kindOf(i),
    x: route[0][0] + 0.5, y: route[0][1] + 0.5, r: kindOf(i) === 'brute' ? MONSTERS.brute.r : SURVIVOR.zombieRadius,
    screamCooldown: 0,
    route: route.map(([c, r]) => ({ c, r })),
    wp: 1 % route.length,
    state: 'patrol', // 'patrol' | 'chase' | 'search' | 'return'
    lost: 0,
    lastSeen: null,
    investigate: 0,
    noiseAt: null,
    field: null, fieldKey: '', fieldAge: 0,
    fx: 1, fy: 0,
  }));
  // The stalker waits in the far corner until the fuse is taken.
  const st = MONSTERS.stalker;
  zombies.push({
    id: zombies.length + 1, kind: 'stalker', state: 'dormant',
    x: st.start[0] + 0.5, y: st.start[1] + 0.5, r: st.r, fx: -1, fy: 0,
    field: null, fieldKey: '', fieldAge: 0, investigate: 0, noiseAt: null, linger: 0, clock: 0,
  });
  for (const [c, r] of MONSTERS.crawler.lairs) {
    zombies.push({
      id: zombies.length + 1, kind: 'crawler', state: 'lurk', lair: { c, r },
      x: c + 0.5, y: r + 0.5, r: MONSTERS.crawler.r, fx: 0, fy: 1, timer: 0,
      field: null, fieldKey: '', fieldAge: 0,
    });
  }
  return {
    campaign: 'survivor',
    rules: {
      distractCooldown: loadout.distractCooldown ?? 22, distractDuration: loadout.distractDuration ?? 3,
      speed: SURVIVOR.playerSpeed * (loadout.speed ?? 1),
    },
    lives: loadout.secondWind ?? 0, // Theo: the first catch only knocks him back
    shaken: 0,                       // seconds of safety after a second wind
    // blade 1-3: knife, sharpened knife, machete (kills). pistolLevel 0-2: none, pistol, heavy pistol (kills).
    weapon: { blade: loadout.blade ?? 1, rounds: loadout.rounds ?? 0, pistolLevel: loadout.pistolLevel ?? 0, cooldown: 0, swing: null },
    skillCooldown: 0,
    noise: null, // { x, y, t }: where the last noise-maker landed
    map,
    player: { x: start.c + 0.5, y: start.r + 0.5, r: SURVIVOR.playerRadius, fx: 0, fy: -1, moving: false },
    objects,
    door,
    doorOpen: false,
    done: { fuse: false, power: false, bell: false },
    zombies,
    smashed: [], // tiles a brute has flattened
    time: 0,
    outcome: null,
  };
}

export function taskIndex(run) {
  return TASKS.findIndex((t) => !run.done[t.id]);
}

// Solid test that treats the refuge door as open once unlocked.
function solidFor(run) {
  return (map, c, r) => {
    if (run.doorOpen && c === run.door.c && r === run.door.r) return false;
    return isSolid(map, c, r);
  };
}

// The object the player could interact with right now, and what would happen.
export function interactionTarget(run) {
  const p = run.player;
  let best = null, bestD = SURVIVOR.interactRange ** 2;
  for (const t of TASKS) {
    const d = dist2(p, center(run.objects[t.id]));
    if (d <= bestD) { bestD = d; best = t; }
  }
  if (!best) {
    if (!run.doorOpen && dist2(p, center(run.door)) <= SURVIVOR.interactRange ** 2) {
      return { task: null, enabled: false, hint: 'The refuge is locked. Restore power and ring the bell.' };
    }
    return null;
  }
  if (run.done[best.id]) return { task: best, enabled: false, hint: `${best.short}: done.` };
  const idx = TASKS.indexOf(best);
  if (idx !== taskIndex(run)) return { task: best, enabled: false, hint: NEEDS[best.id] };
  return { task: best, enabled: true, hint: best.verb };
}

// Where a noise-maker would land, stopping short of solid geometry. Null when there's no room.
export function distractionLanding(run) {
  const p = run.player, solid = solidFor(run), sk = SKILLS.survivor;
  const stepLen = 0.05, margin = 0.2;
  let dist = 0;
  while (dist + stepLen <= sk.range) {
    const reach = dist + stepLen + margin;
    if (solid(run.map, Math.floor(p.x + p.fx * reach), Math.floor(p.y + p.fy * reach))) break;
    dist += stepLen;
  }
  if (dist < sk.minThrow) return null;
  return { x: p.x + p.fx * dist, y: p.y + p.fy * dist };
}

function useDistraction(run, events) {
  const landing = distractionLanding(run);
  if (!landing) {
    events.push({ type: 'skillDenied', hint: 'No room to throw. Face open street.' });
    return;
  }
  run.skillCooldown = run.rules.distractCooldown;
  run.noise = { ...landing, t: 0 };
  let heard = 0;
  for (const z of run.zombies) {
    if (z.kind === 'brute' || z.kind === 'crawler' || z.state === 'dormant') continue; // it doesn't care
    // A zombie already looking at Mara keeps chasing: this isn't invisibility.
    if (dist2(z, landing) > SKILLS.survivor.hearing ** 2 || (z.kind !== 'stalker' && canSee(run, z))) continue;
    z.investigate = run.rules.distractDuration;
    z.noiseAt = { c: Math.floor(landing.x), r: Math.floor(landing.y) };
    z.state = 'investigate';
    z.field = null;
    heard++;
  }
  events.push({ type: 'distraction', x: landing.x, y: landing.y, heard });
}

export function stepSurvivor(run, input, dt) {
  const events = [];
  if (run.outcome) return events;
  run.time += dt;
  const p = run.player;
  const solid = solidFor(run);
  let caught = false;
  let won = false;

  // ---- Player ----
  const mag = Math.hypot(input.x, input.y);
  p.moving = mag > 0.1;
  if (p.moving) {
    p.fx = input.x / mag;
    p.fy = input.y / mag;
    moveCircle(run.map, p, input.x * run.rules.speed * dt, input.y * run.rules.speed * dt, solid);
  }

  // ---- Distraction ----
  run.skillCooldown = Math.max(0, run.skillCooldown - dt);
  if (run.noise) {
    run.noise.t += dt;
    if (run.noise.t >= run.rules.distractDuration) run.noise = null;
  }
  if (input.skill && run.skillCooldown === 0) useDistraction(run, events);

  // ---- Weapon ----
  const w = run.weapon;
  w.cooldown = Math.max(0, w.cooldown - dt);
  if (w.swing) { w.swing.t += dt; if (w.swing.t > 0.25) w.swing = null; }

  // ---- The weapon: its own button, like the Keeper's slash ----
  if (input.attack && w.cooldown === 0) attack(run, events);

  // ---- Using things: the fuse, the power box, the bell ----
  if (input.action) {
    const it = interactionTarget(run);
    if (it && it.enabled) {
      run.done[it.task.id] = true;
      events.push({ type: 'task', id: it.task.id });
      if (it.task.id === 'bell') {
        run.doorOpen = true;
        events.push({ type: 'doorOpen' });
      }
    } else if (it) {
      events.push({ type: 'denied', hint: it.hint });
    }
  }

  if (run.doorOpen) {
    const t = tileOf(p);
    if (t.c === run.door.c && t.r === run.door.r) won = true;
  }

  // ---- Zombies ----
  for (const z of run.zombies) {
    // A stunned zombie stays down: it can't move, see or catch anyone until it recovers.
    if (z.stun > 0) {
      z.stun -= dt;
      if (z.stun <= 0) { z.stun = 0; z.state = recoverState(z); z.field = null; events.push({ type: 'recovered', id: z.id }); }
      continue;
    }
    if (z.kind === 'stalker') updateStalker(run, z, dt, solid, events);
    else if (z.kind === 'crawler') updateCrawler(run, z, dt, solid, events);
    else updateZombie(run, z, dt, z.kind === 'brute' ? bruteSolid(run, solid) : solid, events);
    if (z.state === 'dormant' || z.state === 'lurk') continue;
    const reach = z.kind === 'brute' ? MONSTERS.brute.contact : SURVIVOR.contact;
    if (dist2(z, p) < reach ** 2 && run.shaken <= 0) {
      if (run.lives > 0) {
        // A second wind: the zombie reels back stunned and he has a moment to get away.
        run.lives--;
        run.shaken = 1.5;
        hitZombie(run, z, 3, false, events);
        events.push({ type: 'secondWind', lives: run.lives });
      } else { caught = true; run.caughtBy = z.kind; }
    }
  }
  run.shaken = Math.max(0, run.shaken - dt);

  if (caught) {
    run.outcome = { result: 'defeat', reason: 'caught' };
    events.push({ type: 'defeatRun', reason: 'caught' });
  } else if (won) {
    run.outcome = { result: 'victory' };
    events.push({ type: 'victoryRun' });
  }
  return events;
}

export function canSee(run, z) {
  const p = run.player;
  if (dist2(z, p) > SURVIVOR.detectRange ** 2) return false;
  return lineOfSight(run.map, z.x, z.y, p.x, p.y, solidFor(run));
}

function updateZombie(run, z, dt, solid, events) {
  z.screamCooldown = Math.max(0, (z.screamCooldown || 0) - dt);
  const sees = canSee(run, z);
  if (sees) {
    if (z.state !== 'chase') {
      events.push({ type: 'spotted', id: z.id });
      if (z.kind === 'screamer' && z.screamCooldown <= 0) scream(run, z, events);
    }
    z.state = 'chase';
    z.lost = 0;
    z.investigate = 0;
    z.lastSeen = { x: run.player.x, y: run.player.y };
  } else if (z.state === 'investigate') {
    z.investigate -= dt;
    if (z.investigate <= 0) {
      z.state = 'return';
      z.field = null;
    }
  } else if (z.state === 'chase' || z.state === 'search') {
    z.state = 'search';
    z.lost += dt;
    if (z.lost >= SURVIVOR.loseSightTime) {
      z.state = 'return';
      z.field = null;
    }
  }

  const patrolSpeed = z.kind === 'brute' ? MONSTERS.brute.patrolSpeed : SURVIVOR.patrolSpeed;
  const chaseSpeed = z.kind === 'brute' ? MONSTERS.brute.chaseSpeed : z.kind === 'screamer' ? MONSTERS.screamer.chaseSpeed : SURVIVOR.chaseSpeed;
  if (z.state === 'patrol') {
    const wp = center(z.route[z.wp]);
    if (moveToward(run, z, wp, patrolSpeed * dt, solid)) z.wp = (z.wp + 1) % z.route.length;
  } else if (z.state === 'chase' && lineOfSight(run.map, z.x, z.y, run.player.x, run.player.y, solid)) {
    moveToward(run, z, run.player, chaseSpeed * dt, solid);
  } else {
    // Search the last sighting, or walk home along the street grid.
    const goal = z.state === 'return' ? z.route[z.wp] : z.state === 'investigate' ? z.noiseAt : tileOf(z.lastSeen || z); // with no sighting, it searches where it stands
    const speed = z.state === 'return' ? patrolSpeed : z.state === 'investigate' ? SURVIVOR.investigateSpeed : chaseSpeed;
    followField(run, z, goal, speed * dt, solid, dt);
    if (z.state === 'return' && dist2(z, center(goal)) < 0.05) {
      z.state = 'patrol';
      z.field = null;
    }
  }
  if (z.kind === 'brute') smashUnder(run, z, events);
}

// ---------------- Mara's weapons ----------------

function recoverState(z) {
  if (z.kind === 'stalker') return 'hunt';
  if (z.kind === 'crawler') return 'return';
  z.lastSeen = null;
  return 'return';
}

// The zombies she could hit: awake, not already down, in front of her and in plain sight.
function inArc(run, z, reach, half) {
  const p = run.player;
  if (z.state === 'dormant' || z.state === 'lurk' || z.stun > 0) return false;
  const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
  if (d > reach + z.r) return false;
  if (d > 0.3 && (dx * p.fx + dy * p.fy) / d < Math.cos(half)) return false;
  return lineOfSight(run.map, p.x, p.y, z.x, z.y, solidFor(run));
}

const nearestOf = (run, list) => list.reduce((a, z) => (!a || dist2(z, run.player) < dist2(a, run.player) ? z : a), null);

function hitZombie(run, z, stun, kills, events) {
  if (kills) {
    z.hp = (z.hp ?? WEAPONS.toughness[z.kind] ?? 1) - 1;
    if (z.hp <= 0) {
      run.zombies = run.zombies.filter((o) => o !== z);
      run.downed = (run.downed || 0) + 1;
      events.push({ type: 'zombieDown', id: z.id, x: z.x, y: z.y });
      return;
    }
  }
  z.stun = stun * (WEAPONS.stunScale[z.kind] ?? 1);
  z.state = 'stunned';
  z.field = null;
  events.push({ type: 'stunned', id: z.id, x: z.x, y: z.y, time: z.stun });
}

// What a press would do now, for the HUD: 'stab', 'shoot', or null when nothing is in reach.
export function attackPreview(run) {
  const K = WEAPONS.knife, G = WEAPONS.pistol;
  if (run.zombies.some((z) => inArc(run, z, K.reach, K.halfAngle))) return 'stab';
  if (run.weapon.rounds > 0 && run.zombies.some((z) => inArc(run, z, G.range, G.halfAngle))) return 'shoot';
  return null;
}

// Knife first when something is close; the pistol for anything further off in her line of fire.
// With nothing in reach she still swings the knife at the air.
function attack(run, events) {
  const w = run.weapon, p = run.player, K = WEAPONS.knife, G = WEAPONS.pistol;
  const close = nearestOf(run, run.zombies.filter((z) => inArc(run, z, K.reach, K.halfAngle)));
  if (close) {
    w.cooldown = K.cooldown;
    w.swing = { t: 0, angle: Math.atan2(p.fy, p.fx), hit: true };
    events.push({ type: 'stab', hit: true, x: close.x, y: close.y });
    hitZombie(run, close, K.stun[w.blade], w.blade >= 3, events);
    return true;
  }
  if (w.rounds > 0) {
    const far = nearestOf(run, run.zombies.filter((z) => inArc(run, z, G.range, G.halfAngle)));
    if (far) {
      w.rounds--;
      w.cooldown = G.cooldown;
      events.push({ type: 'shot', x0: p.x, y0: p.y, x1: far.x, y1: far.y, rounds: w.rounds });
      hitZombie(run, far, G.stun, w.pistolLevel >= 2, events);
      // A gunshot is loud: everything near that isn't already on her comes to look.
      for (const z of run.zombies) {
        if (z === far || z.stun > 0 || z.state === 'dormant' || z.state === 'lurk' || z.state === 'chase') continue;
        if (dist2(z, p) > G.loud ** 2) continue;
        if (z.kind === 'stalker' || z.kind === 'crawler') continue;
        z.state = 'investigate'; z.investigate = G.listen; z.noiseAt = tileOf(p); z.field = null;
      }
      return true;
    }
  }
  w.cooldown = K.cooldown;
  w.swing = { t: 0, angle: Math.atan2(p.fy, p.fx), hit: false };
  events.push({ type: 'stab', hit: false });
  return true;
}

// ---------------- The worse things ----------------

// A shriek sends every zombie within earshot running to the screamer.
function scream(run, z, events) {
  const m = MONSTERS.screamer;
  z.screamCooldown = m.cooldown;
  let called = 0;
  for (const o of run.zombies) {
    if (o === z || o.kind === 'crawler' || o.kind === 'stalker' || o.state === 'chase') continue;
    if (dist2(o, z) > m.call ** 2) continue;
    o.state = 'search';
    o.lost = 0;
    o.investigate = 0;
    o.lastSeen = { x: z.x, y: z.y }; // they come to the sound
    o.field = null;
    called++;
  }
  events.push({ type: 'scream', id: z.id, x: z.x, y: z.y, called });
}

// True while the flashlight beam is on a point: close enough, inside the cone, nothing in between.
export function inBeam(run, z) {
  const m = MONSTERS.stalker, p = run.player;
  const dx = z.x - p.x, dy = z.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > m.beamLength) return false;
  if (d > 0.3 && (dx * p.fx + dy * p.fy) / d < Math.cos(m.beamHalfAngle)) return false;
  return lineOfSight(run.map, p.x, p.y, z.x, z.y, solidFor(run));
}

function updateStalker(run, z, dt, solid, events) {
  const m = MONSTERS.stalker;
  if (z.state === 'dormant') {
    if (!run.done.fuse) return;
    z.state = 'hunt';
    z.clock = m.huntFor;
    events.push({ type: 'stalkerWakes', id: z.id });
  }
  // It hunts in spells: a long stretch on your trail, then it slinks back to its corner.
  z.clock -= dt;
  if (z.state === 'retreat') {
    followField(run, z, { c: m.start[0], r: m.start[1] }, m.farSpeed * dt, solid, dt);
    if (z.clock <= 0) { z.state = 'hunt'; z.clock = m.huntFor; events.push({ type: 'stalkerWakes', id: z.id }); }
    return;
  }
  if (z.clock <= 0) {
    z.state = 'retreat';
    z.clock = m.restFor;
    z.linger = 0;
    events.push({ type: 'stalkerRetreats', id: z.id });
    return;
  }
  // Lit, it can't move, and it stays rooted a moment after the beam leaves it.
  if (inBeam(run, z)) {
    if (z.state !== 'frozen') events.push({ type: 'frozen', id: z.id });
    z.state = 'frozen';
    z.linger = m.linger;
    return;
  }
  if (z.linger > 0) {
    z.linger -= dt;
    return;
  }
  if (z.investigate > 0) {
    z.state = 'investigate';
    z.investigate -= dt;
    followField(run, z, z.noiseAt, SURVIVOR.investigateSpeed * dt, solid, dt);
    return;
  }
  z.state = 'hunt';
  const near = dist2(z, run.player) < m.near ** 2;
  followField(run, z, tileOf(run.player), (near ? m.speed : m.farSpeed) * dt, solid, dt);
}

function updateCrawler(run, z, dt, solid, events) {
  const m = MONSTERS.crawler, p = run.player;
  if (z.state === 'lurk') {
    z.timer = Math.max(0, z.timer - dt);
    if (z.timer === 0 && dist2(z, p) < m.trigger ** 2 && lineOfSight(run.map, z.x, z.y, p.x, p.y, solid)) {
      z.state = 'rattle';
      z.timer = m.rattle;
      events.push({ type: 'rattle', id: z.id, x: z.x, y: z.y });
    }
  } else if (z.state === 'rattle') {
    z.timer -= dt;
    if (z.timer <= 0) {
      z.state = 'lunge';
      z.timer = m.lungeTime;
      events.push({ type: 'lunge', id: z.id });
    }
  } else if (z.state === 'lunge') {
    z.timer -= dt;
    moveToward(run, z, p, m.lungeSpeed * dt, solid);
    if (z.timer <= 0) { z.state = 'return'; z.field = null; }
  } else {
    followField(run, z, z.lair, m.crawlSpeed * dt, solid, dt);
    if (dist2(z, center(z.lair)) < 0.02) { z.state = 'lurk'; z.timer = m.rest; z.fx = 0; z.fy = 1; }
  }
}

// Brutes walk through cars, bins and trees; whatever they step into is flattened.
function bruteSolid(run, solid) {
  return (map, c, r) => (map.rows[r]?.[c] === 'x' ? false : solid(map, c, r));
}

function smashUnder(run, z, events) {
  const { map } = run;
  for (let r = Math.floor(z.y - z.r); r <= Math.floor(z.y + z.r); r++) {
    for (let c = Math.floor(z.x - z.r); c <= Math.floor(z.x + z.r); c++) {
      if (map.rows[r]?.[c] !== 'x' || !map.solid[r * map.w + c]) continue;
      map.solid[r * map.w + c] = 0;
      run.smashed.push({ c, r });
      events.push({ type: 'smash', c, r });
    }
  }
}

// Returns true when the target point is reached.
function moveToward(run, z, target, step, solid) {
  const dx = target.x - z.x, dy = target.y - z.y;
  const d = Math.hypot(dx, dy);
  if (d <= step) {
    moveCircle(run.map, z, dx, dy, solid);
    return true;
  }
  z.fx = dx / d;
  z.fy = dy / d;
  moveCircle(run.map, z, z.fx * step, z.fy * step, solid);
  return false;
}

function followField(run, z, goal, step, solid, dt) {
  const key = goal.c + ',' + goal.r;
  z.fieldAge += dt;
  if (!z.field || z.fieldKey !== key || z.fieldAge > SURVIVOR.repath) {
    z.field = distanceField(run.map, [goal], solid);
    z.fieldKey = key;
    z.fieldAge = 0;
  }
  const t = tileOf(z);
  if (t.c === goal.c && t.r === goal.r) {
    moveToward(run, z, center(goal), step, solid);
    return;
  }
  const n = nextStep(run.map, z.field, t.c, t.r);
  if (n) moveToward(run, z, center(n), step, solid);
  else moveToward(run, z, center(t), step, solid); // pushed off-grid: recentre
}
