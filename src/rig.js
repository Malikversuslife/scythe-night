// Cutout ("puppet") rigs: characters are drawn from separate part images joined at
// pivots and posed procedurally. Rig units are source-image pixels; the origin is
// the point between the feet, with y pointing down (negative is up).
//
// Part fields:
//   img     image key
//   pivot   [x, y] joint inside the part image (it rotates around this point)
//   at      [x, y] where the pivot sits: in rig space, or in the parent image's pixels
//   parent  optional parent part name
//   z       draw order (higher is in front)
//   rot     (pose) => radians
//   off     optional (pose) => [dx, dy] extra offset in rig units
//   mirror  optional: draw the image flipped left-to-right about its pivot
//   stretch optional (pose) => vertical scale from the pivot, for a limb stepping toward or away
//   flow    optional (pose, k) => dx: shift for cloth, k runs 0 near the top to 1 at the hem

const sin = Math.sin;

// The robe hem moves after the body does. `drag` is a spring, so the hem also swings on stops.
// How far the scythe turns in the hand. It counters the arm on the wind-up, so the blade stays
// up behind Pip, and adds to the arm on the strike, so the blade comes all the way down.
const scytheTurn = (swing) => (swing > 0 ? -swing * 1.35 : -swing * 2.2);
const hemRipple = (p, k) => sin(p.cycle * 2 - k * 5) * 6 * k * k * p.flow;
const hemTrail = (p, k) => (sin(p.cycle * 2 - k * 5) * 6 * p.flow - p.drag * 22) * k * k;

// Legs seen from the side. A foot is planted for part of each stride and moves back at ground
// speed, so it doesn't slide; then it lifts and swings forward. Lengths are in rig units.
//   thigh, shin      bone lengths
//   hip              height of the hip above the ankle
//   stride           how far a foot travels either side of the hip
//   lift             how high a foot rises while swinging forward
//   planted          fraction of each cycle a foot spends on the ground
//   hitch            a stumble in the rhythm
//   lean, lurch      how far the body tips forward, and rocks with each step
const MARA_GAIT = { thigh: 82, shin: 72, hip: 151, leg: 186, stride: 62, lift: 40, planted: 0.4, hitch: 0 };

// Zombies step by distance travelled, so their feet stay planted at patrol or chase speed.
// `dragged` is the leg that scuffs along the ground.
function undeadGait(g, unitsPerTile) {
  return { ...g, perTile: (Math.PI * 2) / (((2 * g.stride) / g.planted) / unitsPerTile) };
}
// How tall each kind stands next to an ordinary zombie.
export const DRAW_SCALE = { stalker: 1.2, brute: 1.3 };

export const GAITS = {
  zombie: undeadGait({ thigh: 84, shin: 74, hip: 155, leg: 190, stride: 58, lift: 28, planted: 0.62, hitch: 0.06, dragged: 0.5, lean: 0.14, lurch: 0.07 }, 398 / 1.75),
  zgirl: undeadGait({ thigh: 56, shin: 53, hip: 107, leg: 138, stride: 42, lift: 24, planted: 0.6, hitch: 0.09, dragged: 0, lean: 0.05, lurch: -0.1 }, 313 / 1.75),
  // The monsters: the stalker lopes with long strides, the brute stomps and rolls.
  stalker: undeadGait({ thigh: 99, shin: 85, hip: 180, leg: 222, stride: 74, lift: 34, planted: 0.5, hitch: 0.03, dragged: 0, lean: 0.2, lurch: 0.03 }, 461 / (1.75 * 1.2)),
  screamer: undeadGait({ thigh: 52, shin: 48, hip: 98, leg: 130, stride: 40, lift: 22, planted: 0.6, hitch: 0.08, dragged: 0, lean: 0.06, lurch: -0.08 }, 321 / 1.75),
  brute: undeadGait({ thigh: 79, shin: 70, hip: 146, leg: 180, stride: 50, lift: 22, planted: 0.65, hitch: 0.04, dragged: 0, lean: 0.12, lurch: 0.12 }, 369 / (1.75 * 1.3)),
};

