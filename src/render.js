// Canvas rendering for both campaigns. Simulation coordinates are tiles; the
// renderer picks a pixel size per tile from the viewport and follows the player.
import { KEEPER } from './keeper.js';
import { SURVIVOR, TASKS, taskIndex } from './survivor.js';

const C = {
  ink: '#181020',
  deep: '#251638',
  violet: '#49305f',
  lavender: '#bba8d3',
  stone: '#77717e',
  soul: '#baf45a',
  amber: '#ffd789',
};

export function createRenderer(canvas, images) {
  const ctx = canvas.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1, tile = 32;
  let staticLayer = null, staticKey = '';

  function resize() {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    staticKey = '';
  }

  function layout(map) {
    // Fit the full map width; on short/landscape viewports keep at least ~10 rows visible.
    tile = Math.max(18, Math.min(cssW / map.w, cssH / 10, 48));
    const worldW = map.w * tile, worldH = map.h * tile;
    return { worldW, worldH };
  }

  function camera(run, worldW, worldH) {
    const p = run.player;
    let cx = worldW <= cssW ? (worldW - cssW) / 2 : clamp(p.x * tile - cssW / 2, 0, worldW - cssW);
    let cy = worldH <= cssH ? (worldH - cssH) / 2 : clamp(p.y * tile - cssH / 2, 0, worldH - cssH);
    return { cx, cy };
  }

  function buildStatic(run) {
    const key = run.campaign + ':' + tile + ':' + dpr + ':' + (run.doorOpen ? 1 : 0) + ':' + (run.done ? Object.values(run.done).join('') : '');
    if (key === staticKey) return;
    staticKey = key;
    const { map } = run;
    staticLayer = document.createElement('canvas');
    staticLayer.width = Math.ceil(map.w * tile * dpr);
    staticLayer.height = Math.ceil(map.h * tile * dpr);
    const g = staticLayer.getContext('2d');
    g.scale(dpr, dpr);
    if (run.campaign === 'keeper') drawKeeperTiles(g, run, tile, images);
    else drawSurvivorTiles(g, run, tile, images);
  }

  function draw(run, { time, reducedMotion }) {
    const { map } = run;
    const { worldW, worldH } = layout(map);
    buildStatic(run);
    const { cx, cy } = camera(run, worldW, worldH);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = run.campaign === 'keeper' ? '#140b1e' : '#120c1c';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(-Math.round(cx), -Math.round(cy));
    ctx.drawImage(staticLayer, 0, 0, map.w * tile, map.h * tile);

    const env = { ctx, tile, images, time, reducedMotion, cx, cy, cssW, cssH };
    if (run.campaign === 'keeper') drawKeeperDynamic(env, run);
    else drawSurvivorDynamic(env, run);
    ctx.restore();

    if (run.campaign === 'keeper') {
      edgeArrow(env, run.gate.c + 0.5, run.gate.r + 0.5, C.amber, 'GATE');
      if (run.seal) edgeArrow(env, run.seal.x, run.seal.y, C.soul, 'SEAL');
    } else {
      const i = taskIndex(run);
      const target = i >= 0 ? run.objects[TASKS[i].id] : run.door;
      edgeArrow(env, target.c + 0.5, target.r + 0.5, C.amber, i >= 0 ? TASKS[i].short.toUpperCase() : 'REFUGE');
    }
  }

  return { resize, draw };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Deterministic per-tile noise so the static layer looks hand-placed, not random each frame.
function hash(c, r, s = 0) {
  let h = (c * 374761393 + r * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function outlinedRect(g, x, y, w, h, fill, rad = 4, lw = 2) {
  g.beginPath();
  g.roundRect(x, y, w, h, rad);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = C.ink;
  g.stroke();
}

// ---------------- Keeper tiles ----------------

function drawKeeperTiles(g, run, t, images) {
  const { map } = run;
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const ch = map.rows[r][c];
      const x = c * t, y = r * t;
      // Ground: flagstones in two cool tones.
      const n = hash(c, r);
      g.fillStyle = n < 0.5 ? '#2d2440' : '#30273f';
      g.fillRect(x, y, t, t);
      g.strokeStyle = 'rgba(15, 8, 24, .55)';
      g.lineWidth = 1.5;
      g.strokeRect(x + 1.5, y + 1.5, t - 3, t - 3);
      if (n > 0.82 && ch === '.') tuft(g, x + t * hash(c, r, 1), y + t * (0.5 + hash(c, r, 2) * 0.4), t);
    }
  }
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const ch = map.rows[r][c];
      const x = c * t, y = r * t;
      if (ch === '#') wallBlock(g, map, c, r, t);
      else if (ch === 'S') breachTile(g, x, y, t);
      else if (ch === 'G') gateTile(g, x, y, t);
    }
  }
  // Tombstones last so they overlap the wall tops a little.
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      if (map.rows[r][c] !== 'T') continue;
      const img = images.grave;
      const w = t * 1.15, h = w * (img.height / img.width);
      g.drawImage(img, c * t + (t - w) / 2, r * t + t - h + t * 0.05, w, h);
    }
  }
}

