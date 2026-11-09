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
//   show    optional (pose) => false hides the part, for things held only some of the time

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
// How far the hips drop while walking, so a leg can reach the ground at the far ends of a stride
// with a little knee bend to spare. Without it the planted foot would lift and slide there.
const crouchFor = (g) => Math.max(0, g.hip - Math.sqrt(((g.thigh + g.shin) * 0.96) ** 2 - g.stride ** 2));

// Characters step by distance travelled: `perTile` is how far the walk cycle turns per tile, so
// planted feet keep pace with the ground at any speed.
function undeadGait(g, unitsPerTile) {
  return { ...g, crouch: crouchFor(g), perTile: (Math.PI * 2) / (((2 * g.stride) / g.planted) / unitsPerTile) };
}
// Survivors are drawn 1.75 tiles tall, and their rigs are 338 units tall.
const humanGait = (g) => undeadGait(g, 338 / 1.75);

// Each survivor's legs, measured from their figure. Mara's are the reference for her running speed.
export const HUMAN_GAITS = {
  mara: humanGait({ thigh: 84, shin: 69, hip: 151, leg: 184, stride: 43, lift: 30, planted: 0.4, hitch: 0 }),
  theo: humanGait({ thigh: 84, shin: 69, hip: 151, leg: 184, stride: 43, lift: 30, planted: 0.4, hitch: 0 }),
  kate: humanGait({ thigh: 84, shin: 69, hip: 151, leg: 184, stride: 43, lift: 30, planted: 0.4, hitch: 0 }),
  reyes: humanGait({ thigh: 84, shin: 69, hip: 151, leg: 184, stride: 43, lift: 30, planted: 0.4, hitch: 0 }),
};
export const MARA_GAIT = HUMAN_GAITS.mara;

// How fast Mara's legs cycle at a run speed (tiles per second), so a planted foot moves back exactly
// as fast as the ground passes under her. She's drawn 1.75 tiles tall.
export const maraCadence = (tilesPerSecond, drawnTiles = 1.75) =>
  (tilesPerSecond * (338 / drawnTiles) * MARA_GAIT.planted * Math.PI * 2) / (2 * MARA_GAIT.stride);

// `dragged` is the zombie leg that scuffs along the ground.
// How tall each kind stands next to an ordinary zombie.
export const DRAW_SCALE = { stalker: 1.2, brute: 1.3 };

export const GAITS = {
  zombie: undeadGait({ thigh: 86, shin: 71, hip: 155, leg: 188, stride: 46, lift: 24, planted: 0.62, hitch: 0.06, dragged: 0.5, lean: 0.14, lurch: 0.07 }, 374 / 1.75),
  zgirl: undeadGait({ thigh: 58, shin: 50, hip: 106, leg: 130, stride: 32, lift: 19, planted: 0.6, hitch: 0.09, dragged: 0, lean: 0.05, lurch: -0.1 }, 291 / 1.75),
  // The monsters: the stalker lopes with long strides, the brute stomps and rolls.
  stalker: undeadGait({ thigh: 103, shin: 83, hip: 182, leg: 222, stride: 74, lift: 34, planted: 0.5, hitch: 0.03, dragged: 0, lean: 0.2, lurch: 0.03 }, 441 / (1.75 * 1.2)),
  screamer: undeadGait({ thigh: 61, shin: 51, hip: 109, leg: 134, stride: 33, lift: 19, planted: 0.6, hitch: 0.08, dragged: 0, lean: 0.06, lurch: -0.08 }, 297 / 1.75),
  brute: undeadGait({ thigh: 79, shin: 67, hip: 143, leg: 174, stride: 48, lift: 21, planted: 0.65, hitch: 0.04, dragged: 0, lean: 0.12, lurch: 0.12 }, 352 / (1.75 * 1.3)),
};

// Where a foot is in its stride: `x` ahead of the hip (negative is behind), `y` above the ground,
// and the foot's tilt. `shift` is the leg's offset in the cycle (0 or 0.5).
function footPath(p, shift, g) {
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
  return { x: x * p.flow, y: y * p.flow, tilt: tilt * p.flow };
}

// Returns the thigh's angle, then the shin's and foot's relative to the part above.
function runLeg(p, shift, g) {
  const { x, y, tilt } = footPath(p, shift, g);
  const down = g.hip - g.crouch * p.flow + p.bob - y;
  const d = Math.min(Math.hypot(x, down), (g.thigh + g.shin) * 0.999);
  const base = Math.atan2(-x, down);
  const hipBend = Math.acos(Math.min(1, (g.thigh ** 2 + d * d - g.shin ** 2) / (2 * g.thigh * d)));
  const kneeBend = Math.acos(Math.min(1, (g.shin ** 2 + d * d - g.thigh ** 2) / (2 * g.shin * d)));
  const thigh = base - hipBend, shin = base + kneeBend;
  return [thigh, shin - thigh, tilt - shin];
}

// From the front or back, the legs are single images that stretch from the hip. A foot follows the
// same stride as from the side: planted, it stays put on the ground while the body passes over it,
// so the leg reaches further down the screen (or up it, walking away: `dir` -1); then it lifts and
// comes forward. The leg also takes up the body's bob and crouch, so the planted foot never slides.
const stepToward = (p, shift, length, g, dir = 1) => {
  const f = footPath(p, shift, g);
  return (length + p.bob - g.crouch * p.flow + dir * f.x * DEPTH - f.y) / length;
};
// How much of the stride shows as depth from the front or back. All of it reads as one leg far
// longer than the other; half keeps the feet nearly planted and the legs believable.
const DEPTH = 0.5;
// The figures were painted with their feet shoulder-width apart; the legs turn in to hip width.
const STANCE = 0.075;

// Seen from the front or back, an arm swings toward and away from the camera. That shows as the
// arm getting a touch shorter, never enough to make the two arms look mismatched.
const armSwing = (p, shift) => {
  const s = sin(p.cycle + shift) * p.flow;
  return 1 - Math.max(0, s) * 0.04;
};