// Returns the thigh's angle, then the shin's and foot's relative to the part above.
function runLeg(p, shift, g) {
  const c = p.cycle / (Math.PI * 2);
  const warped = c + g.hitch * sin(c * Math.PI * 2);
  const phi = (((warped + shift) % 1) + 1) % 1;
  const drag = g.dragged === shift;
  const lift = drag ? g.lift * 0.3 : g.lift;
  let x, y, tilt;
  if (phi < g.planted) {
    const k = phi / g.planted;
    x = g.stride * (1 - 2 * k); y = 0;
    tilt = -0.2 * Math.max(0, 1 - k * 5) + 0.6 * Math.max(0, (k - 0.6) / 0.4) ** 2; // heel strike, then toe-off
  } else {
    const k = (phi - g.planted) / (1 - g.planted), e = k * k * (3 - 2 * k);
    x = g.stride * (2 * e - 1); y = lift * sin(Math.PI * k);
    tilt = 0.6 * (1 - k) ** 2 - 0.25 * k ** 3;
  }
  if (drag) tilt = tilt * 0.15 + 0.28; // the toe stays down and scrapes along
  x *= p.flow; y *= p.flow; tilt *= p.flow;
  const down = g.hip + p.bob - y;
  const d = Math.min(Math.hypot(x, down), (g.thigh + g.shin) * 0.999);
  const base = Math.atan2(-x, down);
  const hipBend = Math.acos(Math.min(1, (g.thigh ** 2 + d * d - g.shin ** 2) / (2 * g.thigh * d)));
  const kneeBend = Math.acos(Math.min(1, (g.shin ** 2 + d * d - g.thigh ** 2) / (2 * g.shin * d)));
  const thigh = base - hipBend, shin = base + kneeBend;
  return [thigh, shin - thigh, tilt - shin];
}

// From the front or back a stride reads as the foot rising, not swinging sideways. The planted
// leg also stretches by the body's bob, so that foot stays on the ground.
const stepToward = (p, shift, length = 126, rise = 34) =>
  (length + p.bob - Math.max(0, sin(p.cycle + shift)) * rise * p.flow) / length;

// Seen from the front or back, an arm swings toward and away from the camera, so it shows as the
// arm getting shorter (most when it swings toward the viewer), not as a sideways rotation.
const armSwing = (p, shift) => {
  const s = sin(p.cycle + shift) * p.flow;
  return 1 - Math.max(0, s) * 0.13 - Math.max(0, -s) * 0.05;
};

// Which drawing suits a direction. Near the diagonals it keeps the previous view, so holding
// a diagonal doesn't make the character flicker between two views.
export function facingView(fx, fy, previous = 'front') {
  const ax = Math.abs(fx), ay = Math.abs(fy);
  if (ax < 0.01 && ay < 0.01) return previous;
  if (ay > ax * 1.25) return fy < 0 ? 'back' : 'front';
  if (ax > ay * 1.25) return 'side';
  return previous;
}