function wallBlock(g, map, c, r, t) {
  const x = c * t, y = r * t;
  const below = r + 1 < map.h && map.rows[r + 1][c] === '#';
  const lip = below ? 0 : t * 0.22;
  g.fillStyle = '#4b4259';
  g.fillRect(x, y, t, t);
  // Brick seams on the top face.
  g.strokeStyle = 'rgba(24, 16, 32, .7)';
  g.lineWidth = 1.5;
  const half = (t - lip) / 2;
  g.beginPath();
  g.moveTo(x, y + half); g.lineTo(x + t, y + half);
  const off = (r % 2) * t * 0.5;
  g.moveTo(x + ((t * 0.5 + off) % t), y); g.lineTo(x + ((t * 0.5 + off) % t), y + half);
  g.moveTo(x + ((off + t * 0.25) % t), y + half); g.lineTo(x + ((off + t * 0.25) % t), y + t - lip);
  g.stroke();
  if (lip) {
    g.fillStyle = '#2e2738';
    g.fillRect(x, y + t - lip, t, lip);
  }
  // Moss.
  if (hash(c, r, 7) > 0.7) {
    g.fillStyle = '#5d8a2a';
    g.beginPath();
    g.ellipse(x + t * (0.2 + hash(c, r, 8) * 0.6), y + 3, t * 0.18, t * 0.08, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Outline only edges that face open ground.
  g.strokeStyle = C.ink;
  g.lineWidth = 2.5;
  g.beginPath();
  const open = (cc, rr) => rr >= 0 && rr < map.h && cc >= 0 && cc < map.w && map.rows[rr][cc] !== '#';
  if (open(c, r - 1)) { g.moveTo(x, y + 1); g.lineTo(x + t, y + 1); }
  if (open(c, r + 1)) { g.moveTo(x, y + t - 1); g.lineTo(x + t, y + t - 1); }
  if (open(c - 1, r)) { g.moveTo(x + 1, y); g.lineTo(x + 1, y + t); }
  if (open(c + 1, r)) { g.moveTo(x + t - 1, y); g.lineTo(x + t - 1, y + t); }
  g.stroke();
}

function tuft(g, x, y, t) {
  g.strokeStyle = '#4f7a26';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = -1; i <= 1; i++) { g.moveTo(x, y); g.lineTo(x + i * t * 0.08, y - t * 0.14); }
  g.stroke();
}

function breachTile(g, x, y, t) {
  const grd = g.createRadialGradient(x + t / 2, y + t / 2, 2, x + t / 2, y + t / 2, t * 0.7);
  grd.addColorStop(0, 'rgba(150, 90, 220, .65)');
  grd.addColorStop(1, 'rgba(150, 90, 220, 0)');
  g.fillStyle = grd;
  g.fillRect(x - t * 0.3, y - t * 0.3, t * 1.6, t * 1.6);
  g.strokeStyle = C.ink;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + t * 0.2, y + t * 0.35); g.lineTo(x + t * 0.45, y + t * 0.55); g.lineTo(x + t * 0.4, y + t * 0.8);
  g.moveTo(x + t * 0.45, y + t * 0.55); g.lineTo(x + t * 0.8, y + t * 0.45);
  g.stroke();
}

