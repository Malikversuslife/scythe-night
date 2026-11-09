// The city for Last Survivor, built from its map: streets with sidewalks, crosswalks and lane
// markings, and every lot raised into a building with a front, a roof and rooftop clutter.
// Buildings are cached one canvas each and drawn in depth order with the characters.
import { hash, tilePattern, offscreen, drawImg } from './render-common.js';

const isBuildingTile = (ch) => ch === '#' || ch === 'R';

// Split the map's buildings into rectangles: greedy, widest first, then as deep as it stays solid.
export function findBuildings(map) {
  const used = new Uint8Array(map.w * map.h);
  // The map's outer ring is the city limit, drawn flat by the ground, not raised as buildings.
  const solid = (c, r) => c >= 1 && r >= 1 && c < map.w - 1 && r < map.h - 1 && isBuildingTile(map.rows[r][c]) && !used[r * map.w + c];
  const rects = [];
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      if (!solid(c, r)) continue;
      let c1 = c;
      while (solid(c1 + 1, r)) c1++;
      let r1 = r;
      const rowFree = (rr) => { for (let x = c; x <= c1; x++) if (!solid(x, rr)) return false; return true; };
      while (rowFree(r1 + 1)) r1++;
      for (let y = r; y <= r1; y++) for (let x = c; x <= c1; x++) used[y * map.w + x] = 1;
      rects.push({ c0: c, r0: r, c1, r1, w: c1 - c + 1, h: r1 - r + 1 });
    }
  }
  return rects;
}

// Avenues are whole rows or columns with no building between the city edges.
export function findAvenues(map) {
  const rows = [], cols = [];
  for (let r = 1; r < map.h - 1; r++) {
    let open = true;
    for (let c = 1; c < map.w - 1; c++) if (isBuildingTile(map.rows[r][c])) { open = false; break; }
    if (open) rows.push(r);
  }
  for (let c = 1; c < map.w - 1; c++) {
    let open = true;
    for (let r = 1; r < map.h - 1; r++) if (isBuildingTile(map.rows[r][c])) { open = false; break; }
    if (open) cols.push(c);
  }
  // Group neighbouring lines into bands, so a two-lane avenue is one band.
  const bands = (list) => list.reduce((out, v) => {
    const last = out[out.length - 1];
    if (last && v === last[1] + 1) last[1] = v; else out.push([v, v]);
    return out;
  }, []);
  return { rows: bands(rows), cols: bands(cols) };
}

const inBand = (bands, v) => bands.some(([a, b]) => v >= a && v <= b);

// Lane paint worn away on about a third of the tiles.
const worn = (c, r) => hash(c, r, 47) < 0.35;

// Ground debris: where each kind may lie (the road, the sidewalks), its size in tiles, how
// strongly it shows, and whether it lies at any angle.
const DECALS = [
  { img: 'decalManhole', road: true, walk: false, size: 0.7, alpha: 0.9, turn: true },
  { img: 'decalPuddle', road: true, walk: true, size: 1.1, alpha: 0.75, turn: true },
  { img: 'decalPapers', road: true, walk: true, size: 0.8, alpha: 0.8, turn: true },
  { img: 'decalBlood', road: true, walk: true, size: 0.9, alpha: 0.6, turn: true },
  { img: 'decalRubble', road: false, walk: true, size: 0.7, alpha: 0.95, turn: true },
  { img: 'decalLeaves', road: true, walk: true, size: 0.8, alpha: 0.85, turn: true },
  { img: 'decalGlass', road: true, walk: true, size: 0.6, alpha: 0.8, turn: true },
  { img: 'decalOil', road: true, walk: false, size: 1.0, alpha: 0.7, turn: true },
];