export const RIGS = {
  reaper: {
    height: 390,
    parts: {
      body: { img: 'reaperBody', pivot: [105, 300], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 + p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperHead', parent: 'body', pivot: [30, 86], at: [102, 12], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 - p.slashLean * 0.1 + p.hurt * 0.25 },
      armBack: { img: 'reaperArmBack', parent: 'body', pivot: [24, 12], at: [68, 30], z: 4,
        rot: (p) => 0.2 - p.walk * 0.2 + p.swing },
      scythe: { img: 'reaperScythe', parent: 'armBack', pivot: [127, 246], at: [26, 134], z: 3,
        rot: (p) => -0.2 + scytheTurn(p.swing) },
      armFront: { img: 'reaperArmFront', parent: 'body', pivot: [22, 12], at: [136, 30], z: 4,
        rot: (p) => -0.16 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armFront', pivot: [11, 5], at: [17, 134], z: 3,
        rot: (p) => 0.16 + p.lantern },
    },
  },
  // Faces right; drawRig flips it to face left. The scythe blade points the way Pip faces.
  reaperSide: {
    height: 390,
    parts: {
      armFar: { img: 'reaperSideArm', parent: 'body', pivot: [21, 12], at: [92, 30], z: 1,
        rot: (p) => -0.75 + p.walk * 0.15 },
      lantern: { img: 'reaperLantern', parent: 'armFar', pivot: [11, 5], at: [31, 134], z: 0,
        rot: (p) => 0.75 + p.lantern },
      body: { img: 'reaperSideBody', pivot: [83, 300], at: [0, 0], z: 2, flow: hemTrail,
        rot: (p) => p.flow * 0.06 + p.slashLean * 0.16,
        off: (p) => [p.lunge, -p.bob] },
      head: { img: 'reaperSideHead', parent: 'body', pivot: [47, 86], at: [90, 12], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.02 - p.flow * 0.05 - p.slashLean * 0.12 - p.hurt * 0.25 },
      armNear: { img: 'reaperSideArm', parent: 'body', pivot: [21, 12], at: [80, 30], z: 5,
        rot: (p) => -0.2 - p.walk * 0.25 + p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armNear', pivot: [127, 246], at: [31, 134], z: 4,
        rot: (p) => 0.2 + scytheTurn(p.swing) },
    },
  },
  // Seen from behind, so the scythe is in the hand on the right of the picture.
  reaperBack: {
    height: 390,
    parts: {
      body: { img: 'reaperBackBody', pivot: [97, 300], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 - p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperBackHead', parent: 'body', pivot: [36, 86], at: [95, 12], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 + p.slashLean * 0.1 + p.hurt * 0.25 },
      armL: { img: 'reaperBackArm', parent: 'body', pivot: [22, 12], at: [62, 30], z: 4,
        rot: (p) => 0.16 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armL', pivot: [11, 5], at: [35, 134], z: 3,
        rot: (p) => -0.16 + p.lantern },
      armR: { img: 'reaperBackArm', mirror: true, parent: 'body', pivot: [22, 12], at: [130, 30], z: 4,
        rot: (p) => -0.2 - p.walk * 0.2 - p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armR', pivot: [127, 246], at: [9, 134], z: 3,
        rot: (p) => 0.2 - scytheTurn(p.swing) },
    },
  },
  // Realistic proportions: legs are about half her height. Units are source pixels, feet at 0.
  mara: {
    height: 350,
    parts: {
      legL: { img: 'maraLeg', mirror: true, pivot: [24, 10], at: [-12, -186], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, 0, 186, 44) },
      legR: { img: 'maraLeg', pivot: [24, 10], at: [12, -186], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, Math.PI, 186, 44) },
      body: { img: 'maraBody', pivot: [36, 102], at: [0, -172], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, -p.bob] },
      armBack: { img: 'maraArmBack', parent: 'body', pivot: [10, 10], at: [13, 13], z: 4,
        rot: (p) => 0.04 + sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, 0) },
      armFront: { img: 'maraArmFront', parent: 'body', pivot: [16, 10], at: [60, 13], z: 4,
        rot: (p) => -0.03 - sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) * (1 - p.alert * 0.22) },
      head: { img: 'maraHead', parent: 'body', pivot: [28, 73], at: [36, 9], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
    },
  },
  // Faces right; drawRig flips it to face left.
  maraSide: {
    height: 350,
    parts: {
      farThigh: { img: 'maraSideThighFar', pivot: [24, 10], at: [6, -186], z: 0,
        off: (p) => [0, -p.bob], rot: (p) => runLeg(p, 0.5, MARA_GAIT)[0] },
      farFoot: { img: 'maraSideFootFar', parent: 'farShin', pivot: [17, 7], at: [17, 79], z: 0,
        rot: (p) => runLeg(p, 0.5, MARA_GAIT)[2] },
      farShin: { img: 'maraSideShinFar', parent: 'farThigh', pivot: [23, 7], at: [23, 92], z: 0,
        rot: (p) => runLeg(p, 0.5, MARA_GAIT)[1] },
      armFar: { img: 'maraSideArm', parent: 'body', pivot: [14, 10], at: [52, 16], z: 1,
        rot: (p) => -0.08 + sin(p.cycle - 0.4) * 0.5 * p.flow },
      thigh: { img: 'maraSideThigh', pivot: [24, 10], at: [-2, -186], z: 2,
        off: (p) => [0, -p.bob], rot: (p) => runLeg(p, 0, MARA_GAIT)[0] },
      foot: { img: 'maraSideFoot', parent: 'shin', pivot: [17, 7], at: [17, 79], z: 2,
        rot: (p) => runLeg(p, 0, MARA_GAIT)[2] },
      shin: { img: 'maraSideShin', parent: 'thigh', pivot: [23, 7], at: [23, 92], z: 2,
        rot: (p) => runLeg(p, 0, MARA_GAIT)[1] },
      body: { img: 'maraSideBody', pivot: [52, 111], at: [0, -172], z: 3,
        rot: (p) => p.flow * 0.08 + sin(p.t * 1.8) * 0.01, off: (p) => [0, -p.bob] },
      head: { img: 'maraSideHead', parent: 'body', pivot: [28, 68], at: [54, 9], z: 6,
        rot: (p) => sin(p.t * 2) * 0.015 - p.flow * 0.05 - sin(p.cycle * 2) * 0.015 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
      armNear: { img: 'maraSideArmFront', parent: 'body', pivot: [14, 10], at: [48, 16], z: 5,
        rot: (p) => -0.08 - sin(p.cycle - 0.4) * 0.5 * p.flow - p.alert * 0.4 },
    },
  },
  // Seen from behind, with her backpack in the middle of her back.
  maraBack: {
    height: 350,
    parts: {
      legL: { img: 'maraBackLeg', mirror: true, pivot: [26, 10], at: [-12, -186], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, 0, 186, 44) },
      legR: { img: 'maraBackLeg', pivot: [26, 10], at: [12, -186], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, Math.PI, 186, 44) },
      armL: { img: 'maraBackArm', parent: 'body', pivot: [11, 10], at: [20, 13], z: 4,
        rot: (p) => 0.04 + sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) },
      armR: { img: 'maraBackArm', mirror: true, parent: 'body', pivot: [11, 10], at: [62, 13], z: 4,
        rot: (p) => -0.04 - sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, 0) },
      body: { img: 'maraBackBody', pivot: [40, 106], at: [0, -172], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, -p.bob] },
      head: { img: 'maraBackHead', parent: 'body', pivot: [28, 67], at: [40, 9], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow },
    },
  },
  ...undeadViews('zombie', GAITS.zombie, {
    height: 398, armY: 17,
    front: { hip: [53, 146], neck: [30, 86], neckAt: [49, 8], arm: [17, 10], armX: [17, 80], hipX: 12, leg: [23, 10] },
    side: { hip: [42, 161], neck: [28, 86], neckAt: [37, 8], arm: [20, 10], armX: [29, 35], leg: [20, 10], kneeAt: [23, 94], knee: [23, 7], ankleAt: [19, 81], ankle: [19, 7], legX: [-4, 5], legY: -190 },
    back: { hip: [55, 133], neck: [32, 86], neckAt: [52, 8], arm: [14, 10], armX: [32, 69], hipX: 13, leg: [24, 10] },
    bodyY: -166, sideBodyY: -166, legY: -190,
  }),
  ...undeadViews('zgirl', GAITS.zgirl, {
    height: 313, armY: 17,
    front: { hip: [42, 147], neck: [33, 74], neckAt: [44, 8], arm: [12, 10], armX: [28, 61], hipX: 11, leg: [20, 10] },
    side: { hip: [48, 153], neck: [33, 74], neckAt: [37, 8], arm: [11, 10], armX: [31, 37], leg: [24, 10], kneeAt: [18, 66], knee: [18, 7], ankleAt: [19, 60], ankle: [19, 7], legX: [-4, 5], legY: -138 },
    back: { hip: [49, 149], neck: [29, 74], neckAt: [39, 8], arm: [10, 10], armX: [27, 53], hipX: 9, leg: [17, 10] },
    bodyY: -94, sideBodyY: -94, legY: -138,
  }),
  ...undeadViews('stalker', GAITS.stalker, {
    height: 461, armY: 22,
    front: { hip: [51, 177], neck: [20, 89], neckAt: [46, 8], arm: [12, 10], armX: [12, 78], hipX: 11, leg: [22, 10] },
    side: { hip: [52, 193], neck: [24, 89], neckAt: [44, 8], arm: [13, 10], armX: [33, 39], leg: [22, 10], kneeAt: [20, 109], knee: [20, 7], ankleAt: [17, 92], ankle: [17, 7], legX: [-4, 5], legY: -222 },
    back: { hip: [56, 221], neck: [18, 89], neckAt: [46, 8], arm: [14, 10], armX: [10, 81], hipX: 11, leg: [22, 10] },
    bodyY: -194, sideBodyY: -194, legY: -222,
  }),
  ...undeadViews('screamer', GAITS.screamer, {
    height: 321, armY: 17,
    front: { hip: [35, 155], neck: [29, 80], neckAt: [36, 8], arm: [14, 10], armX: [19, 51], hipX: 9, leg: [18, 10] },
    side: { hip: [38, 165], neck: [24, 80], neckAt: [32, 8], arm: [13, 10], armX: [25, 31], leg: [20, 10], kneeAt: [11, 61], knee: [11, 7], ankleAt: [12, 55], ankle: [12, 7], legX: [-4, 5], legY: -130 },
    back: { hip: [32, 167], neck: [25, 80], neckAt: [40, 8], arm: [12, 10], armX: [18, 60], hipX: 9, leg: [20, 10] },
    bodyY: -88, sideBodyY: -88, legY: -130,
  }),
  ...undeadViews('brute', GAITS.brute, {
    height: 369, armY: 24,
    front: { hip: [61, 144], neck: [28, 69], neckAt: [60, 8], arm: [24, 10], armX: [23, 95], hipX: 15, leg: [30, 10] },
    side: { hip: [46, 179], neck: [30, 69], neckAt: [62, 8], arm: [28, 10], armX: [53, 59], leg: [29, 10], kneeAt: [28, 89], knee: [28, 7], ankleAt: [25, 77], ankle: [25, 7], legX: [-4, 5], legY: -180 },
    back: { hip: [62, 173], neck: [33, 69], neckAt: [58, 8], arm: [26, 10], armX: [22, 99], hipX: 14, leg: [28, 10] },
    bodyY: -157, sideBodyY: -157, legY: -180,
  }),
};

