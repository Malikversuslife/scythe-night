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
const MARA_GAIT = { thigh: 53, shin: 43, hip: 86, leg: 126, stride: 48, lift: 30, planted: 0.4, hitch: 0 };

// Zombies step by distance travelled, so their feet stay planted at patrol or chase speed.
// `dragged` is the leg that scuffs along the ground.
function undeadGait(g, unitsPerTile) {
  return { ...g, perTile: (Math.PI * 2) / (((2 * g.stride) / g.planted) / unitsPerTile) };
}
export const GAITS = {
  zombie: undeadGait({ thigh: 53, shin: 44, hip: 87, leg: 126, stride: 40, lift: 20, planted: 0.62, hitch: 0.06, dragged: 0.5, lean: 0.14, lurch: 0.07 }, 400 / 1.62),
  zgirl: undeadGait({ thigh: 61, shin: 49, hip: 99, leg: 142, stride: 44, lift: 26, planted: 0.6, hitch: 0.09, dragged: 0, lean: 0.05, lurch: -0.1 }, 420 / 1.62),
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
    height: 420,
    parts: {
      body: { img: 'reaperBody', pivot: [81, 236], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 + p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperHead', parent: 'body', pivot: [107, 212], at: [81, 34], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 - p.slashLean * 0.1 + p.hurt * 0.25 },
      armBack: { img: 'reaperArmBack', parent: 'body', pivot: [31, 10], at: [34, 64], z: 4,
        rot: (p) => 0.2 - p.walk * 0.2 + p.swing },
      scythe: { img: 'reaperScythe', parent: 'armBack', pivot: [160, 338], at: [29, 118], z: 3,
        rot: (p) => -0.2 + scytheTurn(p.swing) },
      armFront: { img: 'reaperArmFront', parent: 'body', pivot: [19, 10], at: [128, 64], z: 4,
        rot: (p) => -0.16 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armFront', pivot: [26, 6], at: [21, 118], z: 3,
        rot: (p) => 0.16 + p.lantern },
    },
  },
  // Faces right; drawRig flips it to face left. The scythe blade points the way Pip faces.
  reaperSide: {
    height: 420,
    parts: {
      armFar: { img: 'reaperSideArm', parent: 'body', pivot: [16, 10], at: [130, 62], z: 1,
        rot: (p) => -0.75 + p.walk * 0.15 },
      lantern: { img: 'reaperLantern', parent: 'armFar', pivot: [26, 6], at: [22, 118], z: 0,
        rot: (p) => 0.75 + p.lantern },
      body: { img: 'reaperSideBody', pivot: [107, 236], at: [0, 0], z: 2, flow: hemTrail,
        rot: (p) => p.flow * 0.06 + p.slashLean * 0.16,
        off: (p) => [p.lunge, -p.bob] },
      head: { img: 'reaperSideHead', parent: 'body', pivot: [116, 181], at: [121, 34], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.02 - p.flow * 0.05 - p.slashLean * 0.12 - p.hurt * 0.25 },
      armNear: { img: 'reaperSideArm', parent: 'body', pivot: [16, 10], at: [112, 62], z: 5,
        rot: (p) => -0.2 - p.walk * 0.25 + p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armNear', pivot: [160, 338], at: [22, 118], z: 4,
        rot: (p) => 0.2 + scytheTurn(p.swing) },
    },
  },
  // Seen from behind, so the scythe is in the hand on the right of the picture.
  reaperBack: {
    height: 420,
    parts: {
      body: { img: 'reaperBackBody', pivot: [99, 236], at: [0, 0], z: 2, flow: hemRipple,
        rot: (p) => p.walk * 0.03 - p.slashLean * 0.1,
        off: (p) => [0, p.sink - p.bob] },
      head: { img: 'reaperBackHead', parent: 'body', pivot: [102, 218], at: [99, 34], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.03 + p.slashLean * 0.1 + p.hurt * 0.25 },
      armL: { img: 'reaperBackArm', parent: 'body', pivot: [21, 10], at: [50, 64], z: 4,
        rot: (p) => 0.16 + p.walk * 0.2 },
      lantern: { img: 'reaperLantern', parent: 'armL', pivot: [26, 6], at: [24, 118], z: 3,
        rot: (p) => -0.16 + p.lantern },
      armR: { img: 'reaperBackArm', mirror: true, parent: 'body', pivot: [21, 10], at: [148, 64], z: 4,
        rot: (p) => -0.2 - p.walk * 0.2 - p.swing },
      scythe: { img: 'reaperScythe', mirror: true, parent: 'armR', pivot: [160, 338], at: [18, 118], z: 3,
        rot: (p) => 0.2 - scytheTurn(p.swing) },
    },
  },
  mara: {
    height: 380,
    parts: {
      legL: { img: 'maraLeg', mirror: true, pivot: [16, 8], at: [-18, -126], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, 0) },
      legR: { img: 'maraLeg', pivot: [16, 8], at: [18, -126], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, Math.PI) },
      body: { img: 'maraBody', pivot: [48, 122], at: [0, -112], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.02, off: (p) => [0, -p.bob] },
      armBack: { img: 'maraArmBack', parent: 'body', pivot: [13, 10], at: [8, 22], z: 4,
        rot: (p) => 0.12 - sin(p.cycle) * 0.15 * p.flow },
      armFront: { img: 'maraArmFront', parent: 'body', pivot: [14, 10], at: [88, 22], z: 4,
        rot: (p) => -0.1 + sin(p.cycle) * 0.15 * p.flow - p.alert * 0.5 },
      head: { img: 'maraHead', parent: 'body', pivot: [89, 159], at: [47, 16], z: 6,
        rot: (p) => sin(p.t * 2) * 0.03 + sin(p.cycle) * 0.03 * p.flow + p.alert * Math.sin(p.t * 18) * 0.05 },
    },
  },
  // Faces right; drawRig flips it to face left.
  maraSide: {
    height: 380,
    parts: {
      farThigh: { img: 'maraSideThighFar', pivot: [16, 8], at: [8, -116], z: 0,
        off: (p) => [0, -p.bob], rot: (p) => runLeg(p, 0.5, MARA_GAIT)[0] },
      farFoot: { img: 'maraSideFootFar', parent: 'farShin', pivot: [17, 6], at: [17, 49], z: 0,
        rot: (p) => runLeg(p, 0.5, MARA_GAIT)[2] },
      farShin: { img: 'maraSideShinFar', parent: 'farThigh', pivot: [15, 6], at: [15, 61], z: 0,
        rot: (p) => runLeg(p, 0.5, MARA_GAIT)[1] },
      armFar: { img: 'maraSideArm', parent: 'body', pivot: [15, 10], at: [62, 26], z: 1,
        rot: (p) => -0.12 + sin(p.cycle - 0.4) * 0.6 * p.flow },
      thigh: { img: 'maraSideThigh', pivot: [16, 8], at: [-2, -116], z: 2,
        off: (p) => [0, -p.bob], rot: (p) => runLeg(p, 0, MARA_GAIT)[0] },
      foot: { img: 'maraSideFoot', parent: 'shin', pivot: [17, 6], at: [17, 49], z: 2,
        rot: (p) => runLeg(p, 0, MARA_GAIT)[2] },
      shin: { img: 'maraSideShin', parent: 'thigh', pivot: [15, 6], at: [15, 61], z: 2,
        rot: (p) => runLeg(p, 0, MARA_GAIT)[1] },
      body: { img: 'maraSideBody', pivot: [59, 122], at: [0, -110], z: 3,
        rot: (p) => p.flow * 0.1 + sin(p.t * 1.8) * 0.015, off: (p) => [0, -p.bob] },
      head: { img: 'maraSideHead', parent: 'body', pivot: [96, 161], at: [52, 14], z: 6,
        rot: (p) => sin(p.t * 2) * 0.02 - p.flow * 0.06 - sin(p.cycle * 2) * 0.02 * p.flow + p.alert * Math.sin(p.t * 18) * 0.05 },
      armNear: { img: 'maraSideArmFront', parent: 'body', pivot: [16, 10], at: [54, 26], z: 5,
        rot: (p) => -0.12 - sin(p.cycle - 0.4) * 0.6 * p.flow - p.alert * 0.5 },
    },
  },
  // Seen from behind, with her backpack in the middle of her back.
  maraBack: {
    height: 380,
    parts: {
      legL: { img: 'maraBackLeg', mirror: true, pivot: [19, 8], at: [-18, -126], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, 0) },
      legR: { img: 'maraBackLeg', pivot: [19, 8], at: [18, -126], z: 1,
        off: (p) => [0, -p.bob], stretch: (p) => stepToward(p, Math.PI) },
      body: { img: 'maraBackBody', pivot: [49, 122], at: [0, -112], z: 2,
        rot: (p) => sin(p.cycle) * 0.03 * p.flow + sin(p.t * 1.8) * 0.02, off: (p) => [0, -p.bob] },
      armL: { img: 'maraBackArm', parent: 'body', pivot: [17, 10], at: [6, 22], z: 4,
        rot: (p) => 0.12 + sin(p.cycle) * 0.15 * p.flow },
      armR: { img: 'maraBackArm', mirror: true, parent: 'body', pivot: [17, 10], at: [94, 22], z: 4,
        rot: (p) => -0.12 - sin(p.cycle) * 0.15 * p.flow },
      head: { img: 'maraBackHead', parent: 'body', pivot: [89, 167], at: [49, 16], z: 6,
        rot: (p) => sin(p.t * 2) * 0.03 + sin(p.cycle) * 0.03 * p.flow },
    },
  },
  ...undeadViews('zombie', GAITS.zombie, {
    height: 400, armY: 24,
    front: { hipX: 20, hip: [48, 118], neck: [98, 188], neckAt: [47, 16], leg: [22, 8], arm: [16, 10], armX: [6, 90] },
    side: { hip: [49, 118], neck: [124, 198], neckAt: [33, 14], arm: [14, 10], armX: [36, 46],
      leg: [17, 8], kneeAt: [16, 61], knee: [16, 6], ankleAt: [17, 50], ankle: [17, 6], legX: [-6, 6], legY: -116 },
    back: { hipX: 20, hip: [48, 118], neck: [97, 196], neckAt: [48, 16], leg: [17, 8], arm: [15, 10], armX: [6, 90] },
    bodyY: -112, sideBodyY: -110, legY: -126,
  }),
  ...undeadViews('zgirl', GAITS.zgirl, {
    height: 420, armY: 28,
    front: { hipX: 16, hip: [51, 152], neck: [92, 184], neckAt: [54, 16], leg: [16, 8], arm: [14, 10], armX: [14, 98] },
    side: { hip: [61, 152], neck: [97, 207], neckAt: [50, 16], arm: [13, 10], armX: [48, 58],
      leg: [14, 8], kneeAt: [13, 69], knee: [13, 6], ankleAt: [16, 55], ankle: [16, 6], legX: [-6, 6], legY: -131 },
    back: { hipX: 16, hip: [65, 152], neck: [93, 193], neckAt: [63, 16], leg: [13, 8], arm: [10, 10], armX: [24, 104] },
    bodyY: -100, sideBodyY: -100, legY: -142,
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
          rot: (p) => 0.5 + sin(p.t * 3 + 1) * 0.08 + sin(p.cycle - 0.8) * 0.14 * p.flow },
        armR: { img: images.arm, mirror: true, parent: 'body', pivot: v.arm, at: [v.armX[1], m.armY], z: 4,
          rot: (p) => -0.95 - sin(p.t * 3) * 0.08 - sin(p.cycle) * 0.06 * p.flow },
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
};