// Streets, sidewalks, the plaza and the park, drawn once.
export function buildCityGround(map, images, t, dpr, zones) {
  const { cv, g } = offscreen(map.w * t, map.h * t, dpr);
  const av = findAvenues(map);
  g.fillStyle = tilePattern(g, images.texAsphalt, t, 2.4);
  g.fillRect(0, 0, map.w * t, map.h * t);

  // Anything open that isn't an avenue is paved for walking: alleys and the plaza.
  const paving = tilePattern(g, images.texSidewalk, t, 1.6);
  g.fillStyle = paving;
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      if (isBuildingTile(map.rows[r][c])) continue;
      if (!inBand(av.rows, r) && !inBand(av.cols, c)) g.fillRect(c * t, r * t, t + 0.5, t + 0.5);
    }
  }
  for (const { c0, r0, c1, r1 } of zones.parks || []) {
    g.fillStyle = tilePattern(g, images.texGrass, t, 1.8);
    g.fillRect((c0 + 0.12) * t, (r0 + 0.12) * t, (c1 - c0 + 0.76) * t, (r1 - r0 + 0.76) * t);
    g.strokeStyle = 'rgba(150, 140, 160, .7)';
    g.lineWidth = Math.max(1.5, t * 0.05);
    g.strokeRect((c0 + 0.12) * t, (r0 + 0.12) * t, (c1 - c0 + 0.76) * t, (r1 - r0 + 0.76) * t);
  }

  // Lane markings: a dashed centre line down each two-lane avenue, broken at junctions.
  // Paint that nobody has renewed: faded, and worn away in places (see `worn`).
  g.strokeStyle = 'rgba(214, 196, 132, .32)';
  g.lineWidth = Math.max(1.5, t * 0.045);
  g.setLineDash([t * 0.42, t * 0.34]);
  for (const [a, b] of av.rows) {
    if (b === a) continue;
    const y = (b) * t;
    g.beginPath();
    let run = null;
    for (let c = 1; c < map.w - 1; c++) {
      const crossing = inBand(av.cols, c);
      if (!crossing && run === null) run = c;
      if ((crossing || c === map.w - 2) && run !== null) {
        const end = crossing ? c : c + 1;
        for (let x = run; x < end; x++) if (!worn(x, b)) { g.moveTo((x + (x === run ? 0.15 : 0)) * t, y); g.lineTo((x + 1 - (x === end - 1 ? 0.15 : 0)) * t, y); }
        run = null;
      }
    }
    g.stroke();
  }
  for (const [a, b] of av.cols) {
    if (b === a) continue;
    const x = (b) * t;
    g.beginPath();
    let run = null;
    for (let r = 1; r < map.h - 1; r++) {
      const crossing = inBand(av.rows, r);
      if (!crossing && run === null) run = r;
      if ((crossing || r === map.h - 2) && run !== null) {
        const end = crossing ? r : r + 1;
        for (let y = run; y < end; y++) if (!worn(b, y)) { g.moveTo(x, (y + (y === run ? 0.15 : 0)) * t); g.lineTo(x, (y + 1 - (y === end - 1 ? 0.15 : 0)) * t); }
        run = null;
      }
    }
    g.stroke();
  }
  g.setLineDash([]);

  // Crosswalks on each side of every junction, chipped and faded; a few stripes are gone.
  const zebra = (x, y, w, h, vertical) => {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const k = hash(Math.round(x + i * 7), Math.round(y), 41);
      if (k < 0.18) continue;
      g.fillStyle = `rgba(214, 210, 220, ${(0.18 + k * 0.22).toFixed(2)})`;
      if (vertical) g.fillRect(x + (w / n) * i + w / n * 0.2, y, w / n * 0.6, h * (0.7 + k * 0.3));
      else g.fillRect(x, y + (h / n) * i + h / n * 0.2, w * (0.7 + k * 0.3), h / n * 0.6);
    }
  };
  for (const [ra, rb] of av.rows) {
    for (const [ca, cb] of av.cols) {
      const bandW = (cb - ca + 1) * t, bandH = (rb - ra + 1) * t;
      // Left and right of the junction: stripes across the horizontal avenue.
      if (ca - 1 >= 1) zebra((ca - 0.55) * t, ra * t + t * 0.12, t * 0.45, bandH - t * 0.24, true);
      if (cb + 1 <= map.w - 2) zebra((cb + 1.1) * t, ra * t + t * 0.12, t * 0.45, bandH - t * 0.24, true);
      // Above and below: stripes across the vertical avenue.
      if (ra - 1 >= 1) zebra(ca * t + t * 0.12, (ra - 0.55) * t, bandW - t * 0.24, t * 0.45, false);
      if (rb + 1 <= map.h - 2) zebra(ca * t + t * 0.12, (rb + 1.1) * t, bandW - t * 0.24, t * 0.45, false);
    }
  }

  // The city limit: a dark hedge with a kerb on the street side.
  const hedge = tilePattern(g, images.texGrass, t, 1.2);
  const W = map.w * t, H = map.h * t;
  const ring = (fill) => { g.fillStyle = fill; g.fillRect(0, 0, W, t); g.fillRect(0, H - t, W, t); g.fillRect(0, 0, t, H); g.fillRect(W - t, 0, t, H); };
  ring(hedge);
  ring('rgba(8, 10, 22, .55)');
  g.strokeStyle = 'rgba(118, 112, 124, .7)';
  g.lineWidth = Math.max(1.5, t * 0.05);
  g.strokeRect(t, t, W - 2 * t, H - 2 * t);

  // Sidewalks with a kerb around every building.
  const walk = 0.3;
  for (const b of findBuildings(map)) {
    const x0 = (b.c0 - walk) * t, y0 = (b.r0 - walk) * t, w = (b.w + walk * 2) * t, h = (b.h + walk * 2) * t;
    g.fillStyle = paving;
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = 'rgba(118, 112, 124, .7)';
    g.lineWidth = Math.max(1.5, t * 0.05);
    g.strokeRect(x0, y0, w, h);
    g.strokeStyle = 'rgba(6, 4, 12, .6)';
    g.lineWidth = Math.max(1, t * 0.03);
    g.strokeRect(x0 - t * 0.03, y0 - t * 0.03, w + t * 0.06, h + t * 0.06);
    // Grime gathers in the gutter along the kerb.
    g.strokeStyle = 'rgba(4, 3, 10, .28)';
    g.lineWidth = t * 0.22;
    g.strokeRect(x0 - t * 0.14, y0 - t * 0.14, w + t * 0.28, h + t * 0.28);
  }

  // Debris left where it fell: litter, rubble, glass, leaves, puddles and stains, and the odd
  // manhole in the road. Placed by each tile's own seed, so it never moves.
  for (let r = 1; r < map.h - 1; r++) {
    for (let c = 1; c < map.w - 1; c++) {
      if (isBuildingTile(map.rows[r][c])) continue;
      const n = hash(c, r, 51);
      if (n > 0.2) continue;
      const road = inBand(av.rows, r) || inBand(av.cols, c);
      const pick = DECALS.filter((d) => (road ? d.road : d.walk));
      const d = pick[Math.floor(hash(c, r, 52) * pick.length)];
      const img = images[d.img];
      if (!img) continue;
      const size = d.size * (0.75 + hash(c, r, 53) * 0.5) * t;
      g.save();
      g.globalAlpha = d.alpha;
      g.translate((c + 0.2 + hash(c, r, 54) * 0.6) * t, (r + 0.2 + hash(c, r, 55) * 0.6) * t);
      g.rotate(d.turn ? hash(c, r, 56) * Math.PI * 2 : 0);
      g.drawImage(img, -size / 2, -size / 2 * (img.height / img.width), size, size * (img.height / img.width));
      g.restore();
    }
  }
  // A cold wash over everything ties the ground to the night.
  g.fillStyle = 'rgba(14, 18, 40, .22)';
  g.fillRect(0, 0, W, H);
  return cv;
}