// A survivor's near arm seen from the side: it swings as she runs and comes up when she's alert.
const survivorNearArm = (p) => -0.08 - sin(p.cycle - 0.4) * 0.5 * p.flow - p.alert * 0.4;

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
  // ---- Keepers (generated) ----
  // Pip, cut from one full figure per view. Units are source pixels; the hem's middle is at 0.
  reaper: {
    height: 366,
    parts: {
      body: { img: 'reaperBody', pivot: [99.6, 327.3], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 + p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperHead', parent: 'body', pivot: [28.1, 43.6], at: [98.6, 5.3], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 - p.slashLean * 0.1 + p.hurt * 0.25 },
      armBack: { img: 'reaperArmBack', parent: 'body', pivot: [24.4, -13.6], at: [28.6, 39.1], z: 4,
        rot: (p) => 0.093 - p.walk * 0.2 + p.swing },
      scythe: { img: 'reaperScythe', parent: 'armBack', pivot: [127, 246], at: [28.7, 113.6], z: 3,
        rot: (p) => -0.093 + scytheTurn(p.swing) },
      armFront: { img: 'reaperArmFront', parent: 'body', pivot: [20.3, -13.2], at: [168.6, 39.1], z: 4,
        rot: (p) => -0.096 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armFront', pivot: [11, 5], at: [15.8, 113.6], z: 3,
        rot: (p) => 0.096 + p.lantern },
    },
  },
  // Pip from the side. Faces right; drawRig flips it to face left. The scythe blade points the way they face.
  reaperSide: {
    height: 366,
    parts: {
      armFar: { img: 'reaperSideArm', parent: 'body', pivot: [15.4, 10.6], at: [66.6, 27.3], z: 1,
        rot: (p) => -0.75 + p.walk * 0.15 },
      lantern: { img: 'reaperLantern', parent: 'armFar', pivot: [11, 5], at: [25.8, 130.5], z: 0,
        rot: (p) => 0.75 + p.lantern },
      body: { img: 'reaperSideBody', pivot: [64.9, 326.2], at: [0, 0], z: 2, flow: hemTrail,
        rot: (p) => p.flow * 0.06 + p.slashLean * 0.16,
        off: (p) => [p.lunge, -p.bob] },
      head: { img: 'reaperSideHead', parent: 'body', pivot: [24.8, 44.8], at: [52.5, 5.3], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.02 - p.flow * 0.05 - p.slashLean * 0.12 - p.hurt * 0.25 },
      armNear: { img: 'reaperSideArm', parent: 'body', pivot: [15.4, 10.6], at: [58.6, 27.3], z: 5,
        rot: (p) => -0.2 - p.walk * 0.25 + p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armNear', pivot: [127, 246], at: [25.8, 130.5], z: 4,
        rot: (p) => 0.2 + scytheTurn(p.swing) },
    },
  },
  // Pip from behind, so the scythe is in the hand on the right of the picture.
  reaperBack: {
    height: 366,
    parts: {
      body: { img: 'reaperBackBody', pivot: [97.1, 325.9], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 - p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperBackHead', parent: 'body', pivot: [26.9, 45], at: [95.8, 5.3], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 + p.slashLean * 0.1 + p.hurt * 0.25 },
      armL: { img: 'reaperBackArmL', parent: 'body', pivot: [29.8, 1.7], at: [31.3, 38.8], z: 4,
        rot: (p) => 0.058 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armL', pivot: [11, 5], at: [29.6, 126.2], z: 3,
        rot: (p) => -0.058 + p.lantern },
      armR: { img: 'reaperBackArm', parent: 'body', pivot: [16.4, 2.1], at: [160.2, 38.8], z: 4,
        rot: (p) => -0.053 - p.walk * 0.2 - p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armR', pivot: [127, 246], at: [17.3, 126.6], z: 3,
        rot: (p) => 0.053 - scytheTurn(p.swing) },
    },
  },
  // The Hollow Monk, cut from one full figure per view. Units are source pixels; the hem's middle is at 0.
  monk: {
    height: 366,
    parts: {
      body: { img: 'reaperBody', pivot: [89.9, 327.3], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 + p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperHead', parent: 'body', pivot: [25.9, 43.4], at: [89.5, 5.4], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 - p.slashLean * 0.1 + p.hurt * 0.25 },
      armBack: { img: 'reaperArmBack', parent: 'body', pivot: [35.7, -1], at: [26, 38.8], z: 4,
        rot: (p) => 0.035 - p.walk * 0.2 + p.swing },
      scythe: { img: 'reaperScythe', parent: 'armBack', pivot: [127, 246], at: [32.9, 108.2], z: 3,
        rot: (p) => -0.035 + scytheTurn(p.swing) },
      armFront: { img: 'reaperArmFront', parent: 'body', pivot: [16.2, -0.3], at: [152.9, 38.8], z: 4,
        rot: (p) => -0.044 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armFront', pivot: [11, 5], at: [17.9, 108.6], z: 3,
        rot: (p) => 0.044 + p.lantern },
    },
  },
  // The Hollow Monk from the side. Faces right; drawRig flips it to face left. The scythe blade points the way they face.
  monkSide: {
    height: 366,
    parts: {
      armFar: { img: 'reaperSideArm', parent: 'body', pivot: [15.8, 10.8], at: [67.3, 49.3], z: 1,
        rot: (p) => -0.75 + p.walk * 0.15 },
      lantern: { img: 'reaperLantern', parent: 'armFar', pivot: [11, 5], at: [26.4, 113.3], z: 0,
        rot: (p) => 0.75 + p.lantern },
      body: { img: 'reaperSideBody', pivot: [63, 325.2], at: [0, 0], z: 2, flow: hemTrail,
        rot: (p) => p.flow * 0.06 + p.slashLean * 0.16,
        off: (p) => [p.lunge, -p.bob] },
      head: { img: 'reaperSideHead', parent: 'body', pivot: [23.1, 45.8], at: [58.2, 5.4], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.02 - p.flow * 0.05 - p.slashLean * 0.12 - p.hurt * 0.25 },
      armNear: { img: 'reaperSideArm', parent: 'body', pivot: [15.8, 10.8], at: [59.3, 49.3], z: 5,
        rot: (p) => -0.2 - p.walk * 0.25 + p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armNear', pivot: [127, 246], at: [26.4, 113.3], z: 4,
        rot: (p) => 0.2 + scytheTurn(p.swing) },
    },
  },
  // The Hollow Monk from behind, so the scythe is in the hand on the right of the picture.
  monkBack: {
    height: 366,
    parts: {
      body: { img: 'reaperBackBody', pivot: [89.6, 327.4], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 - p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperBackHead', parent: 'body', pivot: [25.9, 43.6], at: [86.1, 5.4], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 + p.slashLean * 0.1 + p.hurt * 0.25 },
      armL: { img: 'reaperBackArmL', parent: 'body', pivot: [34.7, -2.2], at: [22.4, 38.7], z: 4,
        rot: (p) => 0.057 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armL', pivot: [11, 5], at: [34.4, 106.3], z: 3,
        rot: (p) => -0.057 + p.lantern },
      armR: { img: 'reaperBackArm', parent: 'body', pivot: [15.9, -0.3], at: [149.8, 38.7], z: 4,
        rot: (p) => -0.033 - p.walk * 0.2 - p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armR', pivot: [127, 246], at: [18.9, 108.2], z: 3,
        rot: (p) => 0.033 - scytheTurn(p.swing) },
    },
  },
  // The Bone King, cut from one full figure per view. Units are source pixels; the hem's middle is at 0.
  boneKing: {
    height: 366,
    parts: {
      body: { img: 'reaperBody', pivot: [101.9, 305.8], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 + p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperHead', parent: 'body', pivot: [30.5, 65.3], at: [103.2, 5.5], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 - p.slashLean * 0.1 + p.hurt * 0.25 },
      armBack: { img: 'reaperArmBack', parent: 'body', pivot: [13.7, -26.3], at: [16.5, 39.4], z: 4,
        rot: (p) => -0.017 - p.walk * 0.2 + p.swing },
      scythe: { img: 'reaperScythe', parent: 'armBack', pivot: [127, 246], at: [6.7, 64.9], z: 3,
        rot: (p) => 0.017 + scytheTurn(p.swing) },
      armFront: { img: 'reaperArmFront', parent: 'body', pivot: [22.2, -27.1], at: [190, 39.4], z: 4,
        rot: (p) => -0.005 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armFront', pivot: [11, 5], at: [27.3, 64.5], z: 3,
        rot: (p) => 0.005 + p.lantern },
    },
  },
  // The Bone King from the side. Faces right; drawRig flips it to face left. The scythe blade points the way they face.
  boneKingSide: {
    height: 366,
    parts: {
      armFar: { img: 'reaperSideArm', parent: 'body', pivot: [19.4, 10.9], at: [68.8, 41.4], z: 1,
        rot: (p) => -0.75 + p.walk * 0.15 },
      lantern: { img: 'reaperLantern', parent: 'armFar', pivot: [11, 5], at: [28.5, 132.2], z: 0,
        rot: (p) => 0.75 + p.lantern },
      body: { img: 'reaperSideBody', pivot: [54, 327.7], at: [0, 0], z: 2, flow: hemTrail,
        rot: (p) => p.flow * 0.06 + p.slashLean * 0.16,
        off: (p) => [p.lunge, -p.bob] },
      head: { img: 'reaperSideHead', parent: 'body', pivot: [17.2, 43.4], at: [64.9, 5.5], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.02 - p.flow * 0.05 - p.slashLean * 0.12 - p.hurt * 0.25 },
      armNear: { img: 'reaperSideArm', parent: 'body', pivot: [19.4, 10.9], at: [60.8, 41.4], z: 5,
        rot: (p) => -0.2 - p.walk * 0.25 + p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armNear', pivot: [127, 246], at: [28.5, 132.2], z: 4,
        rot: (p) => 0.2 + scytheTurn(p.swing) },
    },
  },
  // The Bone King from behind, so the scythe is in the hand on the right of the picture.
  boneKingBack: {
    height: 366,
    parts: {
      body: { img: 'reaperBackBody', pivot: [109.7, 308.1], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 - p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperBackHead', parent: 'body', pivot: [28, 62.9], at: [95.9, 5.4], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 + p.slashLean * 0.1 + p.hurt * 0.25 },
      armL: { img: 'reaperBackArmL', parent: 'body', pivot: [17.7, -18.8], at: [16.9, 39.2], z: 4,
        rot: (p) => -0.052 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armL', pivot: [11, 5], at: [7.6, 70.7], z: 3,
        rot: (p) => 0.052 + p.lantern },
      armR: { img: 'reaperBackArm', parent: 'body', pivot: [18, -18], at: [174.9, 39.2], z: 4,
        rot: (p) => 0.066 - p.walk * 0.2 - p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armR', pivot: [127, 246], at: [29.4, 71.9], z: 3,
        rot: (p) => -0.066 - scytheTurn(p.swing) },
    },
  },
  // ---- end keepers ----
  // ---- Survivor humans (generated) ----
  // Mara, cut from one full figure per view, so every part matches. Units are source pixels, feet at 0.
  mara: {
    height: 338,
    parts: {
      legL: { img: 'maraLegL', pivot: [43, 0], at: [-16.9, -187.5], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 187.5, HUMAN_GAITS.mara, 1) },
      legR: { img: 'maraLeg', pivot: [16.3, 0], at: [16.5, -187.5], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 187.5, HUMAN_GAITS.mara, 1) },
      body: { img: 'maraBody', pivot: [34.6, 111.1], at: [0, -187.5], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob] },
      // The left hand (picture right) holds the blade or the gun.
      armBack: { img: 'maraArmBack', parent: 'body', pivot: [5.7, 7.4], at: [69.6, 29.8], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01 + p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      knife: { img: 'maraKnife', parent: 'armBack', pivot: [6, 6], at: [39.1, 113.3], z: 5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.3 },
      machete: { img: 'maraMachete', parent: 'armBack', pivot: [6, 6], at: [39.1, 113.3], z: 5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.3 },
      pistol: { img: 'maraPistol', parent: 'armBack', pivot: [8, 7], at: [39.1, 113.3], z: 5, show: (p) => p.gun > 0, rot: () => -0.14 },
      // The right hand (picture left) holds the flashlight.
      armFront: { img: 'maraArmFront', parent: 'body', pivot: [40.8, 7.1], at: [0.7, 29.1], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) * (1 - p.alert * 0.22) },
      torch: { img: 'maraTorch', parent: 'armFront', pivot: [3.5, 10], at: [5.5, 115.6], z: 5, rot: () => 0.14 },
      head: { img: 'maraHead', parent: 'body', pivot: [22, 44], at: [34.4, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
    },
  },
  // Mara from the side. Faces right; drawRig flips it to face left.
  maraSide: {
    height: 338,
    parts: {
      farThigh: { img: 'maraSideThighFar', pivot: [23.2, 4], at: [6, -183.6], z: 0,
        off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.mara)[0] },
      farShin: { img: 'maraSideShinFar', parent: 'farThigh', pivot: [18, 7], at: [18, 88], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.mara)[1] },
      farFoot: { img: 'maraSideFootFar', parent: 'farShin', pivot: [20, 7], at: [20, 76], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.mara)[2] },
      armFar: { img: 'maraSideArm', parent: 'body', pivot: [12.8, 9.9], at: [49.8, 21.3], z: 1,
        rot: (p) => (-0.08 + sin(p.cycle - 0.4) * 0.5 * p.flow) * (1 - Math.max(p.stab, p.gun)) - p.stab * 1.35 - p.gun * 1.5 },
      knife: { img: 'maraKnife', parent: 'armFar', pivot: [6, 6], at: [19.9, 123.1], z: 1.5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.12 },
      machete: { img: 'maraMachete', parent: 'armFar', pivot: [6, 6], at: [19.9, 123.1], z: 1.5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.12 },
      pistol: { img: 'maraPistol', parent: 'armFar', pivot: [8, 7], at: [19.9, 123.1], z: 1.5, show: (p) => p.gun > 0 },
      thigh: { img: 'maraSideThigh', pivot: [23.2, 4], at: [-2, -183.6], z: 2,
        off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0, HUMAN_GAITS.mara)[0] },
      shin: { img: 'maraSideShin', parent: 'thigh', pivot: [18, 7], at: [18, 88], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.mara)[1] },
      foot: { img: 'maraSideFoot', parent: 'shin', pivot: [20, 7], at: [20, 76], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.mara)[2] },
      body: { img: 'maraSideBody', pivot: [48.8, 103.9], at: [0, -187.6], z: 3,
        rot: (p) => p.flow * 0.08 + sin(p.t * 1.8) * 0.01, off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob] },
      head: { img: 'maraSideHead', parent: 'body', pivot: [20, 51.4], at: [44.5, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.015 - p.flow * 0.05 - sin(p.cycle * 2) * 0.015 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
      armNear: { img: 'maraSideArmFront', parent: 'body', pivot: [12.8, 9.9], at: [45.8, 21.3], z: 5, rot: survivorNearArm },
      // The flashlight stays pointed ahead and a little down, whatever the arm is doing.
      torch: { img: 'maraTorchSide', parent: 'armNear', pivot: [9, 4], at: [19.9, 123.1], z: 5.5,
        rot: (p) => 0.22 - p.flow * 0.08 - survivorNearArm(p) },
    },
  },
  // Mara from behind. The left hand (picture left) holds the weapon.
  maraBack: {
    height: 338,
    parts: {
      legL: { img: 'maraBackLegL', pivot: [38.3, 0], at: [-17.1, -185.9], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 185.9, HUMAN_GAITS.mara, -1) },
      legR: { img: 'maraBackLeg', pivot: [16.6, 0], at: [16.7, -185.9], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 185.9, HUMAN_GAITS.mara, -1) },
      armL: { img: 'maraBackArmL', parent: 'body', pivot: [40.9, 7.9], at: [0.6, 29.3], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01 - p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      armR: { img: 'maraBackArm', parent: 'body', pivot: [5.2, 7.1], at: [70.8, 30.2], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) },
      knife: { img: 'maraKnife', parent: 'armL', pivot: [6, 6], at: [5.8, 114.3], z: 4.5, show: (p) => !p.gun && p.blade < 3, rot: () => 0.3 },
      machete: { img: 'maraMachete', parent: 'armL', pivot: [6, 6], at: [5.8, 114.3], z: 4.5, show: (p) => !p.gun && p.blade >= 3, rot: () => 0.3 },
      pistol: { img: 'maraPistol', parent: 'armL', pivot: [8, 7], at: [5.8, 114.3], z: 4.5, show: (p) => p.gun > 0, rot: () => 0.14 },
      body: { img: 'maraBackBody', pivot: [35.1, 112.5], at: [0, -185.9], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.mara.crouch * p.flow - p.bob] },
      head: { img: 'maraBackHead', parent: 'body', pivot: [22.4, 44.5], at: [34.5, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow },
    },
  },
  // Theo, cut from one full figure per view, so every part matches. Units are source pixels, feet at 0.
  theo: {
    height: 338,
    parts: {
      legL: { img: 'maraLegL', pivot: [48.8, 0], at: [-16.7, -172.9], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 172.9, HUMAN_GAITS.theo, 1) },
      legR: { img: 'maraLeg', pivot: [22.6, 0], at: [22.4, -172.9], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 172.9, HUMAN_GAITS.theo, 1) },
      body: { img: 'maraBody', pivot: [69.8, 129.2], at: [0, -172.9], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob] },
      // The left hand (picture right) holds the blade or the gun.
      armBack: { img: 'maraArmBack', parent: 'body', pivot: [7.8, 4.1], at: [109.4, 30.3], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01 + p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      knife: { img: 'maraKnife', parent: 'armBack', pivot: [6, 6], at: [39.3, 115.5], z: 5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.3 },
      machete: { img: 'maraMachete', parent: 'armBack', pivot: [6, 6], at: [39.3, 115.5], z: 5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.3 },
      pistol: { img: 'maraPistol', parent: 'armBack', pivot: [8, 7], at: [39.3, 115.5], z: 5, show: (p) => p.gun > 0, rot: () => -0.14 },
      // The right hand (picture left) holds the flashlight.
      armFront: { img: 'maraArmFront', parent: 'body', pivot: [39.9, 3.9], at: [32.7, 30.5], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) * (1 - p.alert * 0.22) },
      torch: { img: 'maraTorch', parent: 'armFront', pivot: [3.5, 10], at: [5.9, 117.5], z: 5, rot: () => 0.14 },
      head: { img: 'maraHead', parent: 'body', pivot: [16.9, 40.9], at: [71, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
    },
  },
  // Theo from the side. Faces right; drawRig flips it to face left.
  theoSide: {
    height: 338,
    parts: {
      farThigh: { img: 'maraSideThighFar', pivot: [30.9, 4], at: [6, -183.7], z: 0,
        off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.theo)[0] },
      farShin: { img: 'maraSideShinFar', parent: 'farThigh', pivot: [32, 7], at: [32, 88], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.theo)[1] },
      farFoot: { img: 'maraSideFootFar', parent: 'farShin', pivot: [28, 7], at: [28, 76], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.theo)[2] },
      armFar: { img: 'maraSideArm', parent: 'body', pivot: [14.9, 10], at: [31.4, 25.5], z: 1,
        rot: (p) => (-0.08 + sin(p.cycle - 0.4) * 0.5 * p.flow) * (1 - Math.max(p.stab, p.gun)) - p.stab * 1.35 - p.gun * 1.5 },
      knife: { img: 'maraKnife', parent: 'armFar', pivot: [6, 6], at: [26.9, 126.7], z: 1.5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.12 },
      machete: { img: 'maraMachete', parent: 'armFar', pivot: [6, 6], at: [26.9, 126.7], z: 1.5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.12 },
      pistol: { img: 'maraPistol', parent: 'armFar', pivot: [8, 7], at: [26.9, 126.7], z: 1.5, show: (p) => p.gun > 0 },
      thigh: { img: 'maraSideThigh', pivot: [30.9, 4], at: [-2, -183.7], z: 2,
        off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0, HUMAN_GAITS.theo)[0] },
      shin: { img: 'maraSideShin', parent: 'thigh', pivot: [32, 7], at: [32, 88], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.theo)[1] },
      foot: { img: 'maraSideFoot', parent: 'shin', pivot: [28, 7], at: [28, 76], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.theo)[2] },
      body: { img: 'maraSideBody', pivot: [29.8, 108.4], at: [0, -187.7], z: 3,
        rot: (p) => p.flow * 0.08 + sin(p.t * 1.8) * 0.01, off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob] },
      head: { img: 'maraSideHead', parent: 'body', pivot: [17.6, 47], at: [29.8, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.015 - p.flow * 0.05 - sin(p.cycle * 2) * 0.015 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
      armNear: { img: 'maraSideArmFront', parent: 'body', pivot: [14.9, 10], at: [27.4, 25.5], z: 5, rot: survivorNearArm },
      // The flashlight stays pointed ahead and a little down, whatever the arm is doing.
      torch: { img: 'maraTorchSide', parent: 'armNear', pivot: [9, 4], at: [26.9, 126.7], z: 5.5,
        rot: (p) => 0.22 - p.flow * 0.08 - survivorNearArm(p) },
    },
  },
  // Theo from behind. The left hand (picture left) holds the weapon.
  theoBack: {
    height: 338,
    parts: {
      legL: { img: 'maraBackLegL', pivot: [48.5, 0], at: [-16.2, -171.9], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 171.9, HUMAN_GAITS.theo, -1) },
      legR: { img: 'maraBackLeg', pivot: [22.8, 0], at: [22.8, -171.9], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 171.9, HUMAN_GAITS.theo, -1) },
      armL: { img: 'maraBackArmL', parent: 'body', pivot: [37.8, 4.4], at: [30.3, 29.9], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01 - p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      armR: { img: 'maraBackArm', parent: 'body', pivot: [7.8, 4], at: [107.8, 29.9], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) },
      knife: { img: 'maraKnife', parent: 'armL', pivot: [6, 6], at: [6.4, 115.4], z: 4.5, show: (p) => !p.gun && p.blade < 3, rot: () => 0.3 },
      machete: { img: 'maraMachete', parent: 'armL', pivot: [6, 6], at: [6.4, 115.4], z: 4.5, show: (p) => !p.gun && p.blade >= 3, rot: () => 0.3 },
      pistol: { img: 'maraPistol', parent: 'armL', pivot: [8, 7], at: [6.4, 115.4], z: 4.5, show: (p) => p.gun > 0, rot: () => 0.14 },
      body: { img: 'maraBackBody', pivot: [68.7, 129.1], at: [0, -171.9], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.theo.crouch * p.flow - p.bob] },
      head: { img: 'maraBackHead', parent: 'body', pivot: [17.3, 42.1], at: [69.8, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow },
    },
  },
  // Kate, cut from one full figure per view, so every part matches. Units are source pixels, feet at 0.
  kate: {
    height: 338,
    parts: {
      legL: { img: 'maraLegL', pivot: [47.5, 0], at: [-22, -183.9], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 183.9, HUMAN_GAITS.kate, 1) },
      legR: { img: 'maraLeg', pivot: [21.3, 0], at: [21.4, -183.9], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 183.9, HUMAN_GAITS.kate, 1) },
      body: { img: 'maraBody', pivot: [73.7, 121.3], at: [0, -183.9], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob] },
      // The left hand (picture right) holds the blade or the gun.
      armBack: { img: 'maraArmBack', parent: 'body', pivot: [7.3, 3.4], at: [111.4, 30.2], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01 + p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      knife: { img: 'maraKnife', parent: 'armBack', pivot: [6, 6], at: [40.6, 108.7], z: 5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.3 },
      machete: { img: 'maraMachete', parent: 'armBack', pivot: [6, 6], at: [40.6, 108.7], z: 5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.3 },
      pistol: { img: 'maraPistol', parent: 'armBack', pivot: [8, 7], at: [40.6, 108.7], z: 5, show: (p) => p.gun > 0, rot: () => -0.14 },
      // The right hand (picture left) holds the flashlight.
      armFront: { img: 'maraArmFront', parent: 'body', pivot: [40.2, 3.7], at: [37, 30.4], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) * (1 - p.alert * 0.22) },
      torch: { img: 'maraTorch', parent: 'armFront', pivot: [3.5, 10], at: [5.6, 111], z: 5, rot: () => 0.14 },
      head: { img: 'maraHead', parent: 'body', pivot: [21.8, 37.6], at: [75.3, 4.9], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
    },
  },
  // Kate from the side. Faces right; drawRig flips it to face left.
  kateSide: {
    height: 338,
    parts: {
      farThigh: { img: 'maraSideThighFar', pivot: [26.8, 4], at: [6, -183.7], z: 0,
        off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.kate)[0] },
      farShin: { img: 'maraSideShinFar', parent: 'farThigh', pivot: [22, 7], at: [22, 88], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.kate)[1] },
      farFoot: { img: 'maraSideFootFar', parent: 'farShin', pivot: [22, 7], at: [22, 76], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.kate)[2] },
      armFar: { img: 'maraSideArm', parent: 'body', pivot: [13.9, 9.9], at: [21.1, 22.2], z: 1,
        rot: (p) => (-0.08 + sin(p.cycle - 0.4) * 0.5 * p.flow) * (1 - Math.max(p.stab, p.gun)) - p.stab * 1.35 - p.gun * 1.5 },
      knife: { img: 'maraKnife', parent: 'armFar', pivot: [6, 6], at: [26.9, 123.2], z: 1.5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.12 },
      machete: { img: 'maraMachete', parent: 'armFar', pivot: [6, 6], at: [26.9, 123.2], z: 1.5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.12 },
      pistol: { img: 'maraPistol', parent: 'armFar', pivot: [8, 7], at: [26.9, 123.2], z: 1.5, show: (p) => p.gun > 0 },
      thigh: { img: 'maraSideThigh', pivot: [26.8, 4], at: [-2, -183.7], z: 2,
        off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0, HUMAN_GAITS.kate)[0] },
      shin: { img: 'maraSideShin', parent: 'thigh', pivot: [22, 7], at: [22, 88], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.kate)[1] },
      foot: { img: 'maraSideFoot', parent: 'shin', pivot: [22, 7], at: [22, 76], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.kate)[2] },
      body: { img: 'maraSideBody', pivot: [26.4, 105.6], at: [0, -187.7], z: 3,
        rot: (p) => p.flow * 0.08 + sin(p.t * 1.8) * 0.01, off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob] },
      head: { img: 'maraSideHead', parent: 'body', pivot: [17.8, 49.6], at: [22.4, 4.9], z: 6,
        rot: (p) => sin(p.t * 2) * 0.015 - p.flow * 0.05 - sin(p.cycle * 2) * 0.015 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
      armNear: { img: 'maraSideArmFront', parent: 'body', pivot: [13.9, 9.9], at: [17.1, 22.2], z: 5, rot: survivorNearArm },
      // The flashlight stays pointed ahead and a little down, whatever the arm is doing.
      torch: { img: 'maraTorchSide', parent: 'armNear', pivot: [9, 4], at: [26.9, 123.2], z: 5.5,
        rot: (p) => 0.22 - p.flow * 0.08 - survivorNearArm(p) },
    },
  },
  // Kate from behind. The left hand (picture left) holds the weapon.
  kateBack: {
    height: 338,
    parts: {
      legL: { img: 'maraBackLegL', pivot: [36.7, 0], at: [-20.9, -183.8], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 183.8, HUMAN_GAITS.kate, -1) },
      legR: { img: 'maraBackLeg', pivot: [20.5, 0], at: [20.4, -183.8], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 183.8, HUMAN_GAITS.kate, -1) },
      armL: { img: 'maraBackArmL', parent: 'body', pivot: [41.8, 7.1], at: [5.1, 29], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01 - p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      armR: { img: 'maraBackArm', parent: 'body', pivot: [9.4, 6.7], at: [77.8, 29], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) },
      knife: { img: 'maraKnife', parent: 'armL', pivot: [6, 6], at: [7.7, 117.1], z: 4.5, show: (p) => !p.gun && p.blade < 3, rot: () => 0.3 },
      machete: { img: 'maraMachete', parent: 'armL', pivot: [6, 6], at: [7.7, 117.1], z: 4.5, show: (p) => !p.gun && p.blade >= 3, rot: () => 0.3 },
      pistol: { img: 'maraPistol', parent: 'armL', pivot: [8, 7], at: [7.7, 117.1], z: 4.5, show: (p) => p.gun > 0, rot: () => 0.14 },
      body: { img: 'maraBackBody', pivot: [42.1, 117.1], at: [0, -183.8], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.kate.crouch * p.flow - p.bob] },
      head: { img: 'maraBackHead', parent: 'body', pivot: [19.4, 42], at: [41.3, 4.9], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow },
    },
  },
  // Reyes, cut from one full figure per view, so every part matches. Units are source pixels, feet at 0.
  reyes: {
    height: 338,
    parts: {
      legL: { img: 'maraLegL', pivot: [48, 0], at: [-21.7, -174.7], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 174.7, HUMAN_GAITS.reyes, 1) },
      legR: { img: 'maraLeg', pivot: [22.8, 0], at: [22.8, -174.7], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 174.7, HUMAN_GAITS.reyes, 1) },
      body: { img: 'maraBody', pivot: [70.8, 132.9], at: [0, -174.7], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob] },
      // The left hand (picture right) holds the blade or the gun.
      armBack: { img: 'maraArmBack', parent: 'body', pivot: [8.7, 2.3], at: [114.7, 29.6], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01 + p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      knife: { img: 'maraKnife', parent: 'armBack', pivot: [6, 6], at: [36.3, 114.8], z: 5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.3 },
      machete: { img: 'maraMachete', parent: 'armBack', pivot: [6, 6], at: [36.3, 114.8], z: 5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.3 },
      pistol: { img: 'maraPistol', parent: 'armBack', pivot: [8, 7], at: [36.3, 114.8], z: 5, show: (p) => p.gun > 0, rot: () => -0.14 },
      // The right hand (picture left) holds the flashlight.
      armFront: { img: 'maraArmFront', parent: 'body', pivot: [35.6, 2.7], at: [28.2, 29.9], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) * (1 - p.alert * 0.22) },
      torch: { img: 'maraTorch', parent: 'armFront', pivot: [3.5, 10], at: [5.8, 118.2], z: 5, rot: () => 0.14 },
      head: { img: 'maraHead', parent: 'body', pivot: [17, 35.4], at: [71.2, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
    },
  },
  // Reyes from the side. Faces right; drawRig flips it to face left.
  reyesSide: {
    height: 338,
    parts: {
      farThigh: { img: 'maraSideThighFar', pivot: [27.7, 4], at: [6, -183.8], z: 0,
        off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.reyes)[0] },
      farShin: { img: 'maraSideShinFar', parent: 'farThigh', pivot: [26, 7], at: [26, 88], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.reyes)[1] },
      farFoot: { img: 'maraSideFootFar', parent: 'farShin', pivot: [22, 7], at: [22, 76], z: 0,
        rot: (p) => runLeg(p, 0.5, HUMAN_GAITS.reyes)[2] },
      armFar: { img: 'maraSideArm', parent: 'body', pivot: [18.8, 9.9], at: [34.9, 25.9], z: 1,
        rot: (p) => (-0.08 + sin(p.cycle - 0.4) * 0.5 * p.flow) * (1 - Math.max(p.stab, p.gun)) - p.stab * 1.35 - p.gun * 1.5 },
      knife: { img: 'maraKnife', parent: 'armFar', pivot: [6, 6], at: [36.6, 121.4], z: 1.5, show: (p) => !p.gun && p.blade < 3, rot: () => -0.12 },
      machete: { img: 'maraMachete', parent: 'armFar', pivot: [6, 6], at: [36.6, 121.4], z: 1.5, show: (p) => !p.gun && p.blade >= 3, rot: () => -0.12 },
      pistol: { img: 'maraPistol', parent: 'armFar', pivot: [8, 7], at: [36.6, 121.4], z: 1.5, show: (p) => p.gun > 0 },
      thigh: { img: 'maraSideThigh', pivot: [27.7, 4], at: [-2, -183.8], z: 2,
        off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0, HUMAN_GAITS.reyes)[0] },
      shin: { img: 'maraSideShin', parent: 'thigh', pivot: [26, 7], at: [26, 88], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.reyes)[1] },
      foot: { img: 'maraSideFoot', parent: 'shin', pivot: [22, 7], at: [22, 76], z: 2,
        rot: (p) => runLeg(p, 0, HUMAN_GAITS.reyes)[2] },
      body: { img: 'maraSideBody', pivot: [38.3, 111.1], at: [0, -187.8], z: 3,
        rot: (p) => p.flow * 0.08 + sin(p.t * 1.8) * 0.01, off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob] },
      head: { img: 'maraSideHead', parent: 'body', pivot: [15.1, 44], at: [36, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.015 - p.flow * 0.05 - sin(p.cycle * 2) * 0.015 * p.flow + p.alert * Math.sin(p.t * 18) * 0.04 },
      armNear: { img: 'maraSideArmFront', parent: 'body', pivot: [18.8, 9.9], at: [30.9, 25.9], z: 5, rot: survivorNearArm },
      // The flashlight stays pointed ahead and a little down, whatever the arm is doing.
      torch: { img: 'maraTorchSide', parent: 'armNear', pivot: [9, 4], at: [36.6, 121.4], z: 5.5,
        rot: (p) => 0.22 - p.flow * 0.08 - survivorNearArm(p) },
    },
  },
  // Reyes from behind. The left hand (picture left) holds the weapon.
  reyesBack: {
    height: 338,
    parts: {
      legL: { img: 'maraBackLegL', pivot: [47.5, 0], at: [-24, -173.8], z: 1, rot: () => -STANCE,
        off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, 173.8, HUMAN_GAITS.reyes, -1) },
      legR: { img: 'maraBackLeg', pivot: [22, 0], at: [22.3, -173.8], z: 1, rot: () => STANCE,
        off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, 173.8, HUMAN_GAITS.reyes, -1) },
      armL: { img: 'maraBackArmL', parent: 'body', pivot: [33.3, 3.3], at: [27.9, 29.2], z: 1.5,
        rot: (p) => -0.14 + sin(p.t * 1.7) * 0.01 - p.stab * 0.15,
        stretch: (p) => armSwing(p, 0) * (1 - p.stab * 0.3 - p.gun * 0.35) },
      armR: { img: 'maraBackArm', parent: 'body', pivot: [9, 2.9], at: [115.9, 29.2], z: 1.5,
        rot: (p) => 0.14 - sin(p.t * 1.7) * 0.01, stretch: (p) => armSwing(p, Math.PI) },
      knife: { img: 'maraKnife', parent: 'armL', pivot: [6, 6], at: [5.2, 115.5], z: 4.5, show: (p) => !p.gun && p.blade < 3, rot: () => 0.3 },
      machete: { img: 'maraMachete', parent: 'armL', pivot: [6, 6], at: [5.2, 115.5], z: 4.5, show: (p) => !p.gun && p.blade >= 3, rot: () => 0.3 },
      pistol: { img: 'maraPistol', parent: 'armL', pivot: [8, 7], at: [5.2, 115.5], z: 4.5, show: (p) => p.gun > 0, rot: () => 0.14 },
      body: { img: 'maraBackBody', pivot: [71.9, 132.6], at: [0, -173.8], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.015, off: (p) => [0, HUMAN_GAITS.reyes.crouch * p.flow - p.bob] },
      head: { img: 'maraBackHead', parent: 'body', pivot: [17.1, 36.6], at: [72.1, 5], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 + sin(p.cycle) * 0.02 * p.flow },
    },
  },
  // ---- end survivor humans ----
  ...figureUndead('zombie', GAITS.zombie, {
    height: 374,
    front: { legL: { pivot: [43.5, 0], at: [-31.8, -191.5] }, legR: { pivot: [20.9, 0], at: [21.1, -191.5] }, body: { pivot: [73.7, 142.2], at: [0, -191.5] },
      armL: { pivot: [19.8, 5.8], at: [30.8, 33.8] }, armR: { pivot: [8.5, 5.6], at: [117.1, 33.2] }, head: { pivot: [21.7, 45.8], at: [74.6, 5.5] }, legLen: 191.5 },
    back: { legL: { pivot: [45, 0], at: [-32.1, -191.5] }, legR: { pivot: [19.8, 0], at: [20.2, -191.5] }, body: { pivot: [75, 142.2], at: [0, -191.5] },
      armL: { pivot: [19.2, 1.9], at: [25.1, 37] }, armR: { pivot: [6.8, 5.5], at: [118.5, 34.3] }, head: { pivot: [21.3, 45.8], at: [75, 5.5] }, legLen: 191.5 },
    side: { body: { pivot: [33.2, 132], at: [0, -191.9] }, head: { pivot: [17.7, 55.6], at: [25.2, 5.5] }, arm: { pivot: [-5.7, 17.7], at: [44.7, 30.7] },
      thigh: { pivot: [29.7, 4], at: [0, -187.9] }, shin: { pivot: [21, 7], at: [21, 90] }, foot: { pivot: [24, 7], at: [24, 78] } },
  }),
  ...figureUndead('zgirl', GAITS.zgirl, {
    height: 291,
    front: { legL: { pivot: [33.1, 0], at: [-25.8, -137.2] }, legR: { pivot: [25.6, 0], at: [25.9, -137.2] }, body: { pivot: [58.9, 107.6], at: [0, -137.2] },
      armL: { pivot: [8.4, 14.5], at: [30.2, 24.2] }, armR: { pivot: [4.5, 12.7], at: [93.1, 26] }, head: { pivot: [26.6, 50.5], at: [59.5, 4.2] }, legLen: 137.2 },
    back: { legL: { pivot: [34, 0], at: [-25.5, -130.1] }, legR: { pivot: [25.6, 0], at: [25.4, -130.1] }, body: { pivot: [60.2, 118.8], at: [0, -130.1] },
      armL: { pivot: [2.5, 2.6], at: [23.8, 27.6] }, armR: { pivot: [3.8, 11.1], at: [90.6, 26.6] }, head: { pivot: [23.5, 46.3], at: [59.4, 4.3] }, legLen: 130.1 },
    side: { body: { pivot: [29.7, 114.6], at: [0, -133.8] }, head: { pivot: [18.1, 46.8], at: [19.3, 4.3] }, arm: { pivot: [-1.8, 5.5], at: [50.5, 15.8] },
      thigh: { pivot: [30.9, 4], at: [0, -129.8] }, shin: { pivot: [27, 7], at: [27, 62] }, foot: { pivot: [28, 7], at: [28, 57] } },
  }),
  ...figureUndead('stalker', GAITS.stalker, {
    height: 441,
    front: { legL: { pivot: [53.2, 0], at: [-22.7, -228.8] }, legR: { pivot: [19.4, 0], at: [17.4, -228.8] }, body: { pivot: [46.6, 174.8], at: [0, -228.8] },
      armL: { pivot: [53.1, 6.9], at: [1.8, 40.7] }, armR: { pivot: [8.6, 6.8], at: [82, 41] }, head: { pivot: [23.9, 43.7], at: [41.9, 6.3] }, legLen: 228.8 },
    back: { legL: { pivot: [37.3, 0], at: [-16.5, -221.9] }, legR: { pivot: [24.7, 0], at: [24.9, -221.9] }, body: { pivot: [36.9, 181.6], at: [0, -221.9] },
      armL: { pivot: [50, 6.8], at: [4.7, 40.6] }, armR: { pivot: [6.9, 5.5], at: [86.5, 40.8] }, head: { pivot: [23.3, 43.9], at: [44.8, 6.4] }, legLen: 221.9 },
    side: { body: { pivot: [39.1, 173.9], at: [0, -225.7] }, head: { pivot: [19.8, 47.2], at: [24.8, 6.4] }, arm: { pivot: [-3.5, 10.2], at: [52.3, 38.8] },
      thigh: { pivot: [29.1, 4], at: [0, -221.7] }, shin: { pivot: [16, 7], at: [16, 106] }, foot: { pivot: [18, 7], at: [18, 90] } },
  }),
  ...figureUndead('screamer', GAITS.screamer, {
    height: 297,
    front: { legL: { pivot: [29, 0], at: [-19.8, -139.2] }, legR: { pivot: [67.9, 0], at: [19.2, -139.2] }, body: { pivot: [39.5, 132.7], at: [0, -139.2] },
      armL: { pivot: [33.6, 12.8], at: [8.5, 26.6] }, armR: { pivot: [0.6, 2.1], at: [64.3, 29.4] }, head: { pivot: [23.6, 29.4], at: [33.7, 4.3] }, legLen: 139.2 },
    back: { legL: { pivot: [26.1, 0], at: [-13, -137.3] }, legR: { pivot: [57.9, 0], at: [25.6, -137.3] }, body: { pivot: [26.2, 133.6], at: [0, -137.3] },
      armL: { pivot: [32, 4.8], at: [6.2, 26.3] }, armR: { pivot: [7.1, 9.9], at: [56.3, 26.2] }, head: { pivot: [21.2, 30.4], at: [31, 4.3] }, legLen: 137.3 },
    side: { body: { pivot: [39.3, 120.1], at: [0, -138.3] }, head: { pivot: [22.4, 42.9], at: [25.8, 4.3] }, arm: { pivot: [-2.2, 6.2], at: [51.2, 16.7] },
      thigh: { pivot: [26.1, 4], at: [0, -134.3] }, shin: { pivot: [18, 7], at: [18, 64] }, foot: { pivot: [21, 7], at: [21, 58] } },
  }),
  ...figureUndead('brute', GAITS.brute, {
    height: 352,
    front: { legL: { pivot: [60.6, 0], at: [-32.8, -178.3] }, legR: { pivot: [33.1, 0], at: [33.1, -178.3] }, body: { pivot: [97.9, 143.9], at: [0, -178.3] },
      armL: { pivot: [44.7, 15.5], at: [36.4, 26.7] }, armR: { pivot: [16.1, 14.9], at: [159.1, 26.6] }, head: { pivot: [58.9, 34.8], at: [97.4, 5] }, legLen: 178.3 },
    back: { legL: { pivot: [60.7, 0], at: [-32.3, -176.6] }, legR: { pivot: [32.6, 0], at: [32.7, -176.6] }, body: { pivot: [98, 145.5], at: [0, -176.6] },
      armL: { pivot: [44.7, 13.7], at: [36.4, 26.1] }, armR: { pivot: [16.5, 13.5], at: [159.5, 26] }, head: { pivot: [56.9, 34.9], at: [97.7, 5] }, legLen: 176.6 },
    side: { body: { pivot: [45.6, 147.6], at: [0, -177.9] }, head: { pivot: [26.1, 31.5], at: [41.5, 5] }, arm: { pivot: [-6.5, 22.2], at: [54.5, 34.2] },
      thigh: { pivot: [35.7, 4], at: [0, -173.9] }, shin: { pivot: [28, 7], at: [28, 83] }, foot: { pivot: [38, 7], at: [38, 73] } },
  }),
};

