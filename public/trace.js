// Bitmap → vector contours (the idea behind Potrace). Pure functions, no DOM, shared with the tests.
//
//   1. inkMask:        pixels → 1 (ink) / 0 (background), by brightness threshold, optionally limited to a painted region
//   2. boundaryLoops:  follow the edges between ink and background pixels into closed loops (outlines and holes)
//   3. findCorners:    sharp turns along each loop
//   4. fitLoop:        smooth the staircase between corners and fit cubic Béziers (Schneider's algorithm);
//                      nearly straight pieces become lines
//
// Output contours use the app's node model, in pixel coordinates of the bitmap.

// ---- 1. mask -------------------------------------------------------------------------------
// rgba: Uint8ClampedArray (w*h*4). Transparent pixels count as background.
// light = true traces light shapes instead of dark ones. region (optional): Uint8Array w*h, 0 = ignore.
export function inkMask(rgba, w, h, { threshold = 128, light = false, region = null } = {}) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (region && !region[i]) continue;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    if (a < 128) continue;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    m[i] = light ? (lum >= threshold ? 1 : 0) : (lum < threshold ? 1 : 0);
  }
  return m;
}

// ---- 2. boundary loops ---------------------------------------------------------------------
// Every ink pixel side that faces background becomes a unit edge on the pixel-corner grid, walked clockwise
// around the ink (ink on the right). Linking edges end-to-start gives closed loops: outlines run one way,
// holes the other, so even-odd filling reproduces the image. Where two ink pixels touch only at a corner
// we turn right, which keeps them as separate shapes.
export function boundaryLoops(mask, w, h) {
  const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const W = w + 1, out = new Map();
  const add = (x0, y0, x1, y1) => { const k = y0 * W + x0; let l = out.get(k); if (!l) out.set(k, l = []); l.push(y1 * W + x1); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!ink(x, y)) continue;
    if (!ink(x, y - 1)) add(x, y, x + 1, y);
    if (!ink(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!ink(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!ink(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [start, list] of out) {
    while (list.length) {
      const pts = [];
      let v = start, next = list.pop(), dx = 0, dy = 0;
      for (let guard = 0; guard < 4 * (w + 1) * (h + 1); guard++) {
        pts.push({ x: v % W, y: Math.floor(v / W) });
        dx = (next % W) - (v % W); dy = Math.floor(next / W) - Math.floor(v / W);
        v = next;
        if (v === start) break;
        const cand = out.get(v);
        if (!cand || !cand.length) break;
        let pick = 0;
        if (cand.length > 1) {
          // Prefer the right turn (cross product > 0 in y-down coordinates).
          pick = cand.findIndex(c => dx * (Math.floor(c / W) - Math.floor(v / W)) - dy * ((c % W) - (v % W)) > 0);
          if (pick < 0) pick = 0;
        }
        next = cand.splice(pick, 1)[0];
      }
      if (pts.length >= 4) loops.push(pts);
    }
  }
  return loops;
}

export const loopArea = pts => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
};

// ---- 3. corners ----------------------------------------------------------------------------
// Turning angle over a window of k steps; a corner is a local maximum above the threshold.
export function findCorners(pts, cornerDeg = 60, k = 4) {
  const n = pts.length, lim = cornerDeg * Math.PI / 180, turn = new Float64Array(n);
  k = Math.max(2, Math.min(k, Math.floor(n / 4)));
  for (let i = 0; i < n; i++) {
    const a = pts[(i - k + n) % n], p = pts[i], b = pts[(i + k) % n];
    const ax = p.x - a.x, ay = p.y - a.y, bx = b.x - p.x, by = b.y - p.y;
    turn[i] = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  const corners = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < lim) continue;
    let isMax = true;
    for (let j = -k; j <= k && isMax; j++) {
      if (!j) continue;
      const t = turn[(i + j + n) % n];
      if (t > turn[i] || (t === turn[i] && j < 0)) isMax = false;
    }
    if (isMax) corners.push(i);
  }
  return corners;
}

// ---- 4. smoothing and curve fitting --------------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = a => Math.hypot(a.x, a.y);
const unit = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const bez = (Q, t) => { const u = 1 - t; return add(add(mul(Q[0], u * u * u), mul(Q[1], 3 * u * u * t)), add(mul(Q[2], 3 * u * t * t), mul(Q[3], t * t * t))); };

// Moving-average smoothing that keeps both ends fixed (they are corners or split points).
function smoothSpan(span, passes) {
  let s = span.map(p => ({ ...p }));
  for (let it = 0; it < passes; it++) {
    const t = s.map(p => ({ ...p }));
    for (let i = 1; i < s.length - 1; i++) t[i] = { x: (s[i - 1].x + 2 * s[i].x + s[i + 1].x) / 4, y: (s[i - 1].y + 2 * s[i].y + s[i + 1].y) / 4 };
    s = t;
  }
  return s;
}

// Schneider, "An Algorithm for Automatically Fitting Digitized Curves" (Graphics Gems, 1990).
function fitCubic(d, first, last, t1, t2, err2, out, depth = 0) {
  const n = last - first + 1;
  // A run whose points all sit within the tolerance of its chord is a straight line.
  const ch = sub(d[last], d[first]), L = len(ch);
  if (L > 1e-6) {
    let worst = 0;
    // Skip the points right next to each end: at a sharp corner the pixel tip bulges a little.
    const skip = n > 12 ? 2 : 0;
    for (let i = first + 1 + skip; i < last - skip; i++) { const v = sub(d[i], d[first]); worst = Math.max(worst, Math.abs(v.x * ch.y - v.y * ch.x) / L); }
    // Allow half a pixel more than the fit tolerance: the staircase itself.
    if (worst <= Math.sqrt(err2) + 0.5) { const Q = [d[first], add(d[first], mul(ch, 1 / 3)), add(d[first], mul(ch, 2 / 3)), d[last]]; Q.line = true; out.push(Q); return; }
  }
  if (n === 2 || depth > 12) {
    const dist = len(sub(d[last], d[first])) / 3;
    out.push([d[first], add(d[first], mul(t1, dist)), add(d[last], mul(t2, dist)), d[last]]); return;
  }
  let u = chordParams(d, first, last), Q = generateBezier(d, first, last, u, t1, t2);
  let [maxErr, split] = maxError(d, first, last, Q, u);
  if (maxErr < err2) { out.push(Q); return; }
  if (maxErr < err2 * 4) {
    for (let it = 0; it < 4; it++) {
      u = reparameterize(d, first, last, u, Q);
      Q = generateBezier(d, first, last, u, t1, t2);
      [maxErr, split] = maxError(d, first, last, Q, u);
      if (maxErr < err2) { out.push(Q); return; }
    }
  }
  split = Math.max(first + 1, Math.min(last - 1, split));
  const tc = unit(sub(d[split - 1], d[split + 1]));
  fitCubic(d, first, split, t1, tc, err2, out, depth + 1);
  fitCubic(d, split, last, mul(tc, -1), t2, err2, out, depth + 1);
}
function chordParams(d, first, last) {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(d[i], d[i - 1])));
  const tot = u[u.length - 1] || 1;
  return u.map(v => v / tot);
}
function generateBezier(d, first, last, u, t1, t2) {
  const p0 = d[first], p3 = d[last];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], s = 1 - t, b0 = s * s * s, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b3 = t * t * t;
    const A1 = mul(t1, b1), A2 = mul(t2, b2);
    c00 += dot(A1, A1); c01 += dot(A1, A2); c11 += dot(A2, A2);
    const tmp = sub(d[first + i], add(add(mul(p0, b0 + b1), mul(p3, b2 + b3)), { x: 0, y: 0 }));
    x0 += dot(A1, tmp); x1 += dot(A2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let a1 = det ? (x0 * c11 - x1 * c01) / det : 0, a2 = det ? (c00 * x1 - c01 * x0) / det : 0;
  const segLen = len(sub(p3, p0)), eps = 1e-6 * segLen;
  if (a1 < eps || a2 < eps) { a1 = a2 = segLen / 3; }
  return [p0, add(p0, mul(t1, a1)), add(p3, mul(t2, a2)), p3];
}
function maxError(d, first, last, Q, u) {
  let maxD = 0, split = Math.floor((first + last) / 2);
  for (let i = 1; i < u.length - 1; i++) {
    const v = sub(bez(Q, u[i]), d[first + i]), dd = dot(v, v);
    if (dd >= maxD) { maxD = dd; split = first + i; }
  }
  return [maxD, split];
}
function reparameterize(d, first, last, u, Q) {
  const Q1 = [0, 1, 2].map(i => mul(sub(Q[i + 1], Q[i]), 3)), Q2 = [0, 1].map(i => mul(sub(Q1[i + 1], Q1[i]), 2));
  const q1 = t => { const s = 1 - t; return add(add(mul(Q1[0], s * s), mul(Q1[1], 2 * s * t)), mul(Q1[2], t * t)); };
  const q2 = t => add(mul(Q2[0], 1 - t), mul(Q2[1], t));
  return u.map((t, i) => {
    const diff = sub(bez(Q, t), d[first + i]), a = q1(t), b = q2(t);
    const num = dot(diff, a), den = dot(a, a) + dot(diff, b);
    const nt = den ? t - num / den : t;
    return Math.max(0, Math.min(1, nt));
  });
}

