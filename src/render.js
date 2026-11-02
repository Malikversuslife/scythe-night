// Canvas rendering entry point: sizes the canvas, routes each campaign to its
// renderer, and draws the screen-space edge arrows on top.
import { TASKS, taskIndex } from './survivor.js';
import { createKeeperRenderer } from './render-keeper.js';
import { createSurvivorRenderer } from './render-survivor.js';
import { INK, clamp } from './render-common.js';

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
  };
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
