// Cemetery Keeper v2 renderer: three-quarter view walls, generated art, cutout rigs.
// World units are tiles. Walls rise WALL_H tiles above their footprint, so each
// row is drawn back-to-front with the characters standing in it.
import { KEEPER } from './keeper.js';
import { SKILLS } from './catalog.js';
import { RIGS, GAITS, drawRig, facingView, pose, undeadPose, undeadRig } from './rig.js';
import {
  INK, clamp, lerp, easeOut, hash, drawImg, shadow, pool, tilePattern, offscreen,
  occlude, blitVisible, followCamera, createAnimator, drawFloatText,
} from './render-common.js';

export const KEEPER_IMAGES = {
  texGround: 'assets/img/v2/tex-ground.jpg',
  texWallTop: 'assets/img/v2/tex-walltop.jpg',
  texWallFront: 'assets/img/v2/tex-wallfront.jpg',
  graveRip: 'assets/img/v2/grave-rip.png',
  graveArch: 'assets/img/v2/grave-arch.png',
  graveCross: 'assets/img/v2/grave-cross.png',
  graveBroken: 'assets/img/v2/grave-broken.png',
  lanternPost: 'assets/img/v2/lantern-post.png',
  skull: 'assets/img/v2/skull.png',
  bones: 'assets/img/v2/bones.png',
  mushrooms: 'assets/img/v2/mushrooms.png',
  mausoleum: 'assets/img/v2/mausoleum.png',
  deadTree: 'assets/img/v2/dead-tree.png',
  ironGate: 'assets/img/v2/iron-gate.png',
  soulFlame: 'assets/img/v2/soul-flame.png',
  openGrave: 'assets/img/v2/open-grave.png',
  sealSigil: 'assets/img/v2/seal-sigil.png',
  smokePuff: 'assets/img/v2/smoke-puff.png',
  sparkle: 'assets/img/v2/sparkle.png',
  reaperBody: 'assets/img/v2/reaper-body.png',
  reaperHead: 'assets/img/v2/reaper-head.png',
  reaperArmBack: 'assets/img/v2/reaper-arm-back.png',
  reaperArmFront: 'assets/img/v2/reaper-arm-front.png',
  reaperScythe: 'assets/img/v2/reaper-scythe.png',
  reaperLantern: 'assets/img/v2/reaper-lantern.png',
  reaperSideHead: 'assets/img/v2/reaper-side-head.png',
  reaperSideBody: 'assets/img/v2/reaper-side-body.png',
  reaperSideArm: 'assets/img/v2/reaper-side-arm.png',
  reaperBackHead: 'assets/img/v2/reaper-back-head.png',
  reaperBackBody: 'assets/img/v2/reaper-back-body.png',
  reaperBackArm: 'assets/img/v2/reaper-back-arm.png',
  zombieHead: 'assets/img/v2/zombie-head.png',
  zombieBody: 'assets/img/v2/zombie-body.png',
  zombieArm: 'assets/img/v2/zombie-arm.png',
  zombieLeg: 'assets/img/v2/zombie-leg.png',
  zombieSideHead: 'assets/img/v2/zombie-side-head.png',
  zombieSideBody: 'assets/img/v2/zombie-side-body.png',
  zombieSideArm: 'assets/img/v2/zombie-side-arm.png',
  zombieSideThigh: 'assets/img/v2/zombie-side-thigh.png',
  zombieSideShin: 'assets/img/v2/zombie-side-shin.png',
  zombieSideFoot: 'assets/img/v2/zombie-side-foot.png',
  zombieSideThighFar: 'assets/img/v2/zombie-side-thigh-far.png',
  zombieSideShinFar: 'assets/img/v2/zombie-side-shin-far.png',
  zombieSideFootFar: 'assets/img/v2/zombie-side-foot-far.png',
  zombieBackHead: 'assets/img/v2/zombie-back-head.png',
  zombieBackBody: 'assets/img/v2/zombie-back-body.png',
  zombieBackArm: 'assets/img/v2/zombie-back-arm.png',
  zombieBackLeg: 'assets/img/v2/zombie-back-leg.png',
  zgirlHead: 'assets/img/v2/zgirl-head.png',
  zgirlBody: 'assets/img/v2/zgirl-body.png',
  zgirlArm: 'assets/img/v2/zgirl-arm.png',
  zgirlLeg: 'assets/img/v2/zgirl-leg.png',
  zgirlSideHead: 'assets/img/v2/zgirl-side-head.png',
  zgirlSideBody: 'assets/img/v2/zgirl-side-body.png',
  zgirlSideArm: 'assets/img/v2/zgirl-side-arm.png',
  zgirlSideThigh: 'assets/img/v2/zgirl-side-thigh.png',
  zgirlSideShin: 'assets/img/v2/zgirl-side-shin.png',
  zgirlSideFoot: 'assets/img/v2/zgirl-side-foot.png',
  zgirlSideThighFar: 'assets/img/v2/zgirl-side-thigh-far.png',
  zgirlSideShinFar: 'assets/img/v2/zgirl-side-shin-far.png',
  zgirlSideFootFar: 'assets/img/v2/zgirl-side-foot-far.png',
  zgirlBackHead: 'assets/img/v2/zgirl-back-head.png',
  zgirlBackBody: 'assets/img/v2/zgirl-back-body.png',
  zgirlBackArm: 'assets/img/v2/zgirl-back-arm.png',
  zgirlBackLeg: 'assets/img/v2/zgirl-back-leg.png',
};

