// Last Survivor v2 renderer: three-quarter view city blocks, generated art, cutout rigs.
// Buildings rise BLD_H tiles above their footprint; rows are drawn back to front.
import { SURVIVOR, TASKS, taskIndex } from './survivor.js';
import { RIGS, drawRig, pose } from './rig.js';
import {
  INK, clamp, hash, drawImg, shadow, pool, tilePattern, offscreen,
  occlude, blitVisible, followCamera, createAnimator, drawFloatText,
} from './render-common.js';

export const SURVIVOR_IMAGES = {
  texStreet: 'assets/img/v2/tex-street.jpg',
  texRoof: 'assets/img/v2/tex-roof.jpg',
  texFacade: 'assets/img/v2/tex-facade.jpg',
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
  clockTower: 'assets/img/v2/clock-tower.png',
  signGrocery: 'assets/img/v2/sign-grocery.png',
  signPharmacy: 'assets/img/v2/sign-pharmacy.png',
  awning: 'assets/img/v2/awning.png',
  maraHead: 'assets/img/v2/mara-head.png',
  maraBody: 'assets/img/v2/mara-body.png',
  maraArmBack: 'assets/img/v2/mara-arm-back.png',
  maraArmFront: 'assets/img/v2/mara-arm-front.png',
  maraLegL: 'assets/img/v2/mara-leg-l.png',
  maraLegR: 'assets/img/v2/mara-leg-r.png',
};

const BLD_H = 0.95;
const AMBER = '#ffd789';

// Solid street clutter on 'x' tiles, by tile.
const CLUTTER = {
  '2,2': { img: 'crates', w: 0.95 }, '10,2': { img: 'barricade', w: 1.0 },
  '2,12': { img: 'car', w: 1.25 }, '10,12': { img: 'dumpster', w: 1.0 },
  '2,22': { img: 'trashBags', w: 0.9 }, '10,22': { img: 'dumpster', w: 1.0 },
};

// Set dressing in tiles: landmarks on rooftops and signs hung on facades.
const SCENERY = [
  { img: 'clockTower', x: 3.4, y: 1.9, w: 0.95, row: 1 },
  { img: 'signGrocery', x: 3.05, y: 9.0, w: 0.62, row: 8 },
  { img: 'signPharmacy', x: 9.05, y: 9.0, w: 0.62, row: 8 },
  { img: 'awning', x: 2.5, y: 21.05, w: 1.05, row: 20 },
  { img: 'awning', x: 10.5, y: 21.05, w: 1.05, row: 20, flip: true },
  { img: 'tramStop', x: 7.75, y: 22.55, w: 0.95, row: 22 },
];

