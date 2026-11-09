// Last Survivor renderer: a three-quarter view city, built from the map by city.js, with cutout rigs.
// Buildings, props and characters are drawn back to front by the row they stand on.
import { SURVIVOR, TASKS, taskIndex, distractionLanding } from './survivor.js';
import { RIGS, GAITS, HUMAN_GAITS, DRAW_SCALE, drawRig, facingView, pose, undeadPose, undeadRig, rigFiles } from './rig.js';
import {
  INK, clamp, hash, drawImg, shadow, pool, tilePattern, offscreen,
  blitVisible, followCamera, tileSize, createAnimator, drawFloatText, createLayerGuard,
} from './render-common.js';
import { findBuildings, buildCityGround, buildBuilding, buildingBox } from './city.js';

// The painted building on each lot, by the lot's top-left tile. Keys are `bld` + the file's name.
const LOT_ART = {
  '3,3': 'bldTenement', '16,3': 'bldChurch',
  '3,9': 'bldPharmacy', '9,9': 'bldTownhouse', '12,9': 'bldBar', '16,9': 'bldPolice',
  '3,15': 'bldDiner', '16,15': 'bldHotel',
  '9,20': 'bldWarehouse', '16,20': 'bldGarages', '16,22': 'bldRuin',
  '3,26': 'bldTower', '5,26': 'bldPawnshop', '9,26': 'bldCinema', '16,26': 'bldApartments',
  // The east district.
  '22,3': 'bldFirestation', '28,3': 'bldHospital', '35,3': 'bldSchool',
  '22,9': 'bldTenement', '35,9': 'bldSupermarket',
  '22,15': 'bldGasstation', '35,15': 'bldHotel',
  '22,20': 'bldPolice', '28,20': 'bldWarehouse', '35,20': 'bldApartments',
  '22,26': 'bldChurch', '28,26': 'bldPharmacy',
};
// Below the top row a building may only rise so far above its lot, or it hides the one behind.
const lotMaxTall = (b) => (b.r0 <= 3 ? Infinity : b.h + 2.6);

