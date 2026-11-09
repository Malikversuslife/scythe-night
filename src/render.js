// Canvas rendering entry point: sizes the canvas, routes each campaign to its
// renderer, and draws the screen-space edge arrows on top.
import { TASKS, taskIndex } from './survivor.js';
import { createKeeperRenderer } from './render-keeper.js';
import { createSurvivorRenderer } from './render-survivor.js';
import { INK, clamp } from './render-common.js';
import { RIGS, drawRig, pose } from './rig.js';

const SOUL = '#baf45a';
const AMBER = '#ffd789';

export function createRenderer(canvas, images) {
  const ctx = canvas.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1;
  const keeper = createKeeperRenderer(images);
  const survivor = createSurvivorRenderer(images);

  function resize() {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  function draw(run, { time, reducedMotion, insets = { top: 0, bottom: 0 } }) {
    const view = { cssW, cssH, dpr, time, reducedMotion, insets, backdrop: images.backdrop };
    const v = (run.campaign === 'keeper' ? keeper : survivor).draw(ctx, run, view);
    const env = { ctx, tile: v.tile, cx: v.cx, cy: v.cy, cssW, cssH, insets };
    if (run.campaign === 'keeper') {
      edgeArrow(env, run.gate.c + 0.5, run.gate.r + 0.5, AMBER, 'GATE');
      if (run.seal) edgeArrow(env, run.seal.x, run.seal.y, SOUL, 'SEAL');
    } else {
      const i = taskIndex(run);
      const target = i >= 0 ? run.objects[TASKS[i].id] : run.door;
      edgeArrow(env, target.c + 0.5, target.r + 0.5, AMBER, i >= 0 ? TASKS[i].short.toUpperCase() : 'REFUGE');
    }
  }

  return {
    resize,
    draw,
    event: (ev, run) => (run?.campaign === 'survivor' ? survivor : keeper).event(ev, run),
    reset: () => { keeper.reset(); survivor.reset(); },
    recheck: () => { keeper.recheck(); survivor.recheck(); },
    layers: (run) => (run.campaign === 'keeper' ? keeper : survivor).layers(),
    setSkin: (overrides, glow) => { keeper.setSkin(overrides, glow); survivor.setSkin(overrides); },
  };
}

// A hero walking on the spot and turning, for the Characters page: front, side, back, other side.
export function drawShowcase(canvas, campaign, images, overrides, time) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 200, h = rect.height || 260;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const base = overrides.__rig || (campaign === 'keeper' ? 'reaper' : 'mara');
  const step = ((Math.floor(time / 2.6) % 4) + 4) % 4;
  const rig = RIGS[[base, `${base}Side`, `${base}Back`, `${base}Side`][step]];
  const cycle = time * 7;
  const p = pose({ t: time, walk: 1, flow: 1, cycle, bob: Math.abs(Math.sin(cycle)) * 4 });
  // A soft pool of light under the hero.
  ctx.save();
  ctx.translate(w / 2, h * 0.93); ctx.scale(1, 0.28);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.4);
  g.addColorStop(0, 'rgba(186, 244, 90, .24)'); g.addColorStop(1, 'rgba(186, 244, 90, 0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawRig(ctx, { ...images, ...overrides }, rig, p, w / 2, h * 0.93, h * 0.84, { flip: step === 3 });
}

// Standing character for menus: same rig and art as in play.
export function drawPreview(canvas, campaign, images, overrides = {}) {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.clientWidth || 120, h = rect.height || canvas.clientHeight || 140;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const rig = RIGS[overrides.__rig || (campaign === 'keeper' ? 'reaper' : 'mara')];
  const skin = { ...images, ...overrides };
  // The rig's art hangs a little below its feet (scythe, lantern), so stand it above the base.
  drawRig(ctx, skin, rig, pose(), w / 2, h * 0.94, h * 0.9);
}

// Arrow on the edge of the play band pointing at an offscreen world point.
function edgeArrow(env, wx, wy, color, label) {
  const { ctx, tile, cx, cy, cssW, cssH } = env;
  const top = env.insets?.top ?? 0, bottom = cssH - (env.insets?.bottom ?? 0);
  const sx = wx * tile - cx, sy = wy * tile - cy;
  const m = 26;
  if (sx >= 0 && sx <= cssW && sy >= top && sy <= bottom) return;
  const ax = clamp(sx, m, cssW - m), ay = clamp(sy, top + m, bottom - m);
  const ang = Math.atan2(sy - ay, sx - ax);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(14, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ly = ay > (top + bottom) / 2 ? ay - 22 : ay + 22;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeText(label, ax, ly);
  ctx.fillStyle = color;
  ctx.fillText(label, ax, ly);
  ctx.textBaseline = 'alphabetic';
}