// Both zombies share one structure, with their own art, measurements and gait. Each has one
// arm raised and one dangling, and rocks and lolls with its limp. In the side view they reach ahead.
function undeadViews(k, g, m) {
  const Cap = (s) => k + s;
  const tip = (p) => g.lean * p.flow + 0.03 + sin(p.t * 1.7) * 0.03 + (g.lurch + sin(p.cycle) * g.lurch) * p.flow;
  const loll = (p, phase) => sin(p.t * 2.3 + phase) * 0.08 + sin(p.cycle + phase) * 0.13 * p.flow - g.lurch * p.flow;
  const facing = (view, images) => {
    const v = m[view];
    return {
      height: m.height,
      parts: {
        legL: { img: images.leg, mirror: true, pivot: v.leg, at: [-v.hipX, m.legY], z: 1,
          off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, 0, g.leg, g.dragged === 0 ? 8 : g.lift) },
        legR: { img: images.leg, pivot: v.leg, at: [v.hipX, m.legY], z: 1,
          off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, Math.PI, g.leg, g.dragged === 0.5 ? 8 : g.lift) },
        body: { img: images.body, pivot: v.hip, at: [0, m.bodyY], z: 2,
          rot: (p) => sin(p.t * 1.7) * 0.03 + (g.lurch + sin(p.cycle) * g.lurch) * p.flow, off: (p) => [0, -p.bob] },
        armL: { img: images.arm, parent: 'body', pivot: v.arm, at: [v.armX[0], m.armY], z: 4,
          rot: (p) => 0.07 + sin(p.t * 3 + 1) * 0.03, stretch: (p) => armSwing(p, -0.8) },
        armR: { img: images.arm, mirror: true, parent: 'body', pivot: v.arm, at: [v.armX[1], m.armY], z: 4,
          rot: (p) => -0.1 - sin(p.t * 3) * 0.03, stretch: (p) => 0.72 + sin(p.t * 3) * 0.03 - sin(p.cycle) * 0.03 * p.flow },
        head: { img: images.head, parent: 'body', pivot: v.neck, at: v.neckAt, z: 6, rot: (p) => loll(p, 0.6) },
      },
    };
  };
  const s = m.side;
  return {
    [k]: facing('front', { leg: Cap('Leg'), body: Cap('Body'), arm: Cap('Arm'), head: Cap('Head') }),
    [k + 'Back']: facing('back', { leg: Cap('BackLeg'), body: Cap('BackBody'), arm: Cap('BackArm'), head: Cap('BackHead') }),
    // Faces right; drawRig flips it to face left.
    [k + 'Side']: {
      height: m.height,
      parts: {
        farThigh: { img: Cap('SideThighFar'), pivot: s.leg, at: [s.legX[1], s.legY], z: 0, off: (p) => [0, -p.bob], rot: (p) => runLeg(p, 0.5, g)[0] },
        farFoot: { img: Cap('SideFootFar'), parent: 'farShin', pivot: s.ankle, at: s.ankleAt, z: 0, rot: (p) => runLeg(p, 0.5, g)[2] },
        farShin: { img: Cap('SideShinFar'), parent: 'farThigh', pivot: s.knee, at: s.kneeAt, z: 0, rot: (p) => runLeg(p, 0.5, g)[1] },
        armFar: { img: Cap('SideArm'), parent: 'body', pivot: s.arm, at: [s.armX[1], m.armY], z: 1,
          rot: (p) => -0.95 + sin(p.t * 3 + 1) * 0.07 + sin(p.cycle + 1) * 0.14 * p.flow },
        thigh: { img: Cap('SideThigh'), pivot: s.leg, at: [s.legX[0], s.legY], z: 2, off: (p) => [0, -p.bob], rot: (p) => runLeg(p, 0, g)[0] },
        foot: { img: Cap('SideFoot'), parent: 'shin', pivot: s.ankle, at: s.ankleAt, z: 2, rot: (p) => runLeg(p, 0, g)[2] },
        shin: { img: Cap('SideShin'), parent: 'thigh', pivot: s.knee, at: s.kneeAt, z: 2, rot: (p) => runLeg(p, 0, g)[1] },
        body: { img: Cap('SideBody'), pivot: s.hip, at: [0, m.sideBodyY], z: 3, rot: tip, off: (p) => [0, -p.bob] },
        head: { img: Cap('SideHead'), parent: 'body', pivot: s.neck, at: s.neckAt, z: 6, rot: (p) => loll(p, 0.6) - g.lean * p.flow },
        armNear: { img: Cap('SideArm'), parent: 'body', pivot: s.arm, at: [s.armX[0], m.armY], z: 5,
          rot: (p) => -1.25 + sin(p.t * 2.6) * 0.06 + sin(p.cycle) * 0.07 * p.flow },
      },
    },
  };
}

