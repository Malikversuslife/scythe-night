// Helpers shared by the three-quarter-view campaign renderers.

export const INK = '#181020';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOut = (k) => 1 - (1 - k) * (1 - k);

// Deterministic per-tile noise so set dressing looks hand-placed and never moves.
export function hash(c, r, s = 0) {
  let h = (c * 374761393 + r * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Draw an image `w` pixels wide, centred on cx, standing on baseY.
export function drawImg(g, img, cx, baseY, w, { flip = false, alpha = 1 } = {}) {
  const h = w * (img.height / img.width);
  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, baseY);
  if (flip) g.scale(-1, 1);
  g.drawImage(img, -w / 2, -h, w, h);
  g.restore();
}

export function shadow(g, x, y, w) {
  g.fillStyle = 'rgba(8, 3, 16, .5)';
  g.beginPath();
  g.ellipse(x, y, w, w * 0.38, 0, 0, Math.PI * 2);
  g.fill();
}

// A soft round glow sprite per colour, rendered once and stamped with drawImage.
const glowCache = {};
export function glow(rgb) {
  if (glowCache[rgb]) return glowCache[rgb];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 1, 64, 64, 64);
  grd.addColorStop(0, `rgba(${rgb}, 1)`);
  grd.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return (glowCache[rgb] = cv);
}

// Additive light pool in world tiles.
export function pool(g, t, x, y, r, rgb, a) {
  g.globalAlpha = a;
  g.drawImage(glow(rgb), (x - r) * t, (y - r) * t, r * 2 * t, r * 2 * t);
}

// Repeating texture scaled so one repeat spans `tilesPerRepeat` tiles.
export function tilePattern(g, img, t, tilesPerRepeat, repeat = 'repeat') {
  const p = g.createPattern(img, repeat);
  const s = (tilesPerRepeat * t) / img.width;
  p.setTransform(new DOMMatrix().scale(s, s));
  return p;
}

export function offscreen(w, h, dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * dpr);
  cv.height = Math.ceil(h * dpr);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  return { cv, g };
}

// After drawing something that stands in `row`, repaint cached occluder cells of later
// rows that overlap its box (canvas px), so walls in front of it hide it.
// `rise` is how far (in tiles) an occluder cell's art reaches above its own row.
export function occlude(g, layer, map, isOccluder, row, x0, y0, x1, y1, t, rise) {
  const s = layer.width / (map.w * t);
  const cA = Math.max(0, Math.floor(x0 / t)), cB = Math.min(map.w - 1, Math.floor(x1 / t));
  for (let r = row + 1; r < map.h && (r - rise) * t < y1; r++) {
    const top = Math.max(y0, (r - rise) * t), bottom = Math.min(y1, (r + 1) * t);
    if (bottom <= top) continue;
    for (let c = cA; c <= cB; c++) {
      if (!isOccluder(c, r)) continue;
      const left = Math.max(x0, c * t), right = Math.min(x1, (c + 1) * t);
      if (right <= left) continue;
      g.drawImage(layer, left * s, top * s, (right - left) * s, (bottom - top) * s, left, top, right - left, bottom - top);
    }
  }
}

// Draw the visible slice of a world-sized cached layer.
export function blitVisible(ctx, layer, worldW, worldH, cx, cy, cssW, cssH) {
  const vx = Math.max(0, cx), vy = Math.max(0, cy);
  const vw = Math.min(worldW, cx + cssW) - vx, vh = Math.min(worldH, cy + cssH) - vy;
  if (vw <= 0 || vh <= 0) return;
  const s = layer.width / worldW;
  ctx.drawImage(layer, vx * s, vy * s, vw * s, vh * s, vx, vy, vw, vh);
}

// Smoothed follow camera that keeps the player in the band between the HUD and controls.
export function followCamera(cam, run, t, view, dt, reduced) {
  const { cssW, cssH, insets } = view;
  const worldW = run.map.w * t, worldH = run.map.h * t;
  const bandH = cssH - insets.top - insets.bottom;
  const tx = clamp(run.player.x * t - cssW / 2, 0, Math.max(0, worldW - cssW)) + Math.min(0, (worldW - cssW) / 2);
  const ty = clamp(run.player.y * t - (insets.top + bandH / 2), -insets.top - t * 1.5, worldH - cssH + insets.bottom);
  if (cam.x === null || reduced) { cam.x = tx; cam.y = ty; }
  else { const k = 1 - Math.exp(-dt * 9); cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k); }
  return { cx: Math.round(cam.x), cy: Math.round(cam.y), worldW, worldH };
}

// Per-entity walk-cycle state, advanced from how far the entity actually moved.
export function createAnimator() {
  const anim = new WeakMap();
  return {
    get: (e) => anim.get(e),
    step(e, dt, speed) {
      let s = anim.get(e);
      if (!s) { s = { phase: Math.random() * 6, walk: 0, flip: false, px: e.x, py: e.y }; anim.set(e, s); }
      const moved = Math.hypot(e.x - s.px, e.y - s.py);
      s.px = e.x; s.py = e.y;
      const moving = moved > 0.0005;
      if (moving) s.phase += dt * speed;
      s.walk = lerp(s.walk, moving ? 1 : 0, Math.min(1, dt * 10));
      return s;
    },
  };
}

// Floating score / label text and puffs, shared effect list.
export function drawFloatText(g, t, f, k, reduced) {
  const y = (f.y - (reduced ? 0 : k * 0.6)) * t;
  g.save();
  g.globalAlpha = 1 - k * k;
  g.font = `900 ${Math.round(t * (f.size || 0.5))}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.lineWidth = Math.max(3, t * 0.1);
  g.strokeStyle = INK;
  g.strokeText(f.text, f.x * t, y);
  g.fillStyle = f.color;
  g.fillText(f.text, f.x * t, y);
  g.restore();
}