function gateTile(g, x, y, t) {
  const grd = g.createLinearGradient(0, y, 0, y + t);
  grd.addColorStop(0, '#3a2b20');
  grd.addColorStop(1, '#ffd789');
  g.fillStyle = grd;
  g.fillRect(x, y, t, t);
  g.strokeStyle = C.ink;
  g.lineWidth = 2.5;
  for (let i = 1; i < 5; i++) {
    g.beginPath();
    g.moveTo(x + (i * t) / 5, y);
    g.lineTo(x + (i * t) / 5, y + t);
    g.stroke();
  }
  g.strokeRect(x + 1, y + 1, t - 2, t - 2);
}

// ---------------- Survivor tiles ----------------

function drawSurvivorTiles(g, run, t, images) {
  const { map } = run;
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const x = c * t, y = r * t;
      const n = hash(c, r);
      g.fillStyle = n < 0.5 ? '#2a2a44' : '#2d2c48';
      g.fillRect(x, y, t, t);
      // Cobbles.
      g.fillStyle = 'rgba(12, 8, 24, .35)';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.ellipse(x + t * (0.2 + 0.3 * k), y + t * (0.3 + 0.4 * hash(c, r, k)), t * 0.1, t * 0.06, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const ch = map.rows[r][c];
      const x = c * t, y = r * t;
      if (ch === '#') building(g, map, c, r, t);
      else if (ch === 'x') crate(g, x, y, t);
      else if (ch === 'F') kiosk(g, x, y, t, run.done.fuse);
      else if (ch === 'B') powerBox(g, x, y, t, run.done.power);
      else if (ch === 'L') bell(g, x, y, t, run.done.bell);
      else if (ch === 'R') door(g, x, y, t, run.doorOpen);
      else if (ch === 'P') {
        // Tram stop sign marks the safe start.
        g.fillStyle = 'rgba(255, 215, 137, .12)';
        g.beginPath(); g.arc(x + t / 2, y + t / 2, t * 1.4, 0, Math.PI * 2); g.fill();
      }
    }
  }
}

function building(g, map, c, r, t) {
  const x = c * t, y = r * t;
  g.fillStyle = '#3d2f57';
  g.fillRect(x, y, t, t);
  const open = (cc, rr) => rr >= 0 && rr < map.h && cc >= 0 && cc < map.w && map.rows[rr][cc] !== '#';
  // Windows: lit amber or sickly green, some dark.
  const n = hash(c, r, 3);
  if (open(c, r + 1) || open(c - 1, r) || open(c + 1, r) || open(c, r - 1)) {
    const col = n < 0.35 ? '#ffd789' : n < 0.55 ? '#9fdc54' : '#221a33';
    g.fillStyle = col;
    g.fillRect(x + t * 0.2, y + t * 0.25, t * 0.22, t * 0.28);
    g.fillRect(x + t * 0.58, y + t * 0.25, t * 0.22, t * 0.28);
    g.strokeStyle = C.ink;
    g.lineWidth = 1.5;
    g.strokeRect(x + t * 0.2, y + t * 0.25, t * 0.22, t * 0.28);
    g.strokeRect(x + t * 0.58, y + t * 0.25, t * 0.22, t * 0.28);
  }
  if (open(c, r + 1)) {
    g.fillStyle = '#2a2040';
    g.fillRect(x, y + t * 0.78, t, t * 0.22);
  }
  g.strokeStyle = C.ink;
  g.lineWidth = 2.5;
  g.beginPath();
  if (open(c, r - 1)) { g.moveTo(x, y + 1); g.lineTo(x + t, y + 1); }
  if (open(c, r + 1)) { g.moveTo(x, y + t - 1); g.lineTo(x + t, y + t - 1); }
  if (open(c - 1, r)) { g.moveTo(x + 1, y); g.lineTo(x + 1, y + t); }
  if (open(c + 1, r)) { g.moveTo(x + t - 1, y); g.lineTo(x + t - 1, y + t); }
  g.stroke();
}