// Default pose; callers override what they animate.
export function pose(over = {}) {
  return { t: 0, walk: 0, bob: 0, swing: 0, slashLean: 0, hurt: 0, alert: 0, flow: 0, cycle: 0, drag: 0, lantern: 0, lunge: 0, sink: 0, ...over };
}

// Pre-sorted draw list per rig.
const order = new WeakMap();
function drawOrder(rig) {
  if (!order.has(rig)) order.set(rig, Object.entries(rig.parts).sort((a, b) => a[1].z - b[1].z));
  return order.get(rig);
}

// The drawing and pose for a zombie, used by both stories.
export function undeadRig(kind, view) {
  return RIGS[view === 'side' ? kind + 'Side' : view === 'back' ? kind + 'Back' : kind];
}

export function undeadPose(time, id, s, reduced) {
  return pose({
    t: reduced ? 0 : time + id,
    flow: reduced ? 0 : s.walk,
    cycle: reduced ? 0 : s.phase,
    bob: reduced ? 0 : Math.abs(Math.sin(s.phase)) * 4 * s.walk,
  });
}

function applyChain(ctx, rig, name, p) {
  const part = rig.parts[name];
  if (part.parent) {
    const parent = rig.parts[part.parent];
    applyChain(ctx, rig, part.parent, p);
    // Move from the parent's pivot to the attach point in the parent's image.
    ctx.translate(part.at[0] - parent.pivot[0], part.at[1] - parent.pivot[1]);
  } else {
    ctx.translate(part.at[0], part.at[1]);
  }
  if (part.off) {
    const [dx, dy] = part.off(p);
    ctx.translate(dx, dy);
  }
  ctx.rotate(part.rot ? part.rot(p) : 0);
}

