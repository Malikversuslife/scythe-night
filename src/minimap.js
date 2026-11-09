// The minimap in the corner of the HUD: a radar that sweeps around the hero and shows the walls,
// obstacles and goals near them, and the enemies its sweep picks up. Tapped, it opens into a map
// of the whole level. Enemies only ever show inside the radar's range, open or not.

import { TASKS, taskIndex } from './survivor.js';

const RANGE = 9;           // tiles the radar reaches
const SWEEP = 2.2;         // seconds per turn of the sweep
const FADE = 2.0;          // seconds a blip stays lit after the sweep passes it
const PX = 8;              // map pixels per tile in the cached picture

const COLOURS = {
  ground: '#1c2026', wall: '#4a4f5c', obstacle: '#6a6474', breach: '#5a3a6c',
  you: '#baf45a', enemy: '#ff5a5a', goal: '#ffd789', ring: 'rgba(186, 244, 90, .5)',
};

// Which kind of tile a map character is, the same in both stories.
function tileKind(ch) {
  if (ch === '#' || ch === 'R') return 'wall';
  if (ch === 'x' || ch === 'T') return 'obstacle';
  if (ch === 'S') return 'breach';
  return 'ground';
}

// The level's layout drawn once per run: it never changes.
function layoutPicture(map) {
  const cv = document.createElement('canvas');
  cv.width = map.w * PX; cv.height = map.h * PX;
  const g = cv.getContext('2d');
  g.fillStyle = COLOURS.ground;
  g.fillRect(0, 0, cv.width, cv.height);
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const k = tileKind(map.rows[r][c]);
      if (k === 'ground') continue;
      g.fillStyle = COLOURS[k];
      const inset = k === 'obstacle' ? PX * 0.18 : 0;
      g.fillRect(c * PX + inset, r * PX + inset, PX - inset * 2, PX - inset * 2);
    }
  }
  return cv;
}

// Enemies the radar can pick up: anything awake, but not a crawler lying in wait.
function enemiesOf(run) {
  const list = run.campaign === 'keeper' ? run.enemies : run.zombies;
  return list.filter((e) => e.state !== 'dormant' && e.state !== 'lurk');
}

// Where the hero should be heading, as a tile centre.
function goalsOf(run) {
  if (run.campaign === 'keeper') {
    const out = (run.map.marks.G || []).map((g) => ({ x: g.c + 0.5, y: g.r + 0.5 }));
    if (run.seal) out.push({ x: run.seal.x, y: run.seal.y });
    return out;
  }
  const i = taskIndex(run);
  const t = i >= 0 ? run.objects[TASKS[i].id] : run.door;
  return [{ x: t.c + 0.5, y: t.r + 0.5 }];
}

export function createMinimap(button, canvas) {
  let picture = null, pictureRun = null;
  const lastSeen = new Map();   // enemy -> time the sweep last passed over it
  let open = false;

  button.addEventListener('click', () => toggle());
  function toggle(force) {
    open = force ?? !open;
    button.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close the map' : 'Open the map');
  }

  function draw(run, time) {
    if (!run) return;
    if (pictureRun !== run) { picture = layoutPicture(run.map); pictureRun = run; lastSeen.clear(); }
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(rect.width * dpr)), H = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const p = run.player, map = run.map;
    const sweep = ((time / SWEEP) % 1) * Math.PI * 2;

    // The sweep lights up an enemy as it passes; the blip fades until the next pass.
    for (const e of enemiesOf(run)) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > RANGE) continue;
      const a = (Math.atan2(e.y - p.y, e.x - p.x) + Math.PI * 2) % (Math.PI * 2);
      const behind = (sweep - a + Math.PI * 2) % (Math.PI * 2);
      if (behind < 0.25) lastSeen.set(e, time);
    }

    // Map tiles to canvas pixels: around the hero when small, the whole level when open.
    let s, ox, oy;
    if (open) {
      s = Math.min(W / map.w, H / map.h);
      ox = (W - map.w * s) / 2; oy = (H - map.h * s) / 2;
    } else {
      s = Math.min(W, H) / (RANGE * 2);
      ox = W / 2 - p.x * s; oy = H / 2 - p.y * s;
    }
    const X = (x) => ox + x * s, Y = (y) => oy + y * s;

    g.save();
    if (!open) { g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2 - 1, 0, Math.PI * 2); g.clip(); }
    g.fillStyle = '#0c0e12';
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.95;
    g.drawImage(picture, X(0), Y(0), map.w * s, map.h * s);
    g.globalAlpha = 1;

    // The radar's reach, and its sweep.
    const cx = X(p.x), cy = Y(p.y), R = RANGE * s;
    g.strokeStyle = COLOURS.ring; g.lineWidth = Math.max(1, dpr);
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R / 2, 0, Math.PI * 2); g.stroke();
    const grad = g.createConicGradient ? g.createConicGradient(sweep - 0.9, cx, cy) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(186, 244, 90, 0)');
      grad.addColorStop(0.14, 'rgba(186, 244, 90, .28)');
      grad.addColorStop(0.145, 'rgba(186, 244, 90, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    }

    // Goals, then enemies, then the hero on top.
    const pulse = 0.6 + Math.sin(time * 4) * 0.4;
    for (const goal of goalsOf(run)) {
      g.fillStyle = COLOURS.goal; g.globalAlpha = 0.6 + pulse * 0.4;
      const r = Math.max(3 * dpr, s * 0.45);
      g.beginPath(); g.moveTo(X(goal.x), Y(goal.y) - r); g.lineTo(X(goal.x) + r, Y(goal.y)); g.lineTo(X(goal.x), Y(goal.y) + r); g.lineTo(X(goal.x) - r, Y(goal.y)); g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    for (const [e, seen] of lastSeen) {
      const k = 1 - (time - seen) / FADE;
      if (k <= 0 || !enemiesOf(run).includes(e)) { if (k <= 0) lastSeen.delete(e); continue; }
      const big = e.kind === 'brute' || e.kind === 'stalker';
      g.globalAlpha = k;
      g.fillStyle = COLOURS.enemy;
      g.shadowColor = COLOURS.enemy; g.shadowBlur = 6 * dpr;
      g.beginPath(); g.arc(X(e.x), Y(e.y), Math.max(2.5 * dpr, s * (big ? 0.42 : 0.3)), 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
    const a = Math.atan2(p.fy || 0, p.fx || 0.0001), r = Math.max(4 * dpr, s * 0.55);
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = COLOURS.you; g.strokeStyle = '#0c0e12'; g.lineWidth = dpr;
    g.beginPath(); g.moveTo(r, 0); g.lineTo(-r * 0.7, r * 0.65); g.lineTo(-r * 0.35, 0); g.lineTo(-r * 0.7, -r * 0.65); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.restore();
  }

  return { draw, toggle, get open() { return open; } };
}