const WALL_H = 0.55;
const SOUL = '#baf45a';

// Set dressing, in tiles. Trees and the mausoleum sit on the outer wall ring.
const SCENERY = [
  { img: 'mausoleum', x: 6.5, y: 1.92, w: 1.9, row: 1 },
  { img: 'deadTree', x: 0.55, y: 7.95, w: 2.3, row: 7 },
  { img: 'deadTree', x: 12.45, y: 13.95, w: 2.3, row: 13, flip: true },
  { img: 'deadTree', x: 12.5, y: 3.95, w: 2.0, row: 3, flip: true },
];
const LANTERNS = [[4, 4], [8, 4], [4, 10], [8, 10]];

export function createKeeperRenderer(images) {
  let cache = null; // ground layer for the current tile size
  const animator = createAnimator();
  let rigImages = images, lanternGlow = '150, 230, 80';
  let effects = [];
  let lastTime = 0;
  const cam = { x: null, y: null };

  function patterns(g, t) {
    return {
      ground: tilePattern(g, images.texGround, t, 3),
      top: tilePattern(g, images.texWallTop, t, 2.2),
      front: (() => {
        const img = images.texWallFront;
        const p = g.createPattern(img, 'repeat-x');
        // Show the top ~40% of the brick strip (moss drips) on each face.
        const s = (WALL_H * t) / (img.height * 0.4);
        p.setTransform(new DOMMatrix().scale(s, s));
        return p;
      })(),
    };
  }

  function buildGround(run, t, dpr) {
    const { map } = run;
    const { cv, g } = offscreen(map.w * t, map.h * t, dpr);
    const pats = patterns(g, t);
    g.fillStyle = pats.ground;
    g.fillRect(0, 0, map.w * t, map.h * t);
    // Floor decals on open ground, placed by tile hash so they never change.
    for (let r = 0; r < map.h; r++) {
      for (let c = 0; c < map.w; c++) {
        const ch = map.rows[r][c];
        if (ch === 'S') {
          drawImg(g, images.openGrave, (c + 0.5) * t, (r + 0.85) * t, 1.25 * t);
          continue;
        }
        if (ch !== '.') continue;
        const n = hash(c, r, 4);
        const x = (c + 0.25 + hash(c, r, 5) * 0.5) * t, y = (r + 0.7 + hash(c, r, 6) * 0.25) * t;
        if (n < 0.06) drawImg(g, images.skull, x, y, 0.5 * t);
        else if (n < 0.11) drawImg(g, images.bones, x, y, 0.55 * t);
        else if (n < 0.17) drawImg(g, images.mushrooms, x, y, 0.5 * t);
      }
    }
    // Warm city light spilling through the gate.
    const gate = run.gate;
    const gx = (gate.c + 0.5) * t, gy = (gate.r + 1) * t;
    const grd = g.createRadialGradient(gx, gy, 2, gx, gy, t * 2.2);
    grd.addColorStop(0, 'rgba(255, 215, 137, .55)');
    grd.addColorStop(1, 'rgba(255, 215, 137, 0)');
    g.fillStyle = grd;
    g.fillRect(gx - t * 2.5, gy - t * 2.5, t * 5, t * 3);
    return { canvas: cv, pats, t, dpr };
  }

  function isWall(map, c, r) {
    return c >= 0 && r >= 0 && c < map.w && r < map.h && map.rows[r][c] === '#';
  }

  function drawWallTile(g, run, c, r, t, pats) {
    const { map } = run;
    const x = c * t, top = (r - WALL_H) * t;
    const below = isWall(map, c, r + 1);
    // Front face.
    if (!below) {
      g.fillStyle = pats.front;
      g.fillRect(x, (r + 1 - WALL_H) * t, t + 0.5, WALL_H * t);
      const sh = g.createLinearGradient(0, (r + 1 - WALL_H) * t, 0, (r + 1) * t);
      sh.addColorStop(0, 'rgba(10, 4, 20, 0)');
      sh.addColorStop(1, 'rgba(10, 4, 20, .45)');
      g.fillStyle = sh;
      g.fillRect(x, (r + 1 - WALL_H) * t, t + 0.5, WALL_H * t);
    }
    // Top face (continues into the next wall row when the tile below is also wall).
    g.fillStyle = pats.top;
    g.fillRect(x, top, t + 0.5, t + (below ? 0.5 : 0));
    // Knock the bright texture back a little, keeping wall tops lighter than the paths.
    g.fillStyle = 'rgba(28, 14, 46, .14)';
    g.fillRect(x, top, t + 0.5, t + (below ? 0.5 : 0));
    // A thin soft edge, so walls separate from the ground without a hard outline.
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, t * 0.03);
    g.lineCap = 'round';
    g.beginPath();
    const bottom = (r + 1) * t;
    if (!isWall(map, c, r - 1)) { g.moveTo(x, top); g.lineTo(x + t, top); }
    if (!below) {
      g.moveTo(x, bottom); g.lineTo(x + t, bottom);
      g.moveTo(x, (r + 1 - WALL_H) * t); g.lineTo(x + t, (r + 1 - WALL_H) * t);
    }
    const sideEnd = below ? (r + 1 - WALL_H) * t : bottom;
    if (!isWall(map, c - 1, r)) { g.moveTo(x, top); g.lineTo(x, sideEnd); }
    if (!isWall(map, c + 1, r)) { g.moveTo(x + t, top); g.lineTo(x + t, sideEnd); }
    g.stroke();
  }

  function graveFor(c, r) {
    const n = hash(c, r, 9);
    return n < 0.35 ? 'graveRip' : n < 0.6 ? 'graveArch' : n < 0.8 ? 'graveCross' : 'graveBroken';
  }

  // ---------------- Animation helpers ----------------

  // The hit lands the moment the button is pressed, so the swing can't have a slow wind-up:
  // a quick snap back, a fast strike, a hold, then a settle during the cooldown.
  function slashMotion(run) {
    const sl = run.slash;
    if (sl) {
      const k = sl.t / KEEPER.slashDuration;
      if (k < 0.12) { const q = k / 0.12; return { swing: lerp(0, 2.4, q), lean: -q, lunge: -8 * q, sink: 0 }; }
      if (k < 0.42) {
        const q = easeOut((k - 0.12) / 0.3);
        return { swing: lerp(2.4, -1.15, q), lean: lerp(-1, 1.2, q), lunge: lerp(-8, 26, q), sink: 10 * q };
      }
      return { swing: -1.15, lean: 1.2, lunge: 26, sink: 10 };
    }
    if (run.cooldown > 0) {
      const q = clamp(run.cooldown / (KEEPER.slashCooldown - KEEPER.slashDuration), 0, 1) ** 2;
      return { swing: -1.15 * q, lean: 1.2 * q, lunge: 26 * q, sink: 10 * q };
    }
    return { swing: 0, lean: 0, lunge: 0, sink: 0 };
  }

  // A soft spring: the value overshoots its target and settles, like cloth or a hanging lantern.
  function spring(s, key, target, dt, stiffness, damping) {
    const v = (s[key + 'V'] ?? 0) + ((target - (s[key] ?? 0)) * stiffness - (s[key + 'V'] ?? 0) * damping) * dt;
    s[key + 'V'] = v;
    s[key] = (s[key] ?? 0) + v * dt;
    return s[key];
  }

  function reaperPose(run, s, time, dt, reduced) {
    const { swing, lean, lunge, sink } = slashMotion(run);
    const w = Math.sin(s.phase) * s.walk;
    const h = Math.min(dt, 1 / 30);
    const side = s.view === 'side';
    // Moving, or lunging into a slash, pulls the hem and lantern back behind Pip.
    const drag = spring(s, 'drag', s.walk + (lunge > 0 ? 0.7 : 0), h, 60, 9);
    const lantern = spring(s, 'lantern', (side ? 0.3 * s.walk : 0) + Math.sin(s.phase * 2) * 0.16 * s.walk, h, 70, 7);
    return pose({
      t: reduced ? 0 : time,
      walk: reduced ? 0 : w,
      bob: reduced ? 0 : Math.abs(Math.sin(s.phase)) * 6 * s.walk + Math.sin(time * 2) * 1.5,
      flow: reduced ? 0 : s.walk,
      cycle: s.phase,
      drag: reduced ? 0 : drag,
      lantern: reduced ? 0 : lantern,
      swing, slashLean: lean, lunge, sink,
      hurt: run.invuln > KEEPER.invulnTime - 0.3 ? 1 : 0,
    });
  }

  // ---------------- Effects ----------------

  function event(ev) {
    if (ev.type === 'defeat') {
      effects.push({ kind: 'puff', x: ev.x, y: ev.y, t: 0, life: 0.55 });
      effects.push({ kind: 'text', x: ev.x, y: ev.y - 1.2, t: 0, life: 0.8, text: `+${KEEPER.score.defeat}`, color: '#ffd789' });
    } else if (ev.type === 'soul') {
      effects.push({ kind: 'sparkle', x: ev.x, y: ev.y - 0.4, t: 0, life: 0.5 });
      effects.push({ kind: 'text', x: ev.x, y: ev.y - 1.1, t: 0, life: 0.9, text: `+${KEEPER.score.soul}`, color: SOUL });
    }
  }

  function drawEffects(g, t, dt, reduced) {
    effects = effects.filter((f) => (f.t += dt) < f.life);
    for (const f of effects) {
      const k = f.t / f.life;
      if (f.kind === 'puff') {
        const w = (0.9 + (reduced ? 0.3 : k * 0.7)) * t;
        drawImg(g, images.smokePuff, f.x * t, (f.y + 0.4) * t - (reduced ? 0 : k * 0.4 * t), w, { alpha: 1 - k });
      } else if (f.kind === 'sparkle') {
        drawImg(g, images.sparkle, f.x * t, f.y * t, (0.5 + k * 0.4) * t, { alpha: 1 - k });
      } else if (f.kind === 'text') {
        drawFloatText(g, t, f, k, reduced);
      }
    }
  }

  function drawSlash(g, run, t) {
    const sl = run.slash;
    if (!sl) return;
    const p = run.player;
    const k = sl.t / KEEPER.slashDuration;
    if (k < 0.15) return; // wind-up
    const q = easeOut((k - 0.15) / 0.85);
    const half = KEEPER.slashHalfAngle;
    const a0 = sl.angle - half * 1.1, a1 = sl.angle + half * 1.1;
    const head = lerp(a0, a1, Math.min(1, q * 1.4));
    const tail = lerp(a0, a1, Math.max(0, q * 1.4 - 0.55));
    const R = KEEPER.slashRange * t * 0.85;
    const cx = p.x * t, cy = (p.y - 0.35) * t;
    const N = 18;
    g.save();
    g.globalAlpha = 1 - Math.max(0, (k - 0.75) / 0.25);
    g.lineCap = 'round';
    for (const [color, wMul] of [[SOUL, 1], ['#f4ffd9', 0.35]]) {
      for (let i = 0; i < N; i++) {
        const u0 = i / N, u1 = (i + 1) / N;
        const b0 = lerp(tail, head, u0), b1 = lerp(tail, head, u1);
        g.strokeStyle = color;
        g.lineWidth = Math.max(1, t * 0.34 * wMul * Math.sin(Math.PI * (u0 + u1) / 2) ** 0.8);
        g.beginPath();
        g.arc(cx, cy, R, b0, b1);
        g.stroke();
      }
    }
    g.restore();
  }

  function drawLights(g, run, t, time, reduced) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const light = (x, y, r, rgb, a) => pool(g, t, x, y, r, rgb, a);
    const flicker = reduced ? 0 : Math.sin(time * 7) * 0.03;
    for (const [c, r] of LANTERNS) light(c + 0.62, r - 0.55, 1.8, '150, 230, 80', 0.22 + flicker);
    for (const s of run.souls) light(s.x, s.y - 0.3, 1.1, '170, 240, 90', 0.3);
    if (run.seal) light(run.seal.x, run.seal.y, 1.6, '170, 240, 90', 0.35);
    for (const s of run.spawns) light(s.c + 0.5, s.r + 0.6, 1.0, '150, 90, 220', 0.25);
    light(run.player.x + (animator.get(run.player)?.lanternX ?? 0.35), run.player.y - 0.2, 1.4, lanternGlow, 0.16);
    g.restore();
  }

  // Walls and gravestones never change, so they are drawn once, back to front.
  function buildWalls(run, t, dpr) {
    const { map } = run;
    const { cv, g } = offscreen(map.w * t, map.h * t, dpr);
    const pats = patterns(g, t);
    for (let r = 0; r < map.h; r++) {
      for (let c = 0; c < map.w; c++) if (map.rows[r][c] === '#') drawWallTile(g, run, c, r, t, pats);
      for (let c = 0; c < map.w; c++) {
        if (map.rows[r][c] === 'T') drawImg(g, images[graveFor(c, r)], (c + 0.5) * t, (r + 0.98) * t, 1.05 * t);
      }
    }
    return cv;
  }

  // ---------------- Frame ----------------

  function draw(ctx, run, view) {
    const { cssW, cssH, time, reducedMotion: reduced } = view;
    const dpr = Math.min(view.dpr, 2); // cached layers don't need more than 2x
    const { map } = run;
    const dt = clamp(time - lastTime, 0, 0.1);
    lastTime = time;

    // Zoom so ~7.8 tiles fit across, like the reference; keep a sane size on wide screens.
    const t = clamp(cssW / 7.8, 36, 66);
    if (!cache || cache.t !== t || cache.dpr !== dpr || cache.run !== run) {
      cache = { ...buildGround(run, t, dpr), walls: buildWalls(run, t, dpr), run };
      cam.x = cam.y = null;
    }

    const { cx, cy, worldW, worldH } = followCamera(cam, run, t, view, dt, reduced);

    // Sky backdrop (only visible when the camera shows above the top wall).
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#1a0f2a';
    ctx.fillRect(0, 0, cssW, cssH);
    const bg = view.backdrop;
    if (bg && cy < t) {
      const bw = cssW * 1.3, bh = bw * (bg.height / bg.width);
      ctx.drawImage(bg, (cssW - bw) / 2 - cx * 0.1, -cy - t * 0.5 - bh * 0.55, bw, bh);
    }

    ctx.save();
    ctx.translate(-cx, -cy);
    blitVisible(ctx, cache.canvas, worldW, worldH, cx, cy, cssW, cssH);
    blitVisible(ctx, cache.walls, worldW, worldH, cx, cy, cssW, cssH);

    // Seal sigil on the ground.
    if (run.seal) {
      const pulse = reduced ? 1 : 1 + Math.sin(time * 4) * 0.06;
      ctx.save();
      ctx.translate(run.seal.x * t, run.seal.y * t);
      if (!reduced) ctx.rotate(time * 0.6);
      ctx.scale(1, 0.62); // lie flat on the ground
      const w = 1.25 * t * pulse;
      ctx.drawImage(images.sealSigil, -w / 2, -w / 2, w, w);
      ctx.restore();
    }

    // Everything that stands up, sorted back to front. Each item gives its row and a
    // box (in tiles) so walls in later rows can be repainted over it.
    const isOccluder = (c, r) => map.rows[r][c] === '#' || map.rows[r][c] === 'T';
    const items = [];
    for (const e of run.enemies) items.push({ y: e.y, box: [e.x - 0.9, e.y - 1.6, e.x + 0.9, e.y + 0.5], draw: () => drawUndead(ctx, e, t, time, dt, reduced) });
    for (const s of run.souls) items.push({ y: s.y, box: [s.x - 0.5, s.y - 0.9, s.x + 0.5, s.y + 0.5], draw: () => drawSoul(ctx, s, t, time, reduced) });
    const p = run.player;
    items.push({ y: p.y, box: [p.x - 1.3, p.y - 2.0, p.x + 1.3, p.y + 0.6], draw: () => drawReaper(ctx, run, t, time, dt, reduced) });
    for (const [lc, lr] of LANTERNS) {
      items.push({ y: lr + 0.2, box: [lc - 0.1, lr - 1.2, lc + 1.2, lr + 0.3], draw: () => drawImg(ctx, images.lanternPost, (lc + 0.55) * t, (lr + 0.75 - WALL_H) * t, 0.95 * t) });
    }
    for (const sc of SCENERY) {
      const img = images[sc.img], h = sc.w * (img.height / img.width);
      items.push({ y: sc.row + 0.5, box: [sc.x - sc.w / 2, sc.y - h, sc.x + sc.w / 2, sc.y], draw: () => drawImg(ctx, img, sc.x * t, sc.y * t, sc.w * t, { flip: sc.flip }) });
    }
    const g0 = run.gate;
    items.push({ y: g0.r + 0.5, box: [g0.c - 1.1, g0.r - 1.8, g0.c + 2.1, g0.r + 1.1], draw: () => drawImg(ctx, images.ironGate, (g0.c + 0.5) * t, (g0.r + 1.02) * t, 3.1 * t) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const x0 = it.box[0] * t, y0 = it.box[1] * t, x1 = it.box[2] * t, y1 = it.box[3] * t;
      if (x1 < cx || x0 > cx + cssW || y1 < cy || y0 > cy + cssH) continue;
      it.draw();
      occlude(ctx, cache.walls, map, isOccluder, Math.floor(it.y), x0, y0, x1, y1, t, 0.6);
    }

    drawSlash(ctx, run, t);
    if (run.pulse) {
      // Expanding ring, or a steady fading one when motion is reduced.
      const k = run.pulse.t / 0.45, R = SKILLS.keeper.radius * t * (reduced ? 1 : easeOut(k));
      ctx.save();
      ctx.translate(run.player.x * t, run.player.y * t);
      ctx.globalAlpha = 1 - k * k;
      ctx.lineWidth = t * 0.22;
      ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = t * 0.12;
      ctx.strokeStyle = SOUL;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    drawEffects(ctx, t, dt, reduced);
    drawLights(ctx, run, t, time, reduced);
    ctx.restore();

    return { tile: t, cx, cy };
  }

  function drawReaper(g, run, t, time, dt, reduced) {
    const p = run.player;
    const s = animator.step(p, dt, 13);
    s.view = facingView(p.fx, p.fy, s.view);
    if (p.fx > 0.2) s.flip = false;
    else if (p.fx < -0.2) s.flip = true;
    // The lantern hand depends on the view: ahead of Pip from the side, and opposite sides front and back.
    s.lanternX = s.view === 'side' ? (s.flip ? -0.45 : 0.45) : s.view === 'back' ? -0.35 : 0.35;
    shadow(g, p.x * t, (p.y + 0.32) * t, t * 0.42);
    let alpha = 1;
    if (run.invuln > 0 && !reduced) alpha = Math.floor(time * 12) % 2 ? 0.45 : 1;
    const rig = s.view === 'side' ? RIGS.reaperSide : s.view === 'back' ? RIGS.reaperBack : RIGS.reaper;
    drawRig(g, rigImages, rig, reaperPose(run, s, time, dt, reduced), p.x * t, (p.y + 0.36) * t, 1.85 * t, { flip: s.view === 'side' && s.flip, alpha });
    if (run.invuln > 0 && reduced) {
      g.strokeStyle = '#ff8a8a';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(p.x * t, (p.y + 0.3) * t, t * 0.55, t * 0.22, 0, 0, Math.PI * 2); g.stroke();
    }
    // Facing marker on the ground so aim is readable even facing up/down.
    g.save();
    g.translate((p.x + p.fx * 0.55) * t, (p.y + 0.3 + p.fy * 0.4) * t);
    g.rotate(Math.atan2(p.fy, p.fx));
    g.beginPath();
    g.moveTo(t * 0.16, 0); g.lineTo(-t * 0.08, -t * 0.11); g.lineTo(-t * 0.08, t * 0.11); g.closePath();
    g.fillStyle = SOUL; g.strokeStyle = INK; g.lineWidth = 2;
    g.fill(); g.stroke();
    g.restore();
  }

  function drawUndead(g, e, t, time, dt, reduced) {
    const kind = e.id % 3 === 0 ? 'zgirl' : 'zombie';
    const s = animator.step(e, dt, 0, GAITS[kind].perTile);
    s.view = facingView(e.fx, e.fy, s.view);
    if (e.fx < -0.2) s.flip = true;
    else if (e.fx > 0.2) s.flip = false;
    const rig = undeadRig(kind, s.view);
    const flip = s.view === 'side' && s.flip;
    const h = 1.62 * t;
    const x = e.x * t, foot = (e.y + 0.38) * t;
    const p = undeadPose(time, e.id, s, reduced);
    if (e.state === 'rising') {
      // Climb out of the open grave: clip at ground level and slide up.
      const k = 1 - e.rise / KEEPER.spawnWarning;
      g.save();
      g.beginPath();
      g.rect(x - t, foot - h * 1.2, t * 2, h * 1.2 - t * 0.12);
      g.clip();
      drawRig(g, images, rig, p, x, foot + h * (1 - easeOut(k)) * 0.9, h, { flip });
      g.restore();
      if (!reduced || Math.floor(time * 4) % 2) {
        g.strokeStyle = '#ff8a8a';
        g.setLineDash([5, 4]);
        g.lineWidth = 3;
        g.beginPath(); g.ellipse(x, foot - t * 0.05, t * 0.5, t * 0.2, 0, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
      }
      return;
    }
    shadow(g, x, foot - t * 0.04, t * 0.38);
    drawRig(g, images, rig, p, x, foot, h, { flip });
  }

  function drawSoul(g, s, t, time, reduced) {
    const bob = reduced ? 0 : Math.sin(time * 3 + s.id) * 0.08;
    shadow(g, s.x * t, (s.y + 0.3) * t, t * 0.22);
    drawImg(g, images.soulFlame, s.x * t, (s.y + 0.15 + bob) * t, 0.62 * t);
  }

  return {
    draw, event,
    reset() { effects = []; cache = null; },
    setSkin(overrides, glowRgb) { rigImages = { ...images, ...overrides }; lanternGlow = glowRgb || '150, 230, 80'; },
  };
}