// Both zombies share one structure, with their own art, measurements and gait. Each has one
// arm raised and one dangling, and rocks and lolls with its limp. In the side view they reach ahead.
// Zombies and monsters, cut from one full figure per view so every part matches. `m` holds each
// part's joint as measured on the figure: `pivot` inside the part's image, `at` where it attaches.
// From the side they reach forward with both arms, drawn as one part.
function figureUndead(k, g, m) {
  const Cap = (s) => k + s;
  const tip = (p) => g.lean * p.flow + 0.03 + sin(p.t * 1.7) * 0.03 + (g.lurch + sin(p.cycle) * g.lurch) * p.flow;
  const loll = (p, phase) => sin(p.t * 2.3 + phase) * 0.08 + sin(p.cycle + phase) * 0.13 * p.flow - g.lurch * p.flow;
  const facing = (v, pre, dir) => ({
    height: m.height,
    parts: {
      legL: { img: Cap(pre + 'LegL'), ...v.legL, z: 1, rot: () => -STANCE,
        off: (p) => [0, g.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0, v.legLen, g, dir) },
      legR: { img: Cap(pre + 'Leg'), ...v.legR, z: 1, rot: () => STANCE,
        off: (p) => [0, g.crouch * p.flow - p.bob], stretch: (p) => stepToward(p, 0.5, v.legLen, g, dir) },
      body: { img: Cap(pre + 'Body'), ...v.body, z: 2,
        rot: (p) => sin(p.t * 1.7) * 0.03 + (g.lurch + sin(p.cycle) * g.lurch) * p.flow, off: (p) => [0, g.crouch * p.flow - p.bob] },
      armL: { img: Cap(pre + 'ArmL'), parent: 'body', ...v.armL, z: 1.5,
        rot: (p) => -0.1 + sin(p.t * 3 + 1) * 0.03, stretch: (p) => armSwing(p, -0.8) },
      armR: { img: Cap(pre + 'Arm'), parent: 'body', ...v.armR, z: 1.5,
        rot: (p) => 0.1 - sin(p.t * 3) * 0.03, stretch: (p) => armSwing(p, Math.PI) },
      head: { img: Cap(pre + 'Head'), parent: 'body', ...v.head, z: 6, rot: (p) => loll(p, 0.6) },
    },
  });
  const s = m.side;
  return {
    [k]: facing(m.front, '', 1),
    [k + 'Back']: facing(m.back, 'Back', -1),
    // Faces right; drawRig flips it to face left.
    [k + 'Side']: {
      height: m.height,
      parts: {
        farThigh: { img: Cap('SideThighFar'), pivot: s.thigh.pivot, at: [s.thigh.at[0] + 6, s.thigh.at[1]], z: 0,
          off: (p) => [0, g.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0.5, g)[0] },
        farShin: { img: Cap('SideShinFar'), parent: 'farThigh', ...s.shin, z: 0, rot: (p) => runLeg(p, 0.5, g)[1] },
        farFoot: { img: Cap('SideFootFar'), parent: 'farShin', ...s.foot, z: 0, rot: (p) => runLeg(p, 0.5, g)[2] },
        thigh: { img: Cap('SideThigh'), pivot: s.thigh.pivot, at: [s.thigh.at[0] - 2, s.thigh.at[1]], z: 2,
          off: (p) => [0, g.crouch * p.flow - p.bob], rot: (p) => runLeg(p, 0, g)[0] },
        shin: { img: Cap('SideShin'), parent: 'thigh', ...s.shin, z: 2, rot: (p) => runLeg(p, 0, g)[1] },
        foot: { img: Cap('SideFoot'), parent: 'shin', ...s.foot, z: 2, rot: (p) => runLeg(p, 0, g)[2] },
        body: { img: Cap('SideBody'), ...s.body, z: 3, rot: tip, off: (p) => [0, g.crouch * p.flow - p.bob] },
        head: { img: Cap('SideHead'), parent: 'body', ...s.head, z: 6, rot: (p) => loll(p, 0.6) - g.lean * p.flow },
        arms: { img: Cap('SideArm'), parent: 'body', ...s.arm, z: 5,
          rot: (p) => 0.12 - g.lean * p.flow * 0.5 + sin(p.t * 2.6) * 0.06 + sin(p.cycle) * 0.07 * p.flow },
      },
    },
  };
}


