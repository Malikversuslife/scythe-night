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

const sin = Math.sin;

export const RIGS = {
  reaper: {
    height: 420,
    parts: {
      body: { img: 'reaperBody', pivot: [87, 266], at: [0, 0], z: 2,
        rot: (p) => p.walk * 0.05 + p.slashLean * 0.12,
        off: (p) => [0, -p.bob] },
      head: { img: 'reaperHead', parent: 'body', pivot: [104, 176], at: [87, 46], z: 6,
        rot: (p) => sin(p.t * 2.1) * 0.03 + p.walk * 0.04 - p.slashLean * 0.1 + p.hurt * 0.25 },
      armBack: { img: 'reaperArmBack', parent: 'body', pivot: [36, 14], at: [34, 70], z: 4,
        rot: (p) => 0.22 - p.walk * 0.3 + p.swing },
      scythe: { img: 'reaperScythe', parent: 'armBack', pivot: [44, 300], at: [34, 168], z: 3,
        rot: (p) => -0.35 + p.swing * 0.35 },
      armFront: { img: 'reaperArmFront', parent: 'body', pivot: [30, 14], at: [140, 70], z: 4,
        rot: (p) => -0.18 + p.walk * 0.3 },
      lantern: { img: 'reaperLantern', parent: 'armFront', pivot: [40, 10], at: [30, 150], z: 3,
        rot: (p) => -p.walk * 0.45 + sin(p.t * 2.6) * 0.06 + 0.18 },
    },
  },
  mara: {
    height: 380,
    parts: {
      legL: { img: 'maraLegL', pivot: [46, 12], at: [-20, -150], z: 1, rot: (p) => p.walk * 0.45 },
      legR: { img: 'maraLegR', pivot: [42, 12], at: [20, -150], z: 1, rot: (p) => -p.walk * 0.45 },
      body: { img: 'maraBody', pivot: [67, 118], at: [0, -134], z: 2,
        rot: (p) => p.walk * 0.05 + sin(p.t * 1.8) * 0.02, off: (p) => [0, -p.bob] },
      armBack: { img: 'maraArmBack', parent: 'body', pivot: [40, 10], at: [22, 22], z: 3,
        rot: (p) => 0.12 - p.walk * 0.45 },
      armFront: { img: 'maraArmFront', parent: 'body', pivot: [20, 10], at: [113, 22], z: 4,
        rot: (p) => -0.1 + p.walk * 0.35 - p.alert * 0.5 },
      head: { img: 'maraHead', parent: 'body', pivot: [79, 140], at: [67, 16], z: 6,
        rot: (p) => sin(p.t * 2) * 0.03 + p.walk * 0.04 + p.alert * Math.sin(p.t * 18) * 0.05 },
    },
  },
  zombie: {
    height: 400,
    parts: {
      legL: { img: 'zombieLegL', pivot: [48, 12], at: [-24, -134], z: 1, rot: (p) => p.walk * 0.4 },
      legR: { img: 'zombieLegR', pivot: [44, 12], at: [24, -134], z: 1, rot: (p) => -p.walk * 0.4 },
      body: { img: 'zombieBody', pivot: [68, 118], at: [0, -112], z: 2,
        rot: (p) => p.walk * 0.07 + sin(p.t * 1.7) * 0.03, off: (p) => [0, -p.bob] },
      armL: { img: 'zombieArmL', parent: 'body', pivot: [116, 30], at: [24, 30], z: 4,
        rot: (p) => sin(p.t * 3 + 1) * 0.1 + p.walk * 0.12 - 0.1 },
      armR: { img: 'zombieArmR', parent: 'body', pivot: [14, 30], at: [112, 30], z: 4,
        rot: (p) => -sin(p.t * 3) * 0.1 - p.walk * 0.12 + 0.1 },
      head: { img: 'zombieHead', parent: 'body', pivot: [93, 160], at: [68, 22], z: 6,
        rot: (p) => sin(p.t * 2.3) * 0.12 + p.walk * 0.05 },
    },
  },
  zgirl: {
    height: 420,
    parts: {
      legL: { img: 'zgirlLegL', pivot: [44, 10], at: [-20, -138], z: 1, rot: (p) => p.walk * 0.4 },
      legR: { img: 'zgirlLegR', pivot: [40, 10], at: [20, -138], z: 1, rot: (p) => -p.walk * 0.4 },
      body: { img: 'zgirlBody', pivot: [60, 150], at: [0, -112], z: 2,
        rot: (p) => p.walk * 0.07 + sin(p.t * 1.9) * 0.03, off: (p) => [0, -p.bob] },
      armL: { img: 'zgirlArmL', parent: 'body', pivot: [104, 22], at: [24, 34], z: 4,
        rot: (p) => sin(p.t * 3 + 2) * 0.1 + p.walk * 0.12 - 0.15 },
      armR: { img: 'zgirlArmR', parent: 'body', pivot: [8, 22], at: [96, 34], z: 4,
        rot: (p) => -sin(p.t * 3 + 0.5) * 0.1 - p.walk * 0.12 + 0.15 },
      head: { img: 'zgirlHead', parent: 'body', pivot: [103, 166], at: [60, 20], z: 6,
        rot: (p) => sin(p.t * 2.6 + 1) * 0.12 + p.walk * 0.05 },
    },
  },
};

// Default pose; callers override what they animate.
export function pose(over = {}) {
  return { t: 0, walk: 0, bob: 0, swing: 0, slashLean: 0, hurt: 0, alert: 0, ...over };
}

// Pre-sorted draw list per rig.
const order = {};
function drawOrder(rig) {
  const key = rig.height + Object.keys(rig.parts).join();
  return (order[key] ||= Object.entries(rig.parts).sort((a, b) => a[1].z - b[1].z));
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
    ctx.drawImage(img, -part.pivot[0], -part.pivot[1]);
    ctx.restore();
  }
  ctx.restore();
}

export const RIG_IMAGES = {
  reaperBody: 'reaper-body', reaperHead: 'reaper-head', reaperArmBack: 'reaper-arm-back',
  reaperArmFront: 'reaper-arm-front', reaperScythe: 'reaper-scythe', reaperLantern: 'reaper-lantern',
  zombieHead: 'zombie-head', zombieBody: 'zombie-body', zombieArmL: 'zombie-arm-l', zombieArmR: 'zombie-arm-r',
  zombieLegL: 'zombie-leg-l', zombieLegR: 'zombie-leg-r',
  zgirlHead: 'zgirl-head', zgirlBody: 'zgirl-body', zgirlArmL: 'zgirl-arm-l', zgirlArmR: 'zgirl-arm-r',
  zgirlLegL: 'zgirl-leg-l', zgirlLegR: 'zgirl-leg-r',
  maraHead: 'mara-head', maraBody: 'mara-body', maraArmBack: 'mara-arm-back', maraArmFront: 'mara-arm-front',
  maraLegL: 'mara-leg-l', maraLegR: 'mara-leg-r',
};