// One loop → one closed contour. smooth = smoothing passes, tolerance = max fit error in pixels.
export function fitLoop(pts, { cornerDeg = 60, smooth = 2, tolerance = 1.2 } = {}) {
  const n = pts.length;
  let cut = findCorners(pts, cornerDeg);
  const isCorner = new Set(cut);
  // A loop without corners is cut into four smooth pieces (tangents continue across the cuts).
  if (cut.length === 0) cut = [0, 1, 2, 3].map(q => Math.floor(q * n / 4));
  else if (cut.length === 1) cut = [cut[0], (cut[0] + Math.floor(n / 2)) % n];
  cut.sort((a, b) => a - b);
  const err2 = tolerance * tolerance, segs = [];
  for (let c = 0; c < cut.length; c++) {
    const a = cut[c], b = cut[(c + 1) % cut.length], m = (b - a + n) % n || n;
    const span = smoothSpan(Array.from({ length: m + 1 }, (_, j) => pts[(a + j) % n]), smooth);
    if (span.length < 2) continue;
    const look = Math.min(3, span.length - 1);
    // Tangent at a split point that isn't a corner: centred on the raw loop, so pieces join smoothly.
    const tan = (idx, dir) => isCorner.has(idx) ? null : unit(sub(pts[(idx + dir * 3 + n) % n], pts[(idx - dir * 3 + n) % n]));
    const t1 = tan(a, 1) || unit(sub(span[look], span[0]));
    const t2 = tan(b, -1) || unit(sub(span[span.length - 1 - look], span[span.length - 1]));
    const out = []; fitCubic(span, 0, span.length - 1, t1, t2, err2, out); segs.push(...out);
  }
  // Bézier chain → nodes; nearly straight pieces become lines.
  const straight = Q => {
    if (Q.line) return true;
    const ch = sub(Q[3], Q[0]), L = len(ch) || 1, nx = -ch.y / L, ny = ch.x / L, lim = Math.max(.35, tolerance * .4);
    const off = p => Math.abs((p.x - Q[0].x) * nx + (p.y - Q[0].y) * ny);
    const along = p => dot(sub(p, Q[0]), ch) / (L * L);
    return off(Q[1]) < lim && off(Q[2]) < lim && along(Q[1]) > -0.05 && along(Q[2]) < 1.05;
  };
  const r = v => Math.round(v * 100) / 100;
  const P = p => ({ x: r(p.x), y: r(p.y) });
  const nodes = segs.map(Q => ({ ...P(Q[0]), i: null, o: straight(Q) ? null : P(Q[1]), s: false }));
  segs.forEach((Q, k) => { if (!straight(Q)) nodes[(k + 1) % nodes.length].i = P(Q[2]); });
  // Merge nearly-collinear straight runs (a long edge fitted as several lines).
  const merged = [];
  for (let k = 0; k < nodes.length; k++) {
    const p = nodes[(k - 1 + nodes.length) % nodes.length], c = nodes[k], q = nodes[(k + 1) % nodes.length];
    if (nodes.length > 3 && !c.i && !c.o && !p.o && !q.i) {
      const ax = c.x - p.x, ay = c.y - p.y, bx = q.x - c.x, by = q.y - c.y;
      if (Math.abs(ax * by - ay * bx) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1) < .02 && ax * bx + ay * by > 0) continue;
    }
    merged.push(c);
  }
  for (const nd of merged) {
    if (nd.i && nd.o) {
      const a = sub(nd.i, nd), b = sub(nd.o, nd), la = len(a), lb = len(b);
      nd.s = la > 1e-6 && lb > 1e-6 && Math.abs(a.x * b.y - a.y * b.x) / (la * lb) < .03 && dot(a, b) < 0;
    }
  }
  return { closed: true, nodes: merged };
}

// Whole pipeline: mask → contours (pixel coordinates). minArea drops specks (in square pixels).
export function traceMask(mask, w, h, { cornerDeg = 60, smooth = 2, tolerance = 1.2, minArea = 12 } = {}) {
  return boundaryLoops(mask, w, h)
    .filter(l => Math.abs(loopArea(l)) >= minArea)
    .map(l => fitLoop(l, { cornerDeg, smooth, tolerance }))
    .filter(c => c.nodes.length >= 2);
}