export const SURVIVOR_IMAGES = {
  ...rigFiles(['maraKnife', 'maraMachete', 'maraPistol', 'maraTorch', 'maraLegL', 'maraBackLegL', 'maraBackArmL']),
  ...rigFiles(['stalker', 'screamer', 'brute', 'crawler']),
  texAsphalt: 'assets/img/v2/tex-asphalt.jpg',
  texSidewalk: 'assets/img/v2/tex-sidewalk.jpg',
  texGrass: 'assets/img/v2/tex-grass.jpg',
  ...Object.fromEntries(['manhole', 'puddle', 'papers', 'blood', 'rubble', 'leaves', 'glass', 'oil']
    .map((n) => [`decal${n[0].toUpperCase()}${n.slice(1)}`, `assets/img/v2/decal-${n}.png`])),
  texRoofFlat: 'assets/img/v2/tex-roof-flat.jpg',
  texFacade: 'assets/img/v2/tex-facade.jpg',
  texFacadeStone: 'assets/img/v2/tex-facade-stone.jpg',
  texFacadeBrick: 'assets/img/v2/tex-facade-brick.jpg',
  townHall: 'assets/img/v2/town-hall.png',
  ...Object.fromEntries([...new Set(Object.values(LOT_ART))].map((k) => [k, `assets/img/v2/bld-${k.slice(3).toLowerCase()}.webp`])),
  roofWaterTower: 'assets/img/v2/roof-water-tower.png',
  roofAc: 'assets/img/v2/roof-ac.png',
  roofHut: 'assets/img/v2/roof-hut.png',
  roofSkylight: 'assets/img/v2/roof-skylight.png',
  roofChimney: 'assets/img/v2/roof-chimney.png',
  roofVents: 'assets/img/v2/roof-vents.png',
  roofDish: 'assets/img/v2/roof-dish.png',
  cityTree: 'assets/img/v2/city-tree.png',
  cityTreeSmall: 'assets/img/v2/city-tree-small.png',
  planter: 'assets/img/v2/planter.png',
  bench: 'assets/img/v2/bench.png',
  taxi: 'assets/img/v2/taxi.png',
  sedan: 'assets/img/v2/sedan.png',
  streetLamp: 'assets/img/v2/street-lamp.png',
  dumpster: 'assets/img/v2/dumpster.png',
  crates: 'assets/img/v2/crates.png',
  hydrant: 'assets/img/v2/hydrant.png',
  tramStop: 'assets/img/v2/tram-stop.png',
  trashBags: 'assets/img/v2/trash-bags.png',
  barricade: 'assets/img/v2/barricade.png',
  car: 'assets/img/v2/car.png',
  kiosk: 'assets/img/v2/kiosk.png',
  powerboxOff: 'assets/img/v2/powerbox-off.png',
  powerboxOn: 'assets/img/v2/powerbox-on.png',
  bellFrame: 'assets/img/v2/bell-frame.png',
  doorLocked: 'assets/img/v2/door-locked.png',
  doorOpen: 'assets/img/v2/door-open.png',
  fuse: 'assets/img/v2/fuse.png',
  chalkArrow: 'assets/img/v2/chalk-arrow.png',
  maraHead: 'assets/img/v2/mara-head.png',
  maraBody: 'assets/img/v2/mara-body.png',
  maraArmBack: 'assets/img/v2/mara-arm-back.png',
  maraArmFront: 'assets/img/v2/mara-arm-front.png',
  maraLeg: 'assets/img/v2/mara-leg.png',
  maraSideHead: 'assets/img/v2/mara-side-head.png',
  maraSideBody: 'assets/img/v2/mara-side-body.png',
  maraSideArm: 'assets/img/v2/mara-side-arm.png',
  maraSideArmFront: 'assets/img/v2/mara-side-arm-front.png',
  maraSideThigh: 'assets/img/v2/mara-side-thigh.png',
  maraSideShin: 'assets/img/v2/mara-side-shin.png',
  maraSideFoot: 'assets/img/v2/mara-side-foot.png',
  maraSideThighFar: 'assets/img/v2/mara-side-thigh-far.png',
  maraSideShinFar: 'assets/img/v2/mara-side-shin-far.png',
  maraSideFootFar: 'assets/img/v2/mara-side-foot-far.png',
  maraBackHead: 'assets/img/v2/mara-back-head.png',
  maraBackBody: 'assets/img/v2/mara-back-body.png',
  maraBackArm: 'assets/img/v2/mara-back-arm.png',
  maraBackLeg: 'assets/img/v2/mara-back-leg.png',
};

const AMBER = '#ffd789';

// Areas that aren't street: the park west of centre and the plaza around the bell.
// Open ground that isn't street: the parks (trees) and the plazas (planters), old town and east.
const ZONES = {
  parks: [{ c0: 3, r0: 20, c1: 6, r1: 23 }, { c0: 28, r0: 9, c1: 32, r1: 12 }],
  plazas: [{ c0: 9, r0: 15, c1: 13, r1: 17 }, { c0: 28, r0: 15, c1: 32, r1: 17 }],
};
const inZone = (z, c, r) => c >= z.c0 && c <= z.c1 && r >= z.r0 && r <= z.r1;
const CARS = ['taxi', 'sedan', 'car'];

// Real-life scale: a tile is about 2.5 m, so a person is 0.7 tiles tall. The rigs' gaits were
// measured for figures 1.75 tiles tall; smaller legs take more steps to cover a tile.
const PERSON = 0.7;
const SHRINK = PERSON / 1.75;

// What stands on a solid 'x' tile, by where it is.
function propFor(c, r) {
  if (ZONES.parks.some((z) => inZone(z, c, r))) return { img: hash(c, r, 3) < 0.6 ? 'cityTree' : 'cityTreeSmall', w: hash(c, r, 3) < 0.6 ? 1.35 : 0.8 };
  if (ZONES.plazas.some((z) => inZone(z, c, r))) return { img: 'planter', w: 0.95 };
  const n = hash(c, r, 3);
  if (n < 0.62) return { img: CARS[Math.floor(hash(c, r, 4) * CARS.length)], w: 1.8, flip: hash(c, r, 5) < 0.5 };
  return n < 0.82 ? { img: 'dumpster', w: 0.8 } : { img: 'trashBags', w: 0.55 };
}