const ROOF_PROPS = [
  { img: 'roofAc', w: 0.55 }, { img: 'roofVents', w: 0.36 }, { img: 'roofSkylight', w: 0.62 },
  { img: 'roofHut', w: 0.72 }, { img: 'roofChimney', w: 0.34 }, { img: 'roofDish', w: 0.42 },
];
const FACADES = ['texFacade', 'texFacadeStone', 'texFacadeBrick'];
// One storey, in tiles. Characters are about 1.75 tiles tall.
const STOREY = 2.2;

// One building: roof on top, front below, sized to its lot. `landmark` swaps in a hand-drawn building.
export function buildBuilding(b, images, t, dpr, landmark, maxTall = Infinity) {
  const seed = b.c0 * 31 + b.r0 * 7;
  // Storeys are taller than a person, so doors and windows sit right next to the characters.
  // Small lots get two storeys, larger ones two or three.
  const storeys = b.h <= 1 || b.w <= 2 ? 2 : hash(b.c0, b.r0, 3) < 0.55 ? 3 : 2;
  // A landmark's picture holds its roof and front together; its height follows the picture.
  const art = landmark && images[landmark];
  // A painting stands as tall as its picture, but no taller than the lot allows: a little
  // too tall is pressed down to fit, which a painted front takes without looking stretched.
  const natural = art ? (art.height / art.width) * b.w : 0;
  const drawn = art ? Math.min(natural, maxTall) : 0;
  const tall = art ? Math.max(3, drawn - b.h) : storeys * STOREY; // tiles of wall
  const top = 0.9;                                                              // room for rooftop props
  const W = b.w * t, H = (b.h + tall + top) * t;
  const { cv, g } = offscreen(W, H, dpr);
  if (landmark) {
    const img = images[landmark];
    const h = drawn * t;
    g.drawImage(img, 0, H - h, W, h);
    return { canvas: cv, tall, top, b };
  }
  const roofY = top * t, roofH = b.h * t, faceY = roofY + roofH, faceH = tall * t;
  // Front: the facade art is three storeys tall. It's scaled so one storey is STOREY tiles and
  // anchored at the street, so a two-storey building shows the bottom two.
  const img = images[FACADES[Math.floor(hash(b.c0, b.r0, 5) * FACADES.length)]];
  const pat = g.createPattern(img, 'repeat-x');
  const s = (3 * STOREY * t) / img.height;
  pat.setTransform(new DOMMatrix().translate(hash(b.c0, b.r0, 6) * img.width * s, faceY + faceH - img.height * s).scale(s, s));
  g.fillStyle = pat;
  g.fillRect(0, faceY, W, faceH);
  const shade = g.createLinearGradient(0, faceY, 0, faceY + faceH);
  shade.addColorStop(0, 'rgba(10, 4, 22, .35)');
  shade.addColorStop(0.25, 'rgba(10, 4, 22, .05)');
  shade.addColorStop(1, 'rgba(10, 4, 22, .25)');
  g.fillStyle = shade;
  g.fillRect(0, faceY, W, faceH);
  // Corners read as depth: the wall darkens toward each end.
  for (const [x, dir] of [[0, 1], [W, -1]]) {
    const c = g.createLinearGradient(x, 0, x + dir * t * 0.35, 0);
    c.addColorStop(0, 'rgba(8, 4, 18, .55)');
    c.addColorStop(1, 'rgba(8, 4, 18, 0)');
    g.fillStyle = c;
    g.fillRect(dir > 0 ? x : x - t * 0.35, faceY, t * 0.35, faceH);
  }
  // Roof: gravel inside a stone parapet, with a soft inner shadow.
  g.fillStyle = tilePattern(g, images.texRoofFlat, t, 1.4);
  g.fillRect(0, roofY, W, roofH);
  g.fillStyle = 'rgba(20, 14, 34, .28)';
  g.fillRect(0, roofY, W, roofH);
  const lip = Math.max(2, t * 0.09);
  g.fillStyle = '#8f8698';
  g.fillRect(0, roofY, W, lip); g.fillRect(0, roofY + roofH - lip, W, lip);
  g.fillRect(0, roofY, lip, roofH); g.fillRect(W - lip, roofY, lip, roofH);
  g.fillStyle = 'rgba(255, 255, 255, .18)';
  g.fillRect(0, roofY, W, lip * 0.4);
  const inner = g.createLinearGradient(0, roofY + lip, 0, roofY + lip + t * 0.25);
  inner.addColorStop(0, 'rgba(8, 4, 18, .45)');
  inner.addColorStop(1, 'rgba(8, 4, 18, 0)');
  g.fillStyle = inner;
  g.fillRect(lip, roofY + lip, W - lip * 2, t * 0.25);
  // Rooftop clutter, placed by the lot's own seed so it never changes.
  const props = [];
  if (b.w >= 3 && b.h >= 2 && hash(seed, 1, 9) < 0.7) props.push({ img: 'roofWaterTower', w: 0.95 });
  const n = Math.max(1, Math.round(b.w * b.h / 5));
  for (let i = 0; i < n; i++) props.push(ROOF_PROPS[Math.floor(hash(seed, i, 11) * ROOF_PROPS.length)]);
  props.forEach((p, i) => {
    const pimg = images[p.img];
    const px = (0.55 + hash(seed, i, 13) * Math.max(0, b.w - 1.1)) * t;
    const py = roofY + (0.75 + hash(seed, i, 17) * Math.max(0, b.h - 1.0)) * t;
    drawImg(g, pimg, px, Math.min(py, roofY + roofH - lip), p.w * t);
  });
  // A stone cornice caps the front, then casts a little shadow down it.
  g.fillStyle = '#6f6878';
  g.fillRect(0, faceY - t * 0.04, W, Math.max(3, t * 0.12));
  g.fillStyle = 'rgba(255, 255, 255, .12)';
  g.fillRect(0, faceY - t * 0.04, W, Math.max(1, t * 0.03));
  // The cornice casts a little shadow down the front.
  g.fillStyle = 'rgba(8, 4, 18, .35)';
  g.fillRect(0, faceY, W, Math.max(2, t * 0.06));
  return { canvas: cv, tall, top, b };
}

// Where a building's canvas sits in the world, in canvas pixels.
export function buildingBox(bld, t) {
  const { b, tall, top } = bld;
  return { x: b.c0 * t, y: (b.r0 - tall - top) * t, w: b.w * t, h: (b.h + tall + top) * t };
}