// Default pose; callers override what they animate.
export function pose(over = {}) {
  return { t: 0, walk: 0, bob: 0, swing: 0, slashLean: 0, hurt: 0, alert: 0, flow: 0, cycle: 0, drag: 0, lantern: 0, lunge: 0, sink: 0, stab: 0, gun: 0, blade: 1, ...over };
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
    if (!img || (part.show && !part.show(p))) continue;
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
  reaperBackHead: 'reaper-back-head', reaperBackBody: 'reaper-back-body', reaperBackArm: 'reaper-back-arm', reaperBackArmL: 'reaper-back-arm-l',
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
  maraKnife: 'mara-knife', maraMachete: 'mara-machete', maraPistol: 'mara-pistol',
  maraBackHead: 'mara-back-head', maraBackBody: 'mara-back-body', maraBackArm: 'mara-back-arm', maraBackLeg: 'mara-back-leg',
  maraLegL: 'mara-leg-l', maraBackLegL: 'mara-back-leg-l', maraBackArmL: 'mara-back-arm-l', maraTorch: 'mara-torch', maraTorchSide: 'mara-torch-side',
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
  zombieLegL: 'zombie-leg-l', zombieArmL: 'zombie-arm-l', zombieBackLegL: 'zombie-back-leg-l', zombieBackArmL: 'zombie-back-arm-l',
  zgirlLegL: 'zgirl-leg-l', zgirlArmL: 'zgirl-arm-l', zgirlBackLegL: 'zgirl-back-leg-l', zgirlBackArmL: 'zgirl-back-arm-l',
  stalkerLegL: 'stalker-leg-l', stalkerArmL: 'stalker-arm-l', stalkerBackLegL: 'stalker-back-leg-l', stalkerBackArmL: 'stalker-back-arm-l',
  screamerLegL: 'screamer-leg-l', screamerArmL: 'screamer-arm-l', screamerBackLegL: 'screamer-back-leg-l', screamerBackArmL: 'screamer-back-arm-l',
  bruteLegL: 'brute-leg-l', bruteArmL: 'brute-arm-l', bruteBackLegL: 'brute-back-leg-l', bruteBackArmL: 'brute-back-arm-l',
  crawlerFront: 'crawler-front',
  crawlerSide: 'crawler-side',
  crawlerBack: 'crawler-back',
  wraithFront: 'wraith-front',
  wraithSide: 'wraith-side',
  wraithBack: 'wraith-back',
};