// Cloth is drawn in thin rows, each shifted by how far down the garment it is.
function drawFlowing(ctx, img, part, p) {
  const w = img.width, h = img.height, row = 6, top = h * 0.2;
  for (let y = 0; y < h; y += row) {
    const k = Math.max(0, (y - top) / (h - top));
    const sh = Math.min(row + 1, h - y); // one row of overlap hides the seams
    ctx.drawImage(img, 0, y, w, sh, part.flow(p, k) - part.pivot[0], y - part.pivot[1], w, sh);
  }
}

// Draw a rig with its feet at (x, y) in canvas pixels, `h` pixels tall.
export function drawRig(ctx, images, rig, p, x, y, h, { flip = false, alpha = 1 } = {}) {
  const s = h / rig.height;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  for (const [name, part] of drawOrder(rig)) {
    const img = images[part.img];
    if (!img) continue;
    ctx.save();
    applyChain(ctx, rig, name, p);
    if (part.stretch) ctx.scale(1, part.stretch(p));
    if (part.mirror) ctx.scale(-1, 1);
    if (part.flow) drawFlowing(ctx, img, part, p);
    else ctx.drawImage(img, -part.pivot[0], -part.pivot[1]);
    ctx.restore();
  }
  ctx.restore();
}

// Image paths for every rig image whose key starts with one of `prefixes`, for a renderer's list.
export function rigFiles(prefixes) {
  return Object.fromEntries(Object.entries(RIG_IMAGES)
    .filter(([k]) => prefixes.some((p) => k.startsWith(p)))
    .map(([k, f]) => [k, `assets/img/v2/${f}.png`]));
}