export function createSurvivorRenderer(images) {
  let cache = null;
  const animator = createAnimator();
  const guard = createLayerGuard();
  let rigImages = images;
  let effects = [];
  let gunUntil = -1; // she keeps the pistol up a moment after each shot
  let lastTime = 0;
  let bellAt = -10;
  const cam = { x: null, y: null };

  const isBuilding = (map, c, r) => c >= 0 && r >= 0 && c < map.w && r < map.h && (map.rows[r][c] === '#' || map.rows[r][c] === 'R');

  // Street lamps and hydrants stand on the sidewalk right in front of a building.
  function streetFurniture(map) {
    const lamps = [], hydrants = [], benches = [];
    for (let r = 1; r < map.h; r++) {
      for (let c = 0; c < map.w; c++) {
        if (map.rows[r][c] !== '.' || !isBuilding(map, c, r - 1)) continue;
        const n = hash(c, r, 21);
        // Many lamps are dead; the rest stutter on failing power, each on its own rhythm.
        if (n < 0.2) lamps.push({ x: c + 0.5, y: r + 0.18, dead: hash(c, r, 23) < 0.45, phase: hash(c, r, 24) * 40 });
        else if (n < 0.26) hydrants.push({ x: c + 0.75, y: r + 0.24 });
      }
    }
    for (const [c, r] of [[10, 16], [12, 16], [5, 21], [29, 16], [31, 16], [30, 11]]) if (map.rows[r]?.[c] === '.') benches.push({ x: c + 0.5, y: r + 0.7 });
    return { lamps, hydrants, benches };
  }

  function buildGround(run, t, dpr) {
    // The whole city is one picture; on a big map at high resolution that can pass what a phone
    // allows for one canvas, so its sharpness is capped to stay under that.
    const area = run.map.w * t * run.map.h * t;
    const cv = buildCityGround(run.map, images, t, Math.min(dpr, Math.sqrt(14e6 / area)), ZONES);
    const g = cv.getContext('2d');
    // Warm pool at the start marks the safe spot.
    const s = run.map.marks.P[0];
    g.save();
    g.globalCompositeOperation = 'lighter';
    pool(g, t, s.c + 0.5, s.r + 0.5, 1.8, '255, 215, 137', 0.18);
    g.restore();
    return cv;
  }

  // Every lot becomes a building: the one with the refuge door is the town hall, the rest the
  // abandoned buildings painted for their lots.
  function buildCity(run, t, dpr) {
    const { map, door } = run;
    return findBuildings(map).map((b) => {
      const hall = door.c >= b.c0 && door.c <= b.c1 && door.r >= b.r0 && door.r <= b.r1;
      const art = hall ? 'townHall' : LOT_ART[`${b.c0},${b.r0}`];
      const bld = buildBuilding(b, images, t, dpr, art && images[art] ? art : null, hall ? Infinity : lotMaxTall(b));
        bld.glows = [];
      if (!hall && b.r1 + 1 < map.h - 1) {
        // Hardly anyone is left: only the odd window still throws light on the street.
        for (let c = b.c0; c <= b.c1; c++) if (hash(c, b.r1, 31) < 0.14) bld.glows.push({ x: c + 0.5, y: b.r1 + 1.15 });
      }
      bld.alpha = 1;
      return bld;
    });
  }

  // ---------------- Effects ----------------

  const TASK_TEXT = { fuse: 'Fuse!', power: 'Power on!', bell: 'DING!' };

  function event(ev, run) {
    if (ev.type === 'shot') { effects.push({ kind: 'shot', ...ev, t: 0, life: 0.18 }); gunUntil = lastTime + 0.7; }
    if (ev.type === 'zombieDown') effects.push({ kind: 'text', x: ev.x, y: ev.y - 0.9, t: 0, life: 1, text: 'Down!', color: '#ff8a7a', size: 0.42 });
    if (ev.type === 'stunned') effects.push({ kind: 'text', x: ev.x, y: ev.y - 1, t: 0, life: 0.9, text: 'Stunned', color: AMBER, size: 0.34 });
    if (ev.type === 'task' && run) {
      const o = run.objects[ev.id];
      effects.push({ kind: 'text', x: o.c + 0.5, y: o.r - 0.6, t: 0, life: 1.1, text: TASK_TEXT[ev.id], color: AMBER, size: 0.45 });
      if (ev.id === 'bell') bellAt = lastTime;
    }
  }

  function drawEffects(g, t, dt, reduced) {
    effects = effects.filter((f) => (f.t += dt) < f.life);
    for (const f of effects) {
      if (f.kind === 'shot') { drawShot(g, t, f); continue; }
      drawFloatText(g, t, f, f.t / f.life, reduced);
    }
  }

  // A tracer from her hand to the target, with a flash at the muzzle.
  function drawShot(g, t, f) {
    const k = 1 - f.t / f.life;
    const x0 = f.x0 * t, y0 = (f.y0 - 0.42) * t, x1 = f.x1 * t, y1 = (f.y1 - 0.9) * t;
    g.save();
    g.globalAlpha = k;
    g.strokeStyle = 'rgba(255, 230, 160, .9)';
    g.lineWidth = Math.max(1.5, t * 0.04);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.fillStyle = 'rgba(255, 210, 120, .9)';
    g.beginPath(); g.arc(x0, y0, t * 0.16 * k, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // The knife's arc in front of her for a moment after each stab.
  function drawSwing(g, run, t) {
    const sw = run.weapon?.swing;
    if (!sw) return;
    const p = run.player, k = sw.t / 0.25;
    g.save();
    g.translate(p.x * t, (p.y - 0.15) * t);
    g.rotate(sw.angle);
    g.globalAlpha = (1 - k) * 0.85;
    g.strokeStyle = sw.hit ? 'rgba(255, 140, 120, .95)' : 'rgba(235, 235, 225, .85)';
    g.lineWidth = Math.max(2, t * 0.07);
    g.lineCap = 'round';
    g.beginPath(); g.arc(0, 0, t * (0.6 + k * 0.35), -0.9 + k * 0.6, 0.9 - k * 0.6); g.stroke();
    g.restore();
  }

  // Flashlight cone pointing along +x, rendered once.
  let coneSprite = null;
  function cone() {
    if (coneSprite) return coneSprite;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 160;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(0, 80, 4, 0, 80, 256);
    grd.addColorStop(0, 'rgba(255, 236, 170, .9)');
    grd.addColorStop(1, 'rgba(255, 236, 170, 0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 80);
    g.lineTo(256, 0);
    g.quadraticCurveTo(290, 80, 256, 160);
    g.closePath();
    g.fill();
    return (coneSprite = cv);
  }

  function drawLights(g, run, t, time, reduced, furniture, cx, cy, cssW, cssH) {
    // Night: darken the street, then add light back.
    g.fillStyle = 'rgba(6, 2, 18, .26)';
    g.fillRect(cx, cy, cssW, cssH);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of furniture.lamps) {
      if (l.dead) continue;
      const k = time * 7 + l.phase;
      const cut = !reduced && Math.sin(k * 0.37) > 0.93 && Math.sin(k * 5.3) > 0;   // brief drop-outs
      pool(g, t, l.x, l.y - 0.2, 1.9, '255, 196, 120', cut ? 0.04 : 0.19 + (reduced ? 0 : Math.sin(k) * 0.02));
    }
    for (const b of cache.buildings) for (const w of b.glows) pool(g, t, w.x, w.y, 0.9, '255, 190, 110', 0.13);
    if (run.done.power) pool(g, t, run.objects.power.c + 0.5, run.objects.power.r + 0.3, 1.4, '150, 240, 90', 0.3);
    if (run.doorOpen) pool(g, t, run.door.c + 0.5, run.door.r + 1.1, 2.4, '255, 215, 137', 0.45);
    // Flashlight.
    const p = run.player;
    const len = 3.2, spread = 1.9;
    g.globalAlpha = 0.32;
    g.save();
    // The beam leaves the flashlight in her hand, at hip height and a little ahead of her. Lights are
    // added on top of the scene, so when she faces away it starts above her head instead.
    const away = Math.max(0, -p.fy), toward = Math.max(0, p.fy);
    g.translate((p.x + p.fx * 0.1 - toward * 0.05) * t, (p.y - 0.15 - away * 0.4) * t); // her right hand: picture left, facing us
    g.rotate(Math.atan2(p.fy, p.fx));
    g.drawImage(cone(), 0, (-spread / 2) * t, len * t, spread * t);
    g.restore();
    pool(g, t, p.x, p.y - 0.1, 0.9, '255, 236, 170', 0.12);
    g.restore();
  }

  function layers() {
    if (!cache) return [];
    const first = cache.buildings[0];
    return [{ canvas: cache.ground, x: 1, y: 1 }, { canvas: first.canvas, x: Math.floor(first.canvas.width / 2), y: first.canvas.height - 2 }];
  }

  // ---------------- Frame ----------------

  function draw(ctx, run, view) {
    const { cssW, cssH, time, reducedMotion: reduced } = view;
    const dpr = Math.min(view.dpr, 2);
    const { map } = run;
    const dt = clamp(time - lastTime, 0, 0.1);
    lastTime = time;

    const t = tileSize(cssW, cssH, 7); // close enough that people, drawn to real scale, stay easy to see
    if (cache && guard.isLost(layers())) cache = null;
    if (!cache || cache.t !== t || cache.dpr !== dpr || cache.run !== run) {
      cache = { ground: buildGround(run, t, dpr), buildings: buildCity(run, t, dpr), furniture: streetFurniture(map), t, dpr, run };
      cam.x = cam.y = null;
      bellAt = -10;
    }
    const { cx, cy, worldW, worldH } = followCamera(cam, run, t, view, dt, reduced);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#140c22';
    ctx.fillRect(0, 0, cssW, cssH);
    const bg = view.backdrop;
    if (bg && cy < t) {
      const bw = cssW * 1.3, bh = bw * (bg.height / bg.width);
      ctx.drawImage(bg, (cssW - bw) / 2 - cx * 0.1, -cy - t * 0.5 - bh * 0.55, bw, bh);
    }

    ctx.save();
    ctx.translate(-cx, -cy);
    blitVisible(ctx, cache.ground, worldW, worldH, cx, cy, cssW, cssH);

    // Ground markings: the objective ring and the chalk arrow.
    const ti = taskIndex(run);
    const target = ti >= 0 ? run.objects[TASKS[ti].id] : run.door;
    const pulse = reduced ? 0 : Math.sin(time * 4) * 0.06;
    ctx.save();
    ctx.translate((target.c + 0.5) * t, (target.r + (ti >= 0 ? 0.85 : 1.15)) * t);
    ctx.scale(1, 0.55);
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(0, 0, (0.8 + pulse) * t, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    if (run.doorOpen) drawImg(ctx, images.chalkArrow, (run.door.c + 1.4) * t, (run.door.r + 1.7) * t, 0.55 * t);

    // Standing things, back to front by the row they stand on. Buildings are just very tall items.
    const items = [];
    const chasing = run.zombies.some((z) => z.state === 'chase');
    for (const z of run.zombies) items.push({ y: z.y, box: [z.x - 0.9, z.y - 1.2, z.x + 0.9, z.y + 0.5], draw: () => drawZombie(ctx, z, t, time, dt, reduced) });
    const p = run.player;
    items.push({ y: p.y, box: [p.x - 0.9, p.y - 1, p.x + 0.9, p.y + 0.5], draw: () => drawMara(ctx, run, t, time, dt, reduced, chasing) });
    const { kiosk, power, bell } = { kiosk: run.objects.fuse, power: run.objects.power, bell: run.objects.bell };
    items.push({ y: kiosk.r + 0.9, box: [kiosk.c - 0.1, kiosk.r - 0.6, kiosk.c + 1.1, kiosk.r + 1], draw: () => drawImg(ctx, images.kiosk, (kiosk.c + 0.5) * t, (kiosk.r + 0.98) * t, 0.7 * t, { alpha: run.done.fuse ? 0.85 : 1 }) });
    items.push({ y: power.r + 0.9, box: [power.c - 0.2, power.r - 0.6, power.c + 1.2, power.r + 1], draw: () => drawImg(ctx, run.done.power ? images.powerboxOn : images.powerboxOff, (power.c + 0.5) * t, (power.r + 0.98) * t, (run.done.power ? 0.7 : 0.55) * t) });
    items.push({ y: bell.r + 0.9, box: [bell.c - 0.2, bell.r - 0.6, bell.c + 1.2, bell.r + 1], draw: () => drawBell(ctx, bell, t, time, reduced) });
    const d = run.door;
    items.push({ y: d.r + 1.05, box: [d.c - 0.2, d.r - 0.2, d.c + 1.2, d.r + 1.05], draw: () => drawImg(ctx, run.doorOpen ? images.doorOpen : images.doorLocked, (d.c + 0.5) * t, (d.r + 1.04) * t, 1.2 * t) });
    for (const l of cache.furniture.lamps) items.push({ y: l.y, box: [l.x - 0.3, l.y - 2, l.x + 0.3, l.y + 0.1], draw: () => drawImg(ctx, images.streetLamp, l.x * t, l.y * t, 0.42 * t) });
    for (const h of cache.furniture.hydrants) items.push({ y: h.y, box: [h.x - 0.3, h.y - 0.6, h.x + 0.3, h.y + 0.1], draw: () => drawImg(ctx, images.hydrant, h.x * t, h.y * t, 0.32 * t) });
    for (const b of cache.furniture.benches) items.push({ y: b.y, box: [b.x - 0.5, b.y - 0.7, b.x + 0.5, b.y + 0.1], draw: () => drawImg(ctx, images.bench, b.x * t, b.y * t, 0.75 * t) });
    for (let r = 0; r < map.h; r++) {
      for (let c = 0; c < map.w; c++) {
        if (map.rows[r][c] !== 'x' || !map.solid[r * map.w + c]) continue; // a brute flattened it
        const pr = propFor(c, r), img = images[pr.img], h = pr.w * (img.height / img.width);
        items.push({ y: r + 0.95, box: [c + 0.5 - pr.w / 2, r + 0.95 - h, c + 0.5 + pr.w / 2, r + 0.95], draw: () => drawImg(ctx, img, (c + 0.5) * t, (r + 0.95) * t, pr.w * t, { flip: pr.flip }) });
      }
    }
    // A building in front of Mara fades, so she is never lost behind it.
    const fade = Math.min(1, dt * 8);
    for (const bld of cache.buildings) {
      const { b } = bld;
      const box = buildingBox(bld, t);
      const behind = p.y < b.r1 + 1 && p.y > b.r0 - bld.tall - 0.4 && p.x > b.c0 - 0.4 && p.x < b.c1 + 1.4;
      bld.alpha += ((behind ? 0.32 : 1) - bld.alpha) * (reduced ? 1 : fade);
      items.push({ y: b.r1 + 1, box: [b.c0, box.y / t, b.c1 + 1, b.r1 + 1], building: bld, draw: () => {
        ctx.globalAlpha = bld.alpha;
        ctx.drawImage(bld.canvas, box.x, box.y, box.w, box.h);
        ctx.globalAlpha = 1;
      } });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const x0 = it.box[0] * t, y0 = it.box[1] * t, x1 = it.box[2] * t, y1 = it.box[3] * t;
      if (x1 < cx || x0 > cx + cssW || y1 < cy || y0 > cy + cssH) continue;
      it.draw();
    }
    // Zombies hidden behind a solid building show as faint outlines, so nothing is unfair.
    for (const z of run.zombies) {
      const hidden = cache.buildings.some((bld) => bld.alpha > 0.9 && z.y < bld.b.r1 + 1 && z.y > bld.b.r0 - bld.tall - 0.3
        && z.x > bld.b.c0 - 0.2 && z.x < bld.b.c1 + 1.2);
      if (hidden) drawZombieBody(ctx, z, t, time, reduced, 0.4);
    }

    // Objective beacon floating above the target, drawn over everything.
    const by = (target.r - (ti >= 0 ? 0.55 : 0.2) + (reduced ? 0 : Math.sin(time * 3) * 0.1)) * t;
    const bx = (target.c + 0.5) * t;
    ctx.beginPath();
    ctx.moveTo(bx, by + t * 0.22); ctx.lineTo(bx - t * 0.18, by); ctx.lineTo(bx + t * 0.18, by); ctx.closePath();
    ctx.fillStyle = AMBER; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.fill(); ctx.stroke();

    drawLights(ctx, run, t, time, reduced, cache.furniture, cx, cy, cssW, cssH);
    // Sight circles sit above the night overlay: they are gameplay information.
    for (const z of run.zombies) {
      // Only things that hunt by sight get a circle; the stalker hunts by sound and a crawler hides.
      if (z.kind === 'stalker' || z.kind === 'crawler' || z.stun > 0) continue;
      const alert = z.state === 'chase';
      ctx.fillStyle = alert ? 'rgba(255, 90, 90, .12)' : 'rgba(255, 120, 120, .05)';
      ctx.strokeStyle = alert ? 'rgba(255, 138, 138, .75)' : 'rgba(255, 138, 138, .4)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash(alert ? [] : [7, 6]);
      ctx.beginPath();
      ctx.arc(z.x * t, z.y * t, SURVIVOR.detectRange * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Where the noise-maker would land, and where it did.
    if (run.skillCooldown === 0 && !run.outcome) {
      const land = distractionLanding(run);
      if (land) {
        ctx.save();
        ctx.translate(land.x * t, land.y * t);
        ctx.strokeStyle = AMBER;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(0, 0, t * 0.2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    if (run.noise) {
      const k = (run.noise.t * 2) % 1;
      ctx.save();
      ctx.translate(run.noise.x * t, run.noise.y * t);
      ctx.fillStyle = AMBER;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, t * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = AMBER;
      ctx.globalAlpha = reduced ? 0.7 : 1 - k;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, t * (reduced ? 0.45 : 0.2 + k * 0.7), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    drawSwing(ctx, run, t);
    drawEffects(ctx, t, dt, reduced);
    ctx.restore();
    return { tile: t, cx, cy };
  }

  function drawBell(g, b, t, time, reduced) {
    const since = time - bellAt;
    const swing = !reduced && since < 2.5 ? Math.sin(since * 14) * 0.22 * (1 - since / 2.5) : 0;
    const img = images.bellFrame, w = 0.95 * t, h = w * (img.height / img.width);
    g.save();
    g.translate((b.c + 0.5) * t, (b.r + 0.98) * t - h * 0.85);
    g.rotate(swing);
    g.drawImage(img, -w / 2, -h * 0.15, w, h);
    g.restore();
  }

  // The zombie's figure alone, from its current animation state. Used again faintly when hidden.
  function drawZombieBody(g, z, t, time, reduced, alpha) {
    const s = animator.get(z);
    if (!s || z.state === 'dormant') return;
    const kind = figureOf(z);
    if (kind === 'crawler') { drawCrawler(g, z, s, t, time, reduced, alpha); return; }
    const h = PERSON * (DRAW_SCALE[kind] || 1) * t;
    drawRig(g, images, undeadRig(kind, s.view), undeadPose(time, z.id, s, reduced), z.x * t, (z.y + 0.18) * t, h, { flip: s.view === 'side' && s.flip, alpha });
  }

  // Ordinary walkers alternate between the two zombie looks; the monsters have their own.
  function figureOf(z) {
    return z.kind && z.kind !== 'walker' ? z.kind : z.id % 2 === 0 ? 'zgirl' : 'zombie';
  }

  // The crawler is one low drawing per view. Lurking, it's only a pair of eyes under the car.
  function drawCrawler(g, z, s, t, time, reduced, alpha) {
    const x = z.x * t, foot = (z.y + 0.15) * t;
    if (z.state === 'lurk') {
      const glow = reduced ? 0.8 : 0.55 + Math.sin(time * 2.3 + z.id) * 0.25;
      g.save();
      g.globalAlpha = alpha * glow;
      g.fillStyle = '#e8f2c8';
      g.shadowColor = 'rgba(220, 255, 170, .9)';
      g.shadowBlur = t * 0.15;
      for (const dx of [-0.04, 0.04]) { g.beginPath(); g.ellipse(x + dx * t, foot - t * 0.08, t * 0.016, t * 0.01, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
      return;
    }
    const img = images[s.view === 'side' ? 'crawlerSide' : s.view === 'back' ? 'crawlerBack' : 'crawlerFront'];
    const w = (s.view === 'side' ? 1.25 : 0.62) * SHRINK * 1.1 * t;
    const shake = z.state === 'rattle' && !reduced ? Math.sin(time * 70) * t * 0.03 : 0;
    const scuttle = reduced ? 0 : Math.abs(Math.sin(s.phase * 2)) * s.walk * t * 0.02;
    drawImg(g, img, x + shake, foot - scuttle, w, { flip: s.view === 'side' && s.flip, alpha });
  }

  function drawMara(g, run, t, time, dt, reduced, chasing) {
    const p = run.player;
    // This pace suits her run speed: her planted foot moves back about as fast as the ground passes.
    const base = rigImages.__rig || 'mara';
    const s = animator.step(p, dt, 0, HUMAN_GAITS[base].perTile / SHRINK);
    s.view = facingView(p.fx, p.fy, s.view);
    if (p.fx < -0.2) s.flip = true;
    else if (p.fx > 0.2) s.flip = false;
    shadow(g, p.x * t, (p.y + 0.17) * t, t * 0.18);
    const pz = pose({
      t: reduced ? 0 : time,
      flow: reduced ? 0 : s.walk,
      cycle: reduced ? 0 : s.phase,
      bob: reduced ? 0 : Math.abs(Math.sin(s.phase)) * 5 * s.walk + Math.sin(time * 2) * 1.5 * (1 - s.walk),
      alert: chasing ? 1 : 0,
      // A stab thrusts the blade out and back; after a shot the pistol stays raised briefly.
      stab: run.weapon?.swing ? Math.sin(Math.PI * Math.min(1, run.weapon.swing.t / 0.25)) : 0,
      gun: time < gunUntil ? Math.min(1, (gunUntil - time) / 0.2) : 0,
      blade: run.weapon?.blade ?? 1,
    });
    const rig = RIGS[s.view === 'side' ? `${base}Side` : s.view === 'back' ? `${base}Back` : base];
    // A faint warm rim keeps her readable against the dark street.
    g.save();
    g.shadowColor = 'rgba(255, 220, 160, .5)';
    g.shadowBlur = t * 0.07;
    drawRig(g, rigImages, rig, pz, p.x * t, (p.y + 0.18) * t, PERSON * t, { flip: s.view === 'side' && s.flip });
    g.restore();
  }

  function drawZombie(g, z, t, time, dt, reduced) {
    const kind = figureOf(z);
    const s = animator.step(z, dt, 0, (GAITS[kind] || GAITS.zombie).perTile / SHRINK);
    s.view = facingView(z.fx, z.fy, s.view);
    if (z.fx < -0.2) s.flip = true;
    else if (z.fx > 0.2) s.flip = false;
    if (z.state === 'dormant') return;
    const x = z.x * t, foot = (z.y + 0.18) * t, h = PERSON * (DRAW_SCALE[kind] || 1) * t;
    if (z.state !== 'lurk') shadow(g, x, foot - t * 0.02, t * 0.18 * (DRAW_SCALE[kind] || 1));
    drawZombieBody(g, z, t, time, reduced, 1);
    // Stunned: little stars circle its head until it recovers.
    if (z.stun > 0) {
      g.save();
      g.fillStyle = AMBER;
      for (let i = 0; i < 3; i++) {
        const a = (reduced ? 0 : time * 5) + (i * Math.PI * 2) / 3;
        g.beginPath();
        g.arc(x + Math.cos(a) * t * 0.16, foot - h - t * 0.04 + Math.sin(a) * t * 0.05, t * 0.035, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    } else if (z.state === 'chase' || z.state === 'search' || z.state === 'investigate') {
      const mark = z.state === 'chase' ? '!' : '?';
      g.font = `900 ${Math.round(t * 0.38)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.lineWidth = 5;
      g.strokeStyle = INK;
      g.strokeText(mark, x, foot - h - t * 0.05);
      g.fillStyle = z.state === 'chase' ? '#ff8a8a' : AMBER;
      g.fillText(mark, x, foot - h - t * 0.05);
      g.textBaseline = 'alphabetic';
    }
  }

  return {
    draw, event,
    reset() { effects = []; cache = null; },
    recheck() { guard.soon(); },
    layers,
    setSkin(overrides) { rigImages = { ...images, ...overrides }; },
  };
}
