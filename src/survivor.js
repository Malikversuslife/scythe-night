// Campaign B — Last Survivor. Pure simulation: no DOM, no rendering.
import { parseMap, moveCircle, lineOfSight, distanceField, nextStep, isSolid, dist2, tileOf, center } from './world.js';

// '#' building, 'x' crates/bins (solid), '.' street, 'P' start,
// 'F' maintenance kiosk (fuse), 'B' refuge power box, 'L' courtyard bell, 'R' refuge door.
export const SURVIVOR_MAP = [
  '#############',
  '######R######',
  '##x.......x##',
  '##....L....##',
  '##.........##',
  '####.###.####',
  '#...........#',
  '#.##.##.##.B#',
  '#.##.##.##..#',
  '#...........#',
  '###.##.##.###',
  '#...#...#...#',
  '#.x.#.#.#.x.#',
  '#...........#',
  '#.##.###.##.#',
  '#F##.....##.#',
  '#...##.##...#',
  '#.#.......#.#',
  '#.#.##.##.#.#',
  '#...........#',
  '####.#.#.####',
  '#....#.#....#',
  '#.x...P...x.#',
  '#...........#',
  '#############',
];

// Patrol loops in tile coordinates; consecutive points share a row or column of open street.
export const PATROLS = [
  [[3, 17], [9, 17]],
  [[1, 11], [3, 11], [3, 13], [1, 13]],
  [[1, 9], [11, 9]],
  [[11, 6], [1, 6]],
  [[3, 4], [9, 4], [9, 2], [3, 2]],
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

export function createSurvivorRun() {
  const map = parseMap(SURVIVOR_MAP, '#xFBLR');
  const start = map.marks.P[0];
  const door = map.marks.R[0];
  const objects = {};
  for (const t of TASKS) objects[t.id] = map.marks[t.mark][0];
  const zombies = PATROLS.map((route, i) => ({
    id: i + 1,
    x: route[0][0] + 0.5, y: route[0][1] + 0.5, r: SURVIVOR.zombieRadius,
    route: route.map(([c, r]) => ({ c, r })),
    wp: 1 % route.length,
    state: 'patrol', // 'patrol' | 'chase' | 'search' | 'return'
    lost: 0,
    lastSeen: null,
    field: null, fieldKey: '', fieldAge: 0,
    fx: 1, fy: 0,
  }));
  return {
    campaign: 'survivor',
    map,
    player: { x: start.c + 0.5, y: start.r + 0.5, r: SURVIVOR.playerRadius, fx: 0, fy: -1, moving: false },
    objects,
    door,
    doorOpen: false,
    done: { fuse: false, power: false, bell: false },
    zombies,
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
    moveCircle(run.map, p, input.x * SURVIVOR.playerSpeed * dt, input.y * SURVIVOR.playerSpeed * dt, solid);
  }

  // ---- Interaction ----
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
    updateZombie(run, z, dt, solid, events);
    if (dist2(z, p) < SURVIVOR.contact ** 2) caught = true;
  }

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
  const sees = canSee(run, z);
  if (sees) {
    if (z.state !== 'chase') events.push({ type: 'spotted', id: z.id });
    z.state = 'chase';
    z.lost = 0;
    z.lastSeen = { x: run.player.x, y: run.player.y };
  } else if (z.state === 'chase' || z.state === 'search') {
    z.state = 'search';
    z.lost += dt;
    if (z.lost >= SURVIVOR.loseSightTime) {
      z.state = 'return';
      z.field = null;
    }
  }

  if (z.state === 'patrol') {
    const wp = center(z.route[z.wp]);
    if (moveToward(run, z, wp, SURVIVOR.patrolSpeed * dt, solid)) z.wp = (z.wp + 1) % z.route.length;
  } else if (z.state === 'chase' && lineOfSight(run.map, z.x, z.y, run.player.x, run.player.y, solid)) {
    moveToward(run, z, run.player, SURVIVOR.chaseSpeed * dt, solid);
  } else {
    // Search the last sighting, or walk home along the street grid.
    const goal = z.state === 'return' ? z.route[z.wp] : tileOf(z.lastSeen);
    followField(run, z, goal, (z.state === 'return' ? SURVIVOR.patrolSpeed : SURVIVOR.chaseSpeed) * dt, solid, dt);
    if (z.state === 'return' && dist2(z, center(goal)) < 0.05) {
      z.state = 'patrol';
      z.field = null;
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