function crate(g, x, y, t) {
  outlinedRect(g, x + t * 0.1, y + t * 0.15, t * 0.8, t * 0.75, '#3f5a2e', 4, 2.5);
  g.strokeStyle = 'rgba(24,16,32,.7)';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x + t * 0.1, y + t * 0.4); g.lineTo(x + t * 0.9, y + t * 0.4); g.stroke();
}

function kiosk(g, x, y, t, done) {
  outlinedRect(g, x + t * 0.08, y + t * 0.05, t * 0.84, t * 0.9, '#6b5a2f', 5, 2.5);
  outlinedRect(g, x + t * 0.2, y + t * 0.2, t * 0.6, t * 0.35, done ? '#2a2333' : '#ffd789', 3, 2);
  g.fillStyle = C.ink;
  g.font = `bold ${t * 0.3}px system-ui`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(done ? '' : '⚡', x + t / 2, y + t * 0.38);
}

function powerBox(g, x, y, t, done) {
  outlinedRect(g, x + t * 0.12, y + t * 0.08, t * 0.76, t * 0.84, '#5f6470', 4, 2.5);
  g.fillStyle = done ? C.soul : '#3a1d1d';
  g.beginPath(); g.arc(x + t * 0.5, y + t * 0.32, t * 0.11, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.fillStyle = C.ink;
  g.fillRect(x + t * 0.3, y + t * 0.58, t * 0.4, t * 0.08);
}

function bell(g, x, y, t, done) {
  g.fillStyle = '#4b3a2a';
  g.fillRect(x + t * 0.45, y + t * 0.55, t * 0.1, t * 0.4);
  g.beginPath();
  g.moveTo(x + t * 0.2, y + t * 0.62);
  g.quadraticCurveTo(x + t * 0.22, y + t * 0.1, x + t * 0.5, y + t * 0.1);
  g.quadraticCurveTo(x + t * 0.78, y + t * 0.1, x + t * 0.8, y + t * 0.62);
  g.closePath();
  g.fillStyle = done ? '#ffe7a8' : '#d9a441';
  g.fill();
  g.strokeStyle = C.ink;
  g.lineWidth = 2.5;
  g.stroke();
}

function door(g, x, y, t, open) {
  outlinedRect(g, x + t * 0.1, y + t * 0.02, t * 0.8, t * 0.98, open ? '#ffd789' : '#5a3b24', 6, 2.5);
  if (!open) {
    outlinedRect(g, x + t * 0.38, y + t * 0.45, t * 0.24, t * 0.2, '#9a9aa5', 2, 2);
  } else {
    const grd = g.createRadialGradient(x + t / 2, y + t / 2, 2, x + t / 2, y + t / 2, t * 1.4);
    grd.addColorStop(0, 'rgba(255,215,137,.55)');
    grd.addColorStop(1, 'rgba(255,215,137,0)');
    g.fillStyle = grd;
    g.fillRect(x - t, y - t * 0.5, t * 3, t * 2.5);
  }
}

// ---------------- Dynamic layers ----------------

function sprite(env, img, x, y, h, { flip = false, alpha = 1, bob = 0 } = {}) {
  const { ctx, tile } = env;
  const ph = h * tile, pw = ph * (img.width / img.height);
  const px = x * tile, py = y * tile + bob;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -pw / 2, -ph, pw, ph);
  ctx.restore();
}

