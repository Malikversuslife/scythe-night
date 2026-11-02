// Shared tile-world helpers. World units are tiles; (x, y) is a position in tiles,
// tile (c, r) covers [c, c+1) x [r, r+1).

export function parseMap(rows, solidChars) {
  const h = rows.length;
  const w = rows[0].length;
  const solid = new Uint8Array(w * h);
  const marks = {};
  for (let r = 0; r < h; r++) {
    if (rows[r].length !== w) throw new Error(`Map row ${r} has width ${rows[r].length}, expected ${w}`);
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (solidChars.includes(ch)) solid[r * w + c] = 1;
      (marks[ch] ||= []).push({ c, r });
    }
  }
  return { w, h, rows, solid, marks };
}

export function isSolid(map, c, r) {
  if (c < 0 || r < 0 || c >= map.w || r >= map.h) return true;
  return map.solid[r * map.w + c] === 1;
}

// Move a circle by (dx, dy), resolving against solid tiles one axis at a time.
export function moveCircle(map, ent, dx, dy, solidFn = isSolid) {
  const rad = ent.r;
  // Sub-step so fast movement can't tunnel through a tile.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    ent.x += sx;
    ent.y += sy;
    for (let k = 0; k < 3; k++) if (!resolve(map, ent, rad, solidFn)) break;
  }
}

// Push the circle out of any overlapping solid tile. Returns true if it moved.
function resolve(map, ent, rad, solidFn) {
  let moved = false;
  const c0 = Math.floor(ent.x - rad), c1 = Math.floor(ent.x + rad);
  const r0 = Math.floor(ent.y - rad), r1 = Math.floor(ent.y + rad);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!solidFn(map, c, r)) continue;
      // Closest point on the tile to the circle centre.
      const px = Math.max(c, Math.min(ent.x, c + 1));
      const py = Math.max(r, Math.min(ent.y, r + 1));
      const ox = ent.x - px, oy = ent.y - py;
      const d2 = ox * ox + oy * oy;
      if (d2 >= rad * rad) continue;
      moved = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        ent.x += (ox / d) * (rad - d);
        ent.y += (oy / d) * (rad - d);
      } else {
        // Centre is inside the tile: leave by the shallowest side.
        const left = ent.x - c, right = c + 1 - ent.x, top = ent.y - r, bottom = r + 1 - ent.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) ent.x = c - rad;
        else if (m === right) ent.x = c + 1 + rad;
        else if (m === top) ent.y = r - rad;
        else ent.y = r + 1 + rad;
      }
    }
  }
  return moved;
}

// True when the straight segment between two points crosses no solid tile (grid DDA).
export function lineOfSight(map, x0, y0, x1, y1, solidFn = isSolid) {
  let c = Math.floor(x0), r = Math.floor(y0);
  const cEnd = Math.floor(x1), rEnd = Math.floor(y1);
  const dx = x1 - x0, dy = y1 - y0;
  const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
  const tDeltaC = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaR = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxC = dx !== 0 ? (dx > 0 ? c + 1 - x0 : x0 - c) * tDeltaC : Infinity;
  let tMaxR = dy !== 0 ? (dy > 0 ? r + 1 - y0 : y0 - r) * tDeltaR : Infinity;
  for (let guard = 0; guard < 256; guard++) {
    if (solidFn(map, c, r)) return false;
    if (c === cEnd && r === rEnd) return true;
    if (tMaxC < tMaxR) { if (tMaxC > 1) return true; tMaxC += tDeltaC; c += stepC; }
    else { if (tMaxR > 1) return true; tMaxR += tDeltaR; r += stepR; }
  }
  return true;
}

// Breadth-first distance field from a set of goal tiles over walkable tiles.
export function distanceField(map, goals, solidFn = isSolid) {
  const dist = new Int32Array(map.w * map.h).fill(-1);
  const q = [];
  for (const g of goals) {
    if (solidFn(map, g.c, g.r) && !g.force) continue;
    dist[g.r * map.w + g.c] = 0;
    q.push(g.c, g.r);
  }
  for (let i = 0; i < q.length; i += 2) {
    const c = q[i], r = q[i + 1];
    const d = dist[r * map.w + c];
    for (const [ox, oy] of DIRS) {
      const nc = c + ox, nr = r + oy;
      if (solidFn(map, nc, nr)) continue;
      const k = nr * map.w + nc;
      if (dist[k] !== -1) continue;
      dist[k] = d + 1;
      q.push(nc, nr);
    }
  }
  return dist;
}

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Next tile centre to walk toward to descend a distance field from tile (c, r).
export function nextStep(map, field, c, r) {
  const here = field[r * map.w + c];
  let best = null, bestD = here < 0 ? Infinity : here;
  for (const [ox, oy] of DIRS) {
    const nc = c + ox, nr = r + oy;
    if (nc < 0 || nr < 0 || nc >= map.w || nr >= map.h) continue;
    const d = field[nr * map.w + nc];
    if (d >= 0 && d < bestD) { bestD = d; best = { c: nc, r: nr }; }
  }
  return best;
}

export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const tileOf = (e) => ({ c: Math.floor(e.x), r: Math.floor(e.y) });
export const center = (t) => ({ x: t.c + 0.5, y: t.r + 0.5 });