export function createSurvivorRenderer(images) {
  let cache = null;
  const animator = createAnimator();
  let effects = [];
  let lastTime = 0;
  let bellAt = -10;
  const cam = { x: null, y: null };

  const isBuilding = (map, c, r) => c >= 0 && r >= 0 && c < map.w && r < map.h && (map.rows[r][c] === '#' || map.rows[r][c] === 'R');

  // Street lamps and hydrants stand on open street right in front of a facade.
  function streetFurniture(map) {
    const lamps = [], hydrants = [];
    for (let r = 1; r < map.h; r++) {
      for (let c = 0; c < map.w; c++) {
        if (map.rows[r][c] !== '.' || map.rows[r - 1][c] !== '#') continue;
        const n = hash(c, r, 21);
        if (n < 0.11) lamps.push({ x: c + 0.2, y: r + 0.2 });
        else if (n < 0.17) hydrants.push({ x: c + 0.75, y: r + 0.3 });
      }
    }
    return { lamps, hydrants };
  }

  function buildGround(run, t, dpr) {
    const { map } = run;
    const { cv, g } = offscreen(map.w * t, map.h * t, dpr);
    g.fillStyle = tilePattern(g, images.texStreet, t, 2.6);
    g.fillRect(0, 0, map.w * t, map.h * t);
    // Warm pool at the tram stop marks the safe start.
    const s = map.marks.P[0];
    g.save();
    g.globalCompositeOperation = 'lighter';
    pool(g, t, s.c + 0.5, s.r + 0.5, 1.8, '255, 215, 137', 0.18);
    g.restore();
    return cv;
  }

  function drawBuildingTile(g, run, c, r, t, pats) {
    const { map } = run;
    const x = c * t, top = (r - BLD_H) * t;
    const below = isBuilding(map, c, r + 1);
    const isDoor = map.rows[r][c] === 'R';
    if (!below && !isDoor) {
      // Ground-floor facade: the bottom window row of the strip, aligned to this face.
      const img = images.texFacade;
      const s = (BLD_H * t) / (img.height / 3);
      pats.facade.setTransform(new DOMMatrix().translate(0, (r + 1) * t - img.height * s).scale(s, s));
      g.fillStyle = pats.facade;
      g.fillRect(x, (r + 1 - BLD_H) * t, t + 0.5, BLD_H * t);
      g.fillStyle = 'rgba(10, 4, 22, .22)';
      g.fillRect(x, (r + 1 - BLD_H) * t, t + 0.5, BLD_H * t);
    }
    g.fillStyle = pats.roof;
    g.fillRect(x, top, t + 0.5, t + (below ? 0.5 : 0));
    g.fillStyle = 'rgba(12, 5, 28, .42)';
    g.fillRect(x, top, t + 0.5, t + (below ? 0.5 : 0));
    g.strokeStyle = INK;
    g.lineWidth = Math.max(2, t * 0.06);
    g.lineCap = 'round';
    g.beginPath();
    const bottom = (r + 1) * t;
    if (!isBuilding(map, c, r - 1)) { g.moveTo(x, top); g.lineTo(x + t, top); }
    if (!below) {
      g.moveTo(x, bottom); g.lineTo(x + t, bottom);
      g.moveTo(x, (r + 1 - BLD_H) * t); g.lineTo(x + t, (r + 1 - BLD_H) * t);
    }
    const sideEnd = below ? (r + 1 - BLD_H) * t : bottom;
    if (!isBuilding(map, c - 1, r)) { g.moveTo(x, top); g.lineTo(x, sideEnd); }
    if (!isBuilding(map, c + 1, r)) { g.moveTo(x + t, top); g.lineTo(x + t, sideEnd); }
    g.stroke();
  }

  function clutterFor(c, r) {
    return CLUTTER[`${c},${r}`] || { img: hash(c, r, 3) < 0.5 ? 'crates' : 'trashBags', w: 0.9 };
  }

  function buildBlocks(run, t, dpr) {
    const { map } = run;
    const { cv, g } = offscreen(map.w * t, map.h * t, dpr);
    const pats = {
      roof: tilePattern(g, images.texRoof, t, 2.4),
      facade: g.createPattern(images.texFacade, 'repeat-x'),
    };
    for (let r = 0; r < map.h; r++) {
      for (let c = 0; c < map.w; c++) if (isBuilding(map, c, r)) drawBuildingTile(g, run, c, r, t, pats);
      for (let c = 0; c < map.w; c++) {
        if (map.rows[r][c] !== 'x') continue;
        const k = clutterFor(c, r);
        drawImg(g, images[k.img], (c + 0.5) * t, (r + 0.95) * t, k.w * t);
      }
    }
    return cv;
  }

  // ---------------- Effects ----------------

  const TASK_TEXT = { fuse: 'Fuse!', power: 'Power on!', bell: 'DING!' };

  function event(ev, run) {
    if (ev.type === 'task' && run) {
      const o = run.objects[ev.id];
      effects.push({ kind: 'text', x: o.c + 0.5, y: o.r - 0.6, t: 0, life: 1.1, text: TASK_TEXT[ev.id], color: AMBER, size: 0.45 });
      if (ev.id === 'bell') bellAt = lastTime;
    }
  }

  function drawEffects(g, t, dt, reduced) {
    effects = effects.filter((f) => (f.t += dt) < f.life);
    for (const f of effects) drawFloatText(g, t, f, f.t / f.life, reduced);
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
    const flicker = reduced ? 0 : Math.sin(time * 9) * 0.02;
    for (const l of furniture.lamps) pool(g, t, l.x, l.y - 0.2, 1.9, '255, 200, 110', 0.2 + flicker);
    if (run.done.power) pool(g, t, run.objects.power.c + 0.5, run.objects.power.r + 0.3, 1.4, '150, 240, 90', 0.3);
    if (run.doorOpen) pool(g, t, run.door.c + 0.5, run.door.r + 1.1, 2.4, '255, 215, 137', 0.45);
    // Flashlight.
    const p = run.player;
    const len = 3.2, spread = 1.9;
    g.globalAlpha = 0.32;
    g.save();
    g.translate(p.x * t, (p.y - 0.15) * t);
    g.rotate(Math.atan2(p.fy, p.fx));
    g.drawImage(cone(), 0, (-spread / 2) * t, len * t, spread * t);
    g.restore();
    pool(g, t, p.x, p.y - 0.3, 1.2, '255, 236, 170', 0.12);
    g.restore();
  }

  // ---------------- Frame ----------------

  function draw(ctx, run, view) {
    const { cssW, cssH, time, reducedMotion: reduced } = view;
    const dpr = Math.min(view.dpr, 2);
    const { map } = run;
    const dt = clamp(time - lastTime, 0, 0.1);
    lastTime = time;

    const t = clamp(cssW / 7.8, 36, 66);
    if (!cache || cache.t !== t || cache.dpr !== dpr || cache.run !== run) {
      cache = { ground: buildGround(run, t, dpr), blocks: buildBlocks(run, t, dpr), furniture: streetFurniture(map), t, dpr, run };
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
    blitVisible(ctx, cache.blocks, worldW, worldH, cx, cy, cssW, cssH);

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

    // Standing things, back to front, each followed by an occlusion pass.
    const isOccluder = (c, r) => { const ch = map.rows[r][c]; return ch === '#' || ch === 'R' || ch === 'x'; };
    const items = [];
    const chasing = run.zombies.some((z) => z.state === 'chase');
    for (const z of run.zombies) items.push({ y: z.y, box: [z.x - 0.9, z.y - 1.9, z.x + 0.9, z.y + 0.5], draw: () => drawZombie(ctx, z, t, time, dt, reduced) });
    const p = run.player;
    items.push({ y: p.y, box: [p.x - 0.9, p.y - 1.7, p.x + 0.9, p.y + 0.5], draw: () => drawMara(ctx, run, t, time, dt, reduced, chasing) });
    const { kiosk, power, bell } = { kiosk: run.objects.fuse, power: run.objects.power, bell: run.objects.bell };
    items.push({ y: kiosk.r + 0.9, box: [kiosk.c - 0.1, kiosk.r - 0.6, kiosk.c + 1.1, kiosk.r + 1], draw: () => drawImg(ctx, images.kiosk, (kiosk.c + 0.5) * t, (kiosk.r + 0.98) * t, 0.95 * t, { alpha: run.done.fuse ? 0.85 : 1 }) });
    items.push({ y: power.r + 0.9, box: [power.c - 0.2, power.r - 0.6, power.c + 1.2, power.r + 1], draw: () => drawImg(ctx, run.done.power ? images.powerboxOn : images.powerboxOff, (power.c + 0.5) * t, (power.r + 0.98) * t, (run.done.power ? 0.92 : 0.72) * t) });
    items.push({ y: bell.r + 0.9, box: [bell.c - 0.2, bell.r - 0.6, bell.c + 1.2, bell.r + 1], draw: () => drawBell(ctx, bell, t, time, reduced) });
    const d = run.door;
    items.push({ y: d.r + 0.95, box: [d.c - 0.2, d.r - 0.2, d.c + 1.2, d.r + 1.05], draw: () => drawImg(ctx, run.doorOpen ? images.doorOpen : images.doorLocked, (d.c + 0.5) * t, (d.r + 1.04) * t, 1.2 * t) });
    for (const l of cache.furniture.lamps) items.push({ y: l.y, box: [l.x - 0.3, l.y - 2, l.x + 0.3, l.y + 0.1], draw: () => drawImg(ctx, images.streetLamp, l.x * t, l.y * t, 0.42 * t) });
    for (const h of cache.furniture.hydrants) items.push({ y: h.y, box: [h.x - 0.3, h.y - 0.6, h.x + 0.3, h.y + 0.1], draw: () => drawImg(ctx, images.hydrant, h.x * t, h.y * t, 0.32 * t) });
    for (const sc of SCENERY) {
      const img = images[sc.img], h = sc.w * (img.height / img.width);
      items.push({ y: sc.row + 0.95, box: [sc.x - sc.w / 2, sc.y - h, sc.x + sc.w / 2, sc.y], draw: () => drawImg(ctx, img, sc.x * t, sc.y * t, sc.w * t, { flip: sc.flip }) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const x0 = it.box[0] * t, y0 = it.box[1] * t, x1 = it.box[2] * t, y1 = it.box[3] * t;
      if (x1 < cx || x0 > cx + cssW || y1 < cy || y0 > cy + cssH) continue;
      it.draw();
      occlude(ctx, cache.blocks, map, isOccluder, Math.floor(it.y), x0, y0, x1, y1, t, 1.0);
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

  function drawMara(g, run, t, time, dt, reduced, chasing) {
    const p = run.player;
    const s = animator.step(p, dt, 13);
    if (p.fx < -0.2) s.flip = true;
    else if (p.fx > 0.2) s.flip = false;
    shadow(g, p.x * t, (p.y + 0.32) * t, t * 0.36);
    const w = Math.sin(s.phase) * s.walk;
    const pz = pose({
      t: reduced ? 0 : time,
      walk: reduced ? 0 : w,
      bob: reduced ? 0 : Math.abs(Math.sin(s.phase)) * 9 * s.walk + Math.sin(time * 2) * 2,
      alert: chasing ? 1 : 0,
    });
    drawRig(g, images, RIGS.mara, pz, p.x * t, (p.y + 0.36) * t, 1.6 * t, { flip: s.flip });
  }

  function drawZombie(g, z, t, time, dt, reduced) {
    const s = animator.step(z, dt, 8);
    if (z.fx < -0.2) s.flip = true;
    else if (z.fx > 0.2) s.flip = false;
    const rig = z.id % 2 === 0 ? RIGS.zgirl : RIGS.zombie;
    const x = z.x * t, foot = (z.y + 0.38) * t, h = 1.62 * t;
    const w = Math.sin(s.phase) * s.walk;
    shadow(g, x, foot - t * 0.04, t * 0.38);
    drawRig(g, images, rig, pose({ t: reduced ? 0 : time + z.id, walk: reduced ? 0 : w, bob: reduced ? 0 : Math.abs(w) * 8 }), x, foot, h, { flip: s.flip });
    if (z.state === 'chase' || z.state === 'search') {
      const mark = z.state === 'chase' ? '!' : '?';
      g.font = `900 ${Math.round(t * 0.6)}px system-ui, sans-serif`;
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

  return { draw, event, reset() { effects = []; cache = null; } };
}