function shadow(env, x, y, w = 0.36) {
  const { ctx, tile } = env;
  ctx.fillStyle = 'rgba(8, 4, 14, .45)';
  ctx.beginPath();
  ctx.ellipse(x * tile, y * tile, w * tile, w * tile * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

const bobOf = (env, speed = 6, amp = 2, phase = 0) =>
  env.reducedMotion ? 0 : Math.sin(env.time * speed + phase) * amp;

function drawKeeperDynamic(env, run) {
  const { ctx, tile, images, time } = env;

  // Seal marker.
  if (run.seal) {
    const pulse = env.reducedMotion ? 1 : 1 + Math.sin(time * 4) * 0.12;
    ctx.save();
    ctx.translate(run.seal.x * tile, run.seal.y * tile);
    ctx.strokeStyle = C.soul;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, tile * 0.45 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.arc(0, 0, tile * 0.45 * pulse + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.soul;
    ctx.font = `bold ${tile * 0.42}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, 1);
    ctx.restore();
  }

  // Depth-sort everything that stands on the ground.
  const things = [];
  for (const e of run.enemies) things.push({ y: e.y, draw: () => drawUndead(env, e) });
  for (const s of run.souls) things.push({ y: s.y, draw: () => drawSoul(env, s) });
  things.push({ y: run.player.y, draw: () => drawReaper(env, run) });
  things.sort((a, b) => a.y - b.y);
  for (const t of things) t.draw();

  // Slash arc.
  if (run.slash) {
    const p = run.player;
    const k = run.slash.t / KEEPER.slashDuration;
    const a0 = run.slash.angle - KEEPER.slashHalfAngle;
    const a1 = run.slash.angle + KEEPER.slashHalfAngle;
    const sweep = env.reducedMotion ? 1 : Math.min(1, k * 2.2);
    ctx.save();
    ctx.translate(p.x * tile, (p.y - 0.25) * tile);
    ctx.globalAlpha = 1 - k * 0.7;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = tile * 0.32;
    ctx.beginPath(); ctx.arc(0, 0, KEEPER.slashRange * tile * 0.82, a0, a0 + (a1 - a0) * sweep); ctx.stroke();
    ctx.strokeStyle = C.soul;
    ctx.lineWidth = tile * 0.2;
    ctx.beginPath(); ctx.arc(0, 0, KEEPER.slashRange * tile * 0.82, a0, a0 + (a1 - a0) * sweep); ctx.stroke();
    ctx.restore();
  }
}

function drawReaper(env, run) {
  const p = run.player;
  const { ctx, tile } = env;
  shadow(env, p.x, p.y + 0.3, 0.34);
  let alpha = 1;
  if (run.invuln > 0) {
    if (env.reducedMotion) {
      ctx.strokeStyle = '#ff8a8a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x * tile, (p.y - 0.2) * tile, tile * 0.62, 0, Math.PI * 2); ctx.stroke();
    } else {
      alpha = Math.floor(env.time * 10) % 2 ? 0.35 : 1;
    }
  }
  sprite(env, env.images.reaper, p.x, p.y + 0.4, 1.45, {
    flip: p.fx > 0.2, alpha, bob: p.moving ? bobOf(env, 14, 1.5) : 0,
  });
  // Facing tick so the slash direction is always readable.
  ctx.fillStyle = C.soul;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  const fx = (p.x + p.fx * 0.62) * tile, fy = (p.y + p.fy * 0.62) * tile;
  ctx.beginPath(); ctx.arc(fx, fy, tile * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawUndead(env, e) {
  const { ctx, tile, images } = env;
  if (e.state === 'rising') {
    const k = 1 - e.rise / KEEPER.spawnWarning;
    ctx.save();
    ctx.strokeStyle = '#ff8a8a';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(e.x * tile, e.y * tile, tile * 0.48, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    sprite(env, images.zombieRise, e.x, e.y + 0.35, 0.45 + 0.35 * k, { alpha: 0.6 + 0.4 * k });
    return;
  }
  shadow(env, e.x, e.y + 0.3, 0.3);
  sprite(env, images.zombie, e.x, e.y + 0.4, 1.3, { flip: e.fx < -0.2, bob: bobOf(env, 7, 1.5, e.id) });
}

function drawSoul(env, s) {
  const bob = bobOf(env, 3, 3, s.id);
  const { ctx, tile } = env;
  const grd = ctx.createRadialGradient(s.x * tile, s.y * tile, 1, s.x * tile, s.y * tile, tile * 0.6);
  grd.addColorStop(0, 'rgba(186,244,90,.45)');
  grd.addColorStop(1, 'rgba(186,244,90,0)');
  ctx.fillStyle = grd;
  ctx.fillRect((s.x - 0.6) * tile, (s.y - 0.6) * tile, tile * 1.2, tile * 1.2);
  sprite(env, env.images.soul, s.x, s.y + 0.25, 0.95, { bob });
}

function drawSurvivorDynamic(env, run) {
  const { ctx, tile, images, time } = env;
  const i = taskIndex(run);
  const target = i >= 0 ? run.objects[TASKS[i].id] : run.door;
  // Objective marker.
  const pulse = env.reducedMotion ? 0 : Math.sin(time * 4) * 3;
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc((target.c + 0.5) * tile, (target.r + 0.5) * tile, tile * 0.75 + pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const things = [];
  for (const z of run.zombies) things.push({ y: z.y, draw: () => drawZombie(env, run, z) });
  things.push({ y: run.player.y, draw: () => drawSurvivorPlayer(env, run) });
  things.sort((a, b) => a.y - b.y);
  for (const t of things) t.draw();
}

function drawZombie(env, run, z) {
  const { ctx, tile, images } = env;
  // Sight radius: faint while patrolling, stronger when alert.
  ctx.fillStyle = z.state === 'chase' ? 'rgba(255,120,120,.14)' : 'rgba(255,120,120,.06)';
  ctx.strokeStyle = z.state === 'chase' ? 'rgba(255,138,138,.55)' : 'rgba(255,138,138,.22)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(z.x * tile, z.y * tile, SURVIVOR.detectRange * tile, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  shadow(env, z.x, z.y + 0.3, 0.3);
  sprite(env, images.zombie, z.x, z.y + 0.4, 1.3, { flip: z.fx < -0.2, bob: bobOf(env, 6, 1.5, z.id) });
  if (z.state === 'chase' || z.state === 'search') {
    const mark = z.state === 'chase' ? '!' : '?';
    ctx.font = `bold ${tile * 0.55}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.ink;
    ctx.strokeText(mark, z.x * tile, (z.y - 0.95) * tile);
    ctx.fillStyle = z.state === 'chase' ? '#ff8a8a' : C.amber;
    ctx.fillText(mark, z.x * tile, (z.y - 0.95) * tile);
  }
}

function drawSurvivorPlayer(env, run) {
  const p = run.player;
  shadow(env, p.x, p.y + 0.3, 0.3);
  sprite(env, env.images.survivor, p.x, p.y + 0.4, 1.3, {
    flip: p.fx < -0.2, bob: p.moving ? bobOf(env, 14, 1.5) : 0,
  });
}

// Arrow on the viewport edge pointing at an offscreen world point.
function edgeArrow(env, wx, wy, color, label) {
  const { ctx, tile, cx, cy, cssW, cssH } = env;
  const sx = wx * tile - cx, sy = wy * tile - cy;
  const m = 26;
  if (sx >= 0 && sx <= cssW && sy >= 0 && sy <= cssH) return;
  const ax = clamp(sx, m, cssW - m), ay = clamp(sy, m, cssH - m);
  const ang = Math.atan2(sy - ay, sx - ax);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(14, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.restore();
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ly = ay > cssH / 2 ? ay - 22 : ay + 22;
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.ink;
  ctx.strokeText(label, ax, ly);
  ctx.fillStyle = color;
  ctx.fillText(label, ax, ly);
}