export const RIG_IMAGES = {
  reaperBody: 'reaper-body', reaperHead: 'reaper-head', reaperArmBack: 'reaper-arm-back',
  reaperArmFront: 'reaper-arm-front', reaperScythe: 'reaper-scythe', reaperLantern: 'reaper-lantern',
  reaperSideHead: 'reaper-side-head', reaperSideBody: 'reaper-side-body', reaperSideArm: 'reaper-side-arm',
  reaperBackHead: 'reaper-back-head', reaperBackBody: 'reaper-back-body', reaperBackArm: 'reaper-back-arm',
  zombieHead: 'zombie-head', zombieBody: 'zombie-body', zombieArm: 'zombie-arm', zombieLeg: 'zombie-leg',
  zombieSideHead: 'zombie-side-head', zombieSideBody: 'zombie-side-body', zombieSideArm: 'zombie-side-arm',
  zombieSideThigh: 'zombie-side-thigh', zombieSideShin: 'zombie-side-shin', zombieSideFoot: 'zombie-side-foot',
  zombieSideThighFar: 'zombie-side-thigh-far', zombieSideShinFar: 'zombie-side-shin-far', zombieSideFootFar: 'zombie-side-foot-far',
  zombieBackHead: 'zombie-back-head', zombieBackBody: 'zombie-back-body', zombieBackArm: 'zombie-back-arm', zombieBackLeg: 'zombie-back-leg',
  zgirlHead: 'zgirl-head', zgirlBody: 'zgirl-body', zgirlArm: 'zgirl-arm', zgirlLeg: 'zgirl-leg',
  zgirlSideHead: 'zgirl-side-head', zgirlSideBody: 'zgirl-side-body', zgirlSideArm: 'zgirl-side-arm',
  zgirlSideThigh: 'zgirl-side-thigh', zgirlSideShin: 'zgirl-side-shin', zgirlSideFoot: 'zgirl-side-foot',
  zgirlSideThighFar: 'zgirl-side-thigh-far', zgirlSideShinFar: 'zgirl-side-shin-far', zgirlSideFootFar: 'zgirl-side-foot-far',
  zgirlBackHead: 'zgirl-back-head', zgirlBackBody: 'zgirl-back-body', zgirlBackArm: 'zgirl-back-arm', zgirlBackLeg: 'zgirl-back-leg',
  maraHead: 'mara-head', maraBody: 'mara-body', maraArmBack: 'mara-arm-back', maraArmFront: 'mara-arm-front', maraLeg: 'mara-leg',
  maraSideHead: 'mara-side-head', maraSideBody: 'mara-side-body', maraSideArm: 'mara-side-arm', maraSideArmFront: 'mara-side-arm-front',
  maraSideThigh: 'mara-side-thigh', maraSideShin: 'mara-side-shin', maraSideFoot: 'mara-side-foot',
  maraSideThighFar: 'mara-side-thigh-far', maraSideShinFar: 'mara-side-shin-far', maraSideFootFar: 'mara-side-foot-far',
  maraBackHead: 'mara-back-head', maraBackBody: 'mara-back-body', maraBackArm: 'mara-back-arm', maraBackLeg: 'mara-back-leg',
  stalkerHead: 'stalker-head',
  stalkerBody: 'stalker-body',
  stalkerArm: 'stalker-arm',
  stalkerLeg: 'stalker-leg',
  stalkerSideHead: 'stalker-side-head',
  stalkerSideBody: 'stalker-side-body',
  stalkerSideArm: 'stalker-side-arm',
  stalkerSideThigh: 'stalker-side-thigh',
  stalkerSideShin: 'stalker-side-shin',
  stalkerSideFoot: 'stalker-side-foot',
  stalkerSideThighFar: 'stalker-side-thigh-far',
  stalkerSideShinFar: 'stalker-side-shin-far',
  stalkerSideFootFar: 'stalker-side-foot-far',
  stalkerBackHead: 'stalker-back-head',
  stalkerBackBody: 'stalker-back-body',
  stalkerBackArm: 'stalker-back-arm',
  stalkerBackLeg: 'stalker-back-leg',
  screamerHead: 'screamer-head',
  screamerBody: 'screamer-body',
  screamerArm: 'screamer-arm',
  screamerLeg: 'screamer-leg',
  screamerSideHead: 'screamer-side-head',
  screamerSideBody: 'screamer-side-body',
  screamerSideArm: 'screamer-side-arm',
  screamerSideThigh: 'screamer-side-thigh',
  screamerSideShin: 'screamer-side-shin',
  screamerSideFoot: 'screamer-side-foot',
  screamerSideThighFar: 'screamer-side-thigh-far',
  screamerSideShinFar: 'screamer-side-shin-far',
  screamerSideFootFar: 'screamer-side-foot-far',
  screamerBackHead: 'screamer-back-head',
  screamerBackBody: 'screamer-back-body',
  screamerBackArm: 'screamer-back-arm',
  screamerBackLeg: 'screamer-back-leg',
  bruteHead: 'brute-head',
  bruteBody: 'brute-body',
  bruteArm: 'brute-arm',
  bruteLeg: 'brute-leg',
  bruteSideHead: 'brute-side-head',
  bruteSideBody: 'brute-side-body',
  bruteSideArm: 'brute-side-arm',
  bruteSideThigh: 'brute-side-thigh',
  bruteSideShin: 'brute-side-shin',
  bruteSideFoot: 'brute-side-foot',
  bruteSideThighFar: 'brute-side-thigh-far',
  bruteSideShinFar: 'brute-side-shin-far',
  bruteSideFootFar: 'brute-side-foot-far',
  bruteBackHead: 'brute-back-head',
  bruteBackBody: 'brute-back-body',
  bruteBackArm: 'brute-back-arm',
  bruteBackLeg: 'brute-back-leg',
  crawlerFront: 'crawler-front',
  crawlerSide: 'crawler-side',
  crawlerBack: 'crawler-back',
  wraithFront: 'wraith-front',
  wraithSide: 'wraith-side',
  wraithBack: 'wraith-back',
};
