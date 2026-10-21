import { R, P, N, contourD, glyphD, parseD, isAligned } from './path.js';

const $ = s => document.querySelector(s);
const SKEY = 'glyphpath.v1';
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- sample project (example glyphs) ---------- */
function sampleFont() {
  const g = (id, adv, d) => ({ id, adv, contours: parseD(d) });
  return {
    name: 'Example logo', space: 280, tracking: 30,
    metrics: { cap: 100, xh: 340, base: 800, desc: 960 },
    glyphs: [
      g('N', 620, 'M60 800 L60 100 L170 100 L460 590 L460 100 L560 100 L560 800 L450 800 L160 310 L160 800 Z'),
      g('O', 660, 'M330 90 C490 90 620 251 620 450 C620 649 490 810 330 810 C170 810 40 649 40 450 C40 251 170 90 330 90 Z M350 200 C256 200 180 312 180 450 C180 588 256 700 350 700 C444 700 500 588 500 450 C500 312 444 200 350 200 Z'),
      g('V', 640, 'M30 100 L150 100 L320 640 L490 100 L610 100 L385 755 C374 788 352 800 320 800 C288 800 266 788 255 755 Z'),
      g('A', 640, 'M40 800 L245 145 C255 115 285 100 320 100 C355 100 385 115 395 145 L600 800 L485 800 L440 650 L200 650 L155 800 Z M230 550 L410 550 L330 280 C326 266 314 266 310 280 Z'),
    ]
  };
}

/* ---------- state ---------- */
let font, cur = 0, sel = new Set(), active = null, tool = 'select';
let view = { k: .5, tx: 0, ty: 0 }, drag = null, hover = null, hoverS = null, spaceDown = false;
let refSeg = null, parOn = true, flashMsg = '', flashT = 0, hoverSeg = null;
let cornerR = 40, lastCorner = null, cornerMode = null, hoverF = null, focusSeg = null, focusFil = null;
let hoverH = null, armed = new Set();
const PAR_EXACT = .3 * Math.PI / 180, PAR_NEAR = 3 * Math.PI / 180;
const lineAngDiff = (a, b) => { let d = ((a - b) % Math.PI + Math.PI) % Math.PI; return Math.min(d, Math.PI - d); };
function flash(m) { flashMsg = m; clearTimeout(flashT); flashT = setTimeout(() => { flashMsg = ''; requestRender(); }, 3000); requestRender(); }
let snapOn = true, gridSize = 10, ptext = 'NOVA';
const undoS = [], redoS = [];
const G = () => font.glyphs[cur];
const key = (ci, ni) => `${ci}:${ni}`;
const unkey = k => k.split(':').map(Number);
const nodeOf = k => { const [ci, ni] = unkey(k); return G().contours[ci]?.nodes[ni]; };
const sn = v => snapOn ? Math.round(v / gridSize) * gridSize : R(v);
const snapshot = () => JSON.stringify(font);

const stateOf = () => ({ font, ptext, snapOn, gridSize });
function applyState(s) {
  if (!(s && s.font && Array.isArray(s.font.glyphs) && s.font.glyphs.length)) return false;
  font = s.font; ptext = s.ptext ?? ptext; snapOn = s.snapOn ?? true; gridSize = s.gridSize || 10; return true;
}
// With serve.mjs the project lives on disk; on static hosting (GitHub Pages) there is no API and the browser keeps it.
let serverOk = false;
async function load() {
  try {
    const ping = await fetch('api/ping');
    serverOk = ping.ok && (await ping.text()).trim() === 'glyphpath';
  } catch (e) {}
  if (serverOk) {
    try { const r = await fetch('api/project'); if (r.ok && applyState(await r.json())) return; } catch (e) {}
  }
  try { if (applyState(JSON.parse(localStorage.getItem(SKEY) || 'null'))) return; } catch (e) {}
  font = sampleFont();
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const body = JSON.stringify(stateOf());
    let local = true;
    try { localStorage.setItem(SKEY, body); } catch (e) { local = false; }
    if (!serverOk) { setSaveState(local ? 'saved in browser' : 'not saved: browser storage blocked'); return; }
    try {
      const r = await fetch('api/project', { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
      setSaveState(r.ok ? 'saved' : `save failed (${r.status})`);
    } catch (e) { setSaveState('server unreachable, kept in browser'); }
  }, 400);
  setSaveState('saving…');
}
function setSaveState(t) { const el = $('#savestate'); if (el) el.textContent = t; }
function commit(before) {
  if (before !== undefined && snapshot() !== before) { undoS.push(before); if (undoS.length > 300) undoS.shift(); redoS.length = 0; }
  save();
}
function undo() { if (!undoS.length) return; redoS.push(snapshot()); font = JSON.parse(undoS.pop()); afterHistory(); }
function redo() { if (!redoS.length) return; undoS.push(snapshot()); font = JSON.parse(redoS.pop()); afterHistory(); }
function afterHistory() { cur = Math.min(cur, font.glyphs.length - 1); sel.clear(); active = null; refSeg = null; hoverSeg = null; focusSeg = null; focusFil = null; armed.clear(); save(); render(); }
function edit(fn) { const b = snapshot(); fn(); commit(b); render(); }

/* ---------- geometry ---------- */
const toScreen = p => ({ x: p.x * view.k + view.tx, y: p.y * view.k + view.ty });
const toWorld = (x, y) => ({ x: (x - view.tx) / view.k, y: (y - view.ty) / view.k });
const cub = (a, b) => [a, a.o || a, b.i || b, b];
function bz(Q, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * Q[0].x + b * Q[1].x + c * Q[2].x + d * Q[3].x, y: a * Q[0].y + b * Q[1].y + c * Q[2].y + d * Q[3].y };
}
function segments(c) {
  const out = [], L = c.nodes.length;
  for (let k = 0; k < L - 1; k++) out.push(k);
  if (c.closed && L > 1) out.push(L - 1);
  return out;
}
function insertAt(ci, ai, t) {
  const c = G().contours[ci], bi = (ai + 1) % c.nodes.length, a = c.nodes[ai], b = c.nodes[bi];
  const Q = cub(a, b), lerp = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  let n;
  if (!(a.o || b.i)) { const p = lerp(Q[0], Q[3]); n = N(R(p.x), R(p.y)); }
  else {
    const p01 = lerp(Q[0], Q[1]), p12 = lerp(Q[1], Q[2]), p23 = lerp(Q[2], Q[3]), p012 = lerp(p01, p12), p123 = lerp(p12, p23), p = lerp(p012, p123);
    a.o = p01; b.i = p23; n = N(p.x, p.y); n.i = p012; n.o = p123; n.s = true;
  }
  c.nodes.splice(ai + 1, 0, n); return ai + 1;
}
function reverseContour(c) { c.nodes.reverse(); c.nodes.forEach(n => { const t = n.i; n.i = n.o; n.o = t; }); }
function autoSmooth(c, ni) {
  const L = c.nodes.length, n = c.nodes[ni];
  const hasP = c.closed || ni > 0, hasN = c.closed || ni < L - 1;
  const p = c.nodes[(ni - 1 + L) % L], q = c.nodes[(ni + 1) % L];
  let dx = (hasN ? q.x : n.x) - (hasP ? p.x : n.x), dy = (hasN ? q.y : n.y) - (hasP ? p.y : n.y);
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  if (hasP) { const l = Math.hypot(n.x - p.x, n.y - p.y) / 3; n.i = { x: R(n.x - dx * l), y: R(n.y - dy * l) }; }
  if (hasN) { const l = Math.hypot(q.x - n.x, q.y - n.y) / 3; n.o = { x: R(n.x + dx * l), y: R(n.y + dy * l) }; }
  n.s = true;
}
function alignHandles(n) {
  if (!n.i || !n.o) return;
  const ax = n.x - n.i.x, ay = n.y - n.i.y, la = Math.hypot(ax, ay);
  if (la < 1e-6) return;
  const lb = Math.hypot(n.o.x - n.x, n.o.y - n.y);
  n.o = { x: R(n.x + ax / la * lb), y: R(n.y + ay / la * lb) };
}

function lineX(p1, p2, p3, p4) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9) return null;
  const a = p1.x * p2.y - p1.y * p2.x, b = p3.x * p4.y - p3.y * p4.x;
  return { x: (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / d, y: (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / d };
}
// A fillet is a curve A→B between two straight lines P–A and B–Q whose handles both point at the lines' meeting corner V,
// with A and B the same distance from V. Detected from geometry, so older fillets and imported rounded corners work too.
function filletInfo(c, ai) {
  const L = c.nodes.length, A = c.nodes[ai];
  if (!A || L < 3) return null;
  const bi = (ai + 1) % L;
  if (!c.closed && (ai === 0 || bi === 0 || bi === L - 1)) return null;
  const B = c.nodes[bi], P = c.nodes[(ai - 1 + L) % L], Q = c.nodes[(bi + 1) % L];
  if (!A.o || !B.i || P.o || A.i || B.o || Q.i) return null;
  const V = lineX(P, A, Q, B); if (!V) return null;
  const towardV = (n, h) => {
    const hx = h.x - n.x, hy = h.y - n.y, vx = V.x - n.x, vy = V.y - n.y, lh = Math.hypot(hx, hy), lv = Math.hypot(vx, vy);
    return lh > 1e-6 && lv > 1e-6 && Math.abs(hx * vy - hy * vx) / (lh * lv) < .02 && hx * vx + hy * vy > 0;
  };
  if (!towardV(A, A.o) || !towardV(B, B.i)) return null;
  const da = Math.hypot(A.x - V.x, A.y - V.y), db = Math.hypot(B.x - V.x, B.y - V.y);
  if (!A.fil && Math.abs(da - db) > Math.max(.5, .02 * Math.max(da, db))) return null;
  const lp = Math.hypot(P.x - V.x, P.y - V.y), lq = Math.hypot(Q.x - V.x, Q.y - V.y);
  if (lp < 1e-6 || lq < 1e-6) return null;
  const u1 = { x: (P.x - V.x) / lp, y: (P.y - V.y) / lp }, u2 = { x: (Q.x - V.x) / lq, y: (Q.y - V.y) / lq };
  const th = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
  if (th < 1e-3 || th > Math.PI - 1e-3) return null;
  const r = Math.hypot(A.x - V.x, A.y - V.y) * Math.tan(th / 2);
  const bx = u1.x + u2.x, by = u1.y + u2.y, bl = Math.hypot(bx, by), dc = r / Math.sin(th / 2);
  return { ai, bi, V, u1, u2, th, r, dm: Math.min(lp, lq), bis: { x: bx / bl, y: by / bl }, C: { x: V.x + bx / bl * dc, y: V.y + by / bl * dc } };
}
function setFillet(c, f, r) {
  let d = r / Math.tan(f.th / 2);
  if (d > f.dm * .999) { d = f.dm * .999; r = d * Math.tan(f.th / 2); }
  const h = 4 / 3 * Math.tan((Math.PI - f.th) / 4) * r, A = c.nodes[f.ai], B = c.nodes[f.bi];
  A.x = f.V.x + f.u1.x * d; A.y = f.V.y + f.u1.y * d; A.i = null; A.o = { x: A.x - f.u1.x * h, y: A.y - f.u1.y * h };
  B.x = f.V.x + f.u2.x * d; B.y = f.V.y + f.u2.y * d; B.o = null; B.i = { x: B.x - f.u2.x * h, y: B.y - f.u2.y * h };
}
function hit(sx, sy) {
  const g = G(), near = p => { const s = toScreen(p); return Math.hypot(s.x - sx, s.y - sy) <= 7; };
  for (let ci = g.contours.length - 1; ci >= 0; ci--) {
    const c = g.contours[ci];
    for (let ai = 0; ai < c.nodes.length; ai++) if (c.nodes[ai].o) { const f = filletInfo(c, ai); if (f && near(f.C)) return { type: 'fcenter', ci, ai }; }
  }
  for (let ci = g.contours.length - 1; ci >= 0; ci--) {
    const ns = g.contours[ci].nodes;
    for (let ni = ns.length - 1; ni >= 0; ni--) if (near(ns[ni])) return { type: 'anchor', ci, ni };
  }
  for (let ci = g.contours.length - 1; ci >= 0; ci--) {
    const ns = g.contours[ci].nodes;
    for (let ni = ns.length - 1; ni >= 0; ni--) for (const h of ['o', 'i']) if (ns[ni][h] && near(ns[ni][h])) return { type: 'handle', ci, ni, h };
  }
  let best = null;
  g.contours.forEach((c, ci) => segments(c).forEach(ai => {
    const Q = cub(c.nodes[ai], c.nodes[(ai + 1) % c.nodes.length]);
    for (let s = 1; s < 48; s++) {
      const t = s / 48, p = toScreen(bz(Q, t)), d = Math.hypot(p.x - sx, p.y - sy);
      if (d < 6 && (!best || d < best.d)) best = { type: 'seg', ci, ni: ai, t, d, Q };
    }
  }));
  if (best) {
    let bt = best.t, bd = best.d;
    for (let t = best.t - 1 / 48; t <= best.t + 1 / 48; t += 1 / 960) {
      if (t <= 0 || t >= 1) continue;
      const p = toScreen(bz(best.Q, t)), d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bd) { bd = d; bt = t; }
    }
    best.t = bt; return best;
  }
  if (tool === 'select' && Math.abs(sx - toScreen({ x: g.adv, y: 0 }).x) < 5) return { type: 'adv' };
  return null;
}

/* ---------- rendering ---------- */
const cv = $('#cv');
let rq = 0;
function requestRender() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }

function renderCanvas() {
  const W = cv.clientWidth, H = cv.clientHeight, g = G(), k = view.k, M = font.metrics;
  let s = '';
  const step = gridSize * k;
  if (step >= 8 && (W / step + H / step) < 600) {
    let p = '';
    const wx0 = Math.floor(-view.tx / k / gridSize) * gridSize, wy0 = Math.floor(-view.ty / k / gridSize) * gridSize;
    for (let x = wx0; x * k + view.tx <= W; x += gridSize) { const X = Math.round(x * k + view.tx) + .5; p += `M${X} 0V${H}`; }
    for (let y = wy0; y * k + view.ty <= H; y += gridSize) { const Y = Math.round(y * k + view.ty) + .5; p += `M0 ${Y}H${W}`; }
    s += `<path class="grid" d="${p}"/>`;
  }
  for (const [name, y] of [['cap', M.cap], ['x-height', M.xh], ['baseline', M.base], ['descender', M.desc]]) {
    const Y = Math.round(y * k + view.ty) + .5;
    s += `<line class="metric${name === 'baseline' ? ' base' : ''}" x1="0" x2="${W}" y1="${Y}" y2="${Y}"/><text class="mlabel" x="8" y="${Y - 4}">${name} ${y}</text>`;
  }
  for (const [x, cls] of [[0, 'side'], [g.adv, 'side adv']]) {
    const X = Math.round(x * k + view.tx) + .5;
    s += `<line class="${cls}" x1="${X}" x2="${X}" y1="0" y2="${H}"/>`;
  }
  const advX = g.adv * k + view.tx;
  s += `<text class="slabel" x="${advX + 6}" y="${M.desc * k + view.ty - 6}">advance ${g.adv}</text>`;
  s += `<g transform="translate(${view.tx} ${view.ty}) scale(${k})"><path class="shape" d="${glyphD(g)}"/>`;
  if (tool === 'pen' && active !== null && hover && !drag && g.contours[active]) {
    const ns = g.contours[active].nodes, l = ns[ns.length - 1];
    if (l) { const h = { x: sn(hover.x), y: sn(hover.y) }; s += `<path class="ghost" d="M${P(l)} ${l.o ? `C${P(l.o)} ${P(h)} ${P(h)}` : `L${P(h)}`}"/>`; }
  }
  s += '</g>';
  const segs = [];
  g.contours.forEach((c, ci) => segments(c).forEach(ai => {
    const a = c.nodes[ai], b = c.nodes[(ai + 1) % c.nodes.length];
    if (a.o || b.i || Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return;
    segs.push({ ci, ai, a, b, ang: Math.atan2(b.y - a.y, b.x - a.x), exact: false, near: false });
  }));
  if (parOn) {
    let foc = [];
    if (focusSeg) foc = segs.filter(sg => sg.ci === focusSeg.ci && sg.ai === focusSeg.ai);
    else if (drag && drag.kind === 'move') foc = segs.filter(sg => {
      const L = g.contours[sg.ci].nodes.length;
      return drag.orig.has(key(sg.ci, sg.ai)) !== drag.orig.has(key(sg.ci, (sg.ai + 1) % L));
    });
    for (const f of foc) for (const o of segs) {
      if (o === f) continue;
      const d = lineAngDiff(f.ang, o.ang);
      if (d < PAR_EXACT) o.exact = f.exact = true;
      else if (d < PAR_NEAR) o.near = f.near = true;
    }
  }
  for (const sg of segs) {
    const isRef = refSeg && refSeg.ci === sg.ci && refSeg.ai === sg.ai;
    if (!sg.exact && !sg.near && !isRef) continue;
    const A = toScreen(sg.a), B = toScreen(sg.b);
    s += `<line class="${isRef ? 'refseg' : sg.exact ? 'par' : 'par near'}" x1="${R(A.x)}" y1="${R(A.y)}" x2="${R(B.x)}" y2="${R(B.y)}"/>`;
  }
  const hc = hoverSeg && g.contours[hoverSeg.ci];
  if (hc && hc.nodes.length > 1 && segments(hc).includes(hoverSeg.ai)) {
    const a = hc.nodes[hoverSeg.ai], b = hc.nodes[(hoverSeg.ai + 1) % hc.nodes.length];
    const A = toScreen(a), B = toScreen(b), dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy);
    if (!a.o && !b.i && l > 1e-6) {
      const ux = dx / l * 1e5, uy = dy / l * 1e5;
      s += `<path class="ext" d="M${R(A.x)} ${R(A.y)}L${R(A.x - ux)} ${R(A.y - uy)}M${R(B.x)} ${R(B.y)}L${R(B.x + ux)} ${R(B.y + uy)}"/>`;
      s += `<line class="hov" x1="${R(A.x)}" y1="${R(A.y)}" x2="${R(B.x)}" y2="${R(B.y)}"/>`;
    }
  }
  // Control arms that line up with an adjacent arm: the other arm of the same point, or the facing arm across a segment.
  // Same infinite line = solid green; parallel but offset = dashed green.
  const armState = new Map(), ARM_TOL = .5 * Math.PI / 180;
  const armAng = (n, h) => { const dx = n[h].x - n.x, dy = n[h].y - n.y; return Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : null; };
  const markArm = (k, v) => { if (armState.get(k) !== 'col') armState.set(k, v); };
  g.contours.forEach((c, ci) => {
    const L = c.nodes.length;
    c.nodes.forEach((n, ni) => {
      if (!n.i || !n.o) return;
      const a = armAng(n, 'i'), b = armAng(n, 'o');
      if (a !== null && b !== null && lineAngDiff(a, b) < ARM_TOL) { markArm(`${ci}:${ni}:i`, 'col'); markArm(`${ci}:${ni}:o`, 'col'); }
    });
    segments(c).forEach(ai => {
      const bi = (ai + 1) % L, A = c.nodes[ai], B = c.nodes[bi];
      if (!A.o || !B.i) return;
      const a = armAng(A, 'o'), b = armAng(B, 'i');
      if (a === null || b === null || lineAngDiff(a, b) >= ARM_TOL) return;
      const st = lineAngDiff(a, Math.atan2(B.y - A.y, B.x - A.x)) < ARM_TOL ? 'col' : 'par';
      markArm(`${ci}:${ai}:o`, st); markArm(`${ci}:${bi}:i`, st);
    });
  });
  let lines = '', linesC = '', linesP = '', hds = '', ans = '';
  g.contours.forEach((c, ci) => c.nodes.forEach((n, ni) => {
    const a = toScreen(n);
    for (const h of ['i', 'o']) if (n[h]) {
      const b = toScreen(n[h]);
      const arm = `M${R(a.x)} ${R(a.y)}L${R(b.x)} ${R(b.y)}`, st = armState.get(`${ci}:${ni}:${h}`);
      if (st === 'col') linesC += arm; else if (st === 'par') linesP += arm; else lines += arm;
      const hot = hoverH === `${ci}:${ni}:${h}` || armed.has(`${ci}:${ni}:${h}`) || (drag && drag.kind === 'handle' && drag.k === key(ci, ni) && drag.h === h);
      hds += `<circle class="hd${hot ? ' hot' : ''}" cx="${R(b.x)}" cy="${R(b.y)}" r="${hot ? 4.5 : 3.5}"/>`;
    }
    const cls = `an${sel.has(key(ci, ni)) ? ' sel' : ''}`;
    if (ni === 0) ans += `<circle class="start" cx="${R(a.x)}" cy="${R(a.y)}" r="8.5"/>`;
    ans += n.s ? `<circle class="${cls}" cx="${R(a.x)}" cy="${R(a.y)}" r="4.5"/>` : `<rect class="${cls}" x="${R(a.x - 4)}" y="${R(a.y - 4)}" width="8" height="8"/>`;
  }));
  s += `<path class="hl" d="${lines}"/><path class="hl col" d="${linesC}"/><path class="hl par" d="${linesP}"/>${hds}${ans}`;
  g.contours.forEach((c, ci) => c.nodes.forEach((n, ai) => {
    if (!n.o) return;
    const f = filletInfo(c, ai); if (!f) return;
    const Cs = toScreen(f.C), As = toScreen(c.nodes[ai]), Bs = toScreen(c.nodes[f.bi]);
    const on = focusFil === key(ci, ai) || (drag && drag.kind === 'fillet' && drag.ci === ci && drag.ai === ai);
    const hot = on || hoverF === key(ci, ai);
    if (on) {
      const A = c.nodes[ai], B = c.nodes[f.bi], p = toScreen(A), q = toScreen(A.o), r2 = toScreen(B.i), t = toScreen(B);
      s += `<path class="farc" d="M${R(p.x)} ${R(p.y)}C${R(q.x)} ${R(q.y)} ${R(r2.x)} ${R(r2.y)} ${R(t.x)} ${R(t.y)}"/>`;
    }
    s += `<path class="fr${hot ? ' hot' : ''}" d="M${R(As.x)} ${R(As.y)}L${R(Cs.x)} ${R(Cs.y)}L${R(Bs.x)} ${R(Bs.y)}"/>`;
    s += `<circle class="fcd" cx="${R(Cs.x)}" cy="${R(Cs.y)}" r="7"/><path class="fc" d="M${R(Cs.x - 4)} ${R(Cs.y)}h8M${R(Cs.x)} ${R(Cs.y - 4)}v8"/>`;
    if (hot) s += `<text class="flabel" x="${R(Cs.x + 12)}" y="${R(Cs.y - 10)}">r ${R(f.r)}</text>`;
  }));
  if (cornerMode && hover && cornerMode.gi === cur) {
    const a = toScreen(cornerMode.ref), b = toScreen(hover);
    s += `<line class="cguide" x1="${R(a.x)}" y1="${R(a.y)}" x2="${R(b.x)}" y2="${R(b.y)}"/><text class="clabel" x="${R(b.x + 12)}" y="${R(b.y - 12)}">${cornerMode.type === 'fillet' ? 'radius' : 'cut'} ${cornerMode.r}</text>`;
  }
  if (drag && drag.kind === 'marquee') {
    const a = toScreen({ x: drag.x0, y: drag.y0 }), b = toScreen({ x: drag.x1, y: drag.y1 });
    s += `<rect class="marq" x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}"/>`;
  }
  cv.innerHTML = s;
  $('#zoomlbl').textContent = `${Math.round(k * 100)}%`;
  $('#hint').innerHTML = flashMsg ? `<b>${esc(flashMsg)}</b>`
    : cornerMode ? `<b>${cornerMode.type === 'fillet' ? 'Fillet' : 'Chamfer'}</b> · move away from the corner to set the ${cornerMode.type === 'fillet' ? 'radius' : 'cut'}, click or Enter to apply, Esc or right-click to cancel`
    : refSeg ? '<b>Reference line set</b> · hover another line and press L to make it parallel, Esc to cancel'
    : tool === 'pen'
    ? (active !== null ? '<b>Pen</b> · click to add, drag to pull a curve, click the first point to close, Esc to finish' : '<b>Pen</b> · click to start a contour, click a segment to add a point, click an open end to continue it')
    : '<b>Select</b> · drag points or handles, Shift-drag a line to move it, B or right-click a segment for line ↔ curve';
}

function thumb(g, h) {
  return `<svg viewBox="-40 ${font.metrics.cap - 60} ${g.adv + 80} ${font.metrics.desc - font.metrics.cap + 120}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"${h ? ` style="height:${h}px"` : ''}><path fill-rule="evenodd" d="${glyphD(g)}"/></svg>`;
}
function renderList() {
  $('#glist').innerHTML = font.glyphs.map((g, gi) => {
    const pts = g.contours.reduce((n, c) => n + c.nodes.length, 0);
    return `<button class="grow${gi === cur ? ' cur' : ''}" data-gi="${gi}" title="${esc(g.id)}"><span class="mk">${gi === cur ? '&gt;' : ''}</span>${thumb(g)}<span class="nm">${String(gi + 1).padStart(2, '0')} ${esc(g.id)}</span><span class="sub">adv ${g.adv}</span><span class="sub">${g.contours.length} ctr ${pts} pts</span></button>`;
  }).join('');
}
function setVal(id, v) { const el = $(id); if (document.activeElement !== el) el.value = v; }
function renderInspector() {
  const g = G();
  setVal('#gid', g.id); setVal('#gadv', g.adv);
  const M = font.metrics; setVal('#mCap', M.cap); setVal('#mXh', M.xh); setVal('#mBase', M.base); setVal('#mDesc', M.desc);
  const one = sel.size === 1 ? nodeOf([...sel][0]) : null;
  $('#nx').disabled = $('#ny').disabled = !one;
  setVal('#nx', one ? R(one.x) : ''); setVal('#ny', one ? R(one.y) : '');
  const nc = new Set([...sel].map(k => unkey(k)[0])).size;
  $('#selinfo').textContent = sel.size ? `${sel.size} point${sel.size > 1 ? 's' : ''} in ${nc} contour${nc > 1 ? 's' : ''} selected` : `${g.contours.length} contour${g.contours.length === 1 ? '' : 's'}, nothing selected`;
  for (const id of ['#pSharp', '#pSmooth', '#pFree', '#cClose', '#cRev', '#pDel']) $(id).disabled = !sel.size && !(active !== null && ['#cClose', '#cRev'].includes(id));
  const dt = $('#dtext');
  if (document.activeElement !== dt) { dt.value = glyphD(g); $('#dnote').className = 'note'; $('#dnote').textContent = 'Edit to reshape the glyph. M L H V C S Q T Z, absolute or relative.'; }
  hlD();
}
function hlD() {
  const t = $('#dtext');
  $('#dhl').innerHTML = `${t.value.replace(/([MmLlHhVvCcSsQqTtZzAa])|([^MmLlHhVvCcSsQqTtZzAa]+)/g, (m, c, o) => c ? `<span class="c">${c}</span>` : esc(o))}\n`;
  t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`;
}

function tokens(t) {
  const out = [];
  for (let i = 0; i < t.length;) {
    if (t[i] === '/') {
      let j = i + 1; while (j < t.length && t[j] !== ' ' && t[j] !== '/') j++;
      out.push(j > i + 1 ? t.slice(i + 1, j) : '/'); i = t[j] === ' ' ? j + 1 : j;
    } else { out.push(t[i]); i++; }
  }
  return out;
}
function layout(text) {
  const items = []; let x = 0;
  for (const t of tokens(text)) {
    if (t === ' ') { x += font.space; continue; }
    const gi = font.glyphs.findIndex(g => g.id === t);
    if (gi < 0) { items.push({ miss: t, x }); x += font.space + font.tracking; continue; }
    items.push({ gi, g: font.glyphs[gi], x }); x += font.glyphs[gi].adv + font.tracking;
  }
  return { items, width: Math.max(0, x - font.tracking) };
}
function renderPreview() {
  const { items, width } = layout(ptext), M = font.metrics;
  const y0 = M.cap - 80, h = M.desc - M.cap + 140, w = width + 160;
  const sv = $('#pview');
  sv.setAttribute('viewBox', `-80 ${y0} ${w} ${h}`);
  sv.style.width = `${Math.max(120, w / h * 110)}px`;
  let s = `<line class="pbase" x1="-80" x2="${w}" y1="${M.base}" y2="${M.base}"/>`;
  for (const it of items) {
    if (it.miss) s += `<rect class="miss" x="${it.x + 20}" y="${M.cap}" width="${font.space - 40}" height="${M.base - M.cap}"><title>No glyph “${esc(it.miss)}”</title></rect>`;
    else s += `<path data-gi="${it.gi}" fill-rule="evenodd" transform="translate(${R(it.x)} 0)" d="${glyphD(it.g)}"><title>${esc(it.g.id)}</title></path>`;
  }
  sv.innerHTML = s;
  setVal('#ptext', ptext); setVal('#ptrack', font.tracking); setVal('#pspace', font.space);
}
function render() {
  renderCanvas(); renderList(); renderInspector(); renderPreview();
  $('#tSelect').classList.toggle('on', tool === 'select'); $('#tPen').classList.toggle('on', tool === 'pen');
  $('#bUndo').disabled = !undoS.length; $('#bRedo').disabled = !redoS.length;
  $('#snap').checked = snapOn; setVal('#grid', gridSize);
}

/* ---------- view ---------- */
function fit() {
  const W = cv.clientWidth, H = cv.clientHeight, g = G(), M = font.metrics;
  if (!W || !H) return;
  const x0 = -80, x1 = g.adv + 80, y0 = Math.min(0, M.cap - 60), y1 = Math.max(1000, M.desc + 40);
  view.k = Math.min(W / (x1 - x0), (H - 30) / (y1 - y0)) * .94;
  view.tx = (W - (x0 + x1) * view.k) / 2; view.ty = (H - 30 - (y0 + y1) * view.k) / 2;
}
function zoomAt(sx, sy, f) {
  const w = toWorld(sx, sy); view.k = Math.min(40, Math.max(.05, view.k * f));
  view.tx = sx - w.x * view.k; view.ty = sy - w.y * view.k;
}
function selectGlyph(gi) { if (gi === cur || gi < 0 || gi >= font.glyphs.length) return; if (cornerMode) finishCorner(true); cur = gi; sel.clear(); active = null; refSeg = null; hoverSeg = null; focusSeg = null; focusFil = null; armed.clear(); fit(); render(); }

/* ---------- canvas interaction ---------- */
function local(e) { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }
function startMove(h, e, w, before, keepSel) {
  const k = key(h.ci, h.ni);
  if (!keepSel) {
    if (e.shiftKey) { if (sel.has(k)) { sel.delete(k); render(); return; } sel.add(k); }
    else if (!sel.has(k)) sel = new Set([k]);
  }
  const orig = new Map(); for (const kk of sel) { const n = nodeOf(kk); if (n) orig.set(kk, clone(n)); }
  drag = { kind: 'move', w0: w, orig, grab: clone(nodeOf(k)), before }; render();
}
cv.addEventListener('pointerdown', e => {
  const { sx, sy } = local(e), w = toWorld(sx, sy);
  if (cornerMode) { e.preventDefault(); finishCorner(e.button === 0); return; }
  cv.setPointerCapture(e.pointerId);
  if (e.button === 1 || (e.button === 0 && spaceDown)) { e.preventDefault(); drag = { kind: 'pan', sx, sy, tx: view.tx, ty: view.ty }; return; }
  if (e.button !== 0) return;
  const h = hit(sx, sy), g = G(), before = snapshot();
  if (h && h.type === 'handle') { const k = key(h.ci, h.ni); if (!sel.has(k)) sel = new Set([k]); const own = `${h.ci}:${h.ni}:${h.h}`, n0 = nodeOf(k);
    const arm = [...armed].filter(a => a !== own).map(a => { const p = a.split(':'), n = nodeOf(`${p[0]}:${p[1]}`); return n && n[p[2]] ? { k: `${p[0]}:${p[1]}`, h: p[2], o: { ...n[p[2]] } } : null; }).filter(Boolean);
    drag = { kind: 'handle', k, h: h.h, h0: { ...n0[h.h] }, arm, before }; render(); return; }
  focusFil = null;
  if (h && h.type === 'fcenter') { focusFil = key(h.ci, h.ai); drag = { kind: 'fillet', ci: h.ci, ai: h.ai, before }; render(); return; }
  if (h && h.type === 'seg' && !e.shiftKey && tool === 'select') {
    const c = g.contours[h.ci], f = filletInfo(c, h.ni);
    if (f) {
      focusFil = key(h.ci, h.ni); focusSeg = null; sel = new Set();
      drag = { kind: 'fillet', ci: h.ci, ai: h.ni, before, rel: { r0: f.r, t0: (w.x - f.V.x) * f.bis.x + (w.y - f.V.y) * f.bis.y } };
      render(); return;
    }
  }
  focusSeg = h && h.type === 'seg' && (tool === 'select' || e.shiftKey) ? { ci: h.ci, ai: h.ni } : null;
  if (h && h.type === 'seg' && e.shiftKey) {
    const c = g.contours[h.ci];
    sel = new Set([key(h.ci, h.ni), key(h.ci, (h.ni + 1) % c.nodes.length)]);
    hoverSeg = { ci: h.ci, ai: h.ni };
    startMove({ ci: h.ci, ni: h.ni }, e, w, before, true); return;
  }
  if (tool === 'pen') {
    if (h && h.type === 'anchor') {
      const c = g.contours[h.ci], L = c.nodes.length;
      if (active === h.ci && h.ni === 0 && L >= 2) { c.closed = true; active = null; sel = new Set([key(h.ci, 0)]); drag = { kind: 'pen', ci: h.ci, ni: 0, before }; render(); return; }
      if (active === h.ci && h.ni === L - 1) { const n = c.nodes[h.ni]; n.o = null; n.s = false; commit(before); render(); return; }
      if (active === null && !c.closed && (h.ni === 0 || h.ni === L - 1)) {
        if (h.ni === 0) reverseContour(c);
        active = h.ci; sel = new Set([key(h.ci, L - 1)]); commit(before); render(); return;
      }
      startMove(h, e, w, before); return;
    }
    if (h && h.type === 'seg' && active === null) { const ni = insertAt(h.ci, h.ni, h.t); sel = new Set([key(h.ci, ni)]); commit(before); render(); return; }
    if (active === null || !g.contours[active]) { g.contours.push({ closed: false, nodes: [] }); active = g.contours.length - 1; }
    const c = g.contours[active]; c.nodes.push(N(sn(w.x), sn(w.y)));
    const ni = c.nodes.length - 1; sel = new Set([key(active, ni)]);
    drag = { kind: 'pen', ci: active, ni, before }; render(); return;
  }
  if (h && h.type === 'anchor') { startMove(h, e, w, before); return; }
  if (h && h.type === 'adv') { drag = { kind: 'adv', before }; return; }
  if (h && h.type === 'seg') {
    if (!e.shiftKey) sel = new Set();
    g.contours[h.ci].nodes.forEach((_, i) => sel.add(key(h.ci, i)));
    startMove({ ci: h.ci, ni: h.ni }, e, w, before, true); return;
  }
  drag = { kind: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y, base: e.shiftKey ? new Set(sel) : new Set() };
  sel = new Set(drag.base); render();
});
cv.addEventListener('dblclick', e => {
  const { sx, sy } = local(e), h = hit(sx, sy);
  if (!h) return;
  if (h.type === 'anchor') edit(() => { const c = G().contours[h.ci], n = c.nodes[h.ni]; if (n.i || n.o) { n.i = n.o = null; n.s = false; } else autoSmooth(c, h.ni); });
  else if (h.type === 'seg' && tool === 'select') edit(() => { const ni = insertAt(h.ci, h.ni, h.t); sel = new Set([key(h.ci, ni)]); });
});
window.addEventListener('pointermove', e => {
  const { sx, sy } = local(e), w = toWorld(sx, sy);
  if (!drag) {
    if (e.target !== cv && !cv.contains(e.target)) return;
    hover = w; hoverS = { sx, sy };
    if (cornerMode) { cv.style.cursor = 'crosshair'; updateCorner(Math.round(Math.hypot(w.x - cornerMode.ref.x, w.y - cornerMode.ref.y))); return; }
    const h = spaceDown ? null : hit(sx, sy);
    const hs = h && h.type === 'seg' ? { ci: h.ci, ai: h.ni } : null;
    if ((hs && key(hs.ci, hs.ai)) !== (hoverSeg && key(hoverSeg.ci, hoverSeg.ai))) { hoverSeg = hs; requestRender(); }
    const hh = h && h.type === 'handle' ? `${h.ci}:${h.ni}:${h.h}` : null;
    if (hh !== hoverH) { hoverH = hh; requestRender(); }
    const hf = h && h.type === 'fcenter' ? key(h.ci, h.ai) : null;
    if (hf !== hoverF) { hoverF = hf; requestRender(); }
    cv.style.cursor = spaceDown ? 'grab' : h ? (h.type === 'adv' ? 'ew-resize' : h.type === 'seg' ? (e.shiftKey ? 'move' : tool === 'pen' ? 'copy' : 'pointer') : 'move') : (tool === 'pen' ? 'crosshair' : 'default');
    if (tool === 'pen' && active !== null) requestRender();
    return;
  }
  switch (drag.kind) {
    case 'pan': view.tx = drag.tx + sx - drag.sx; view.ty = drag.ty + sy - drag.sy; break;
    case 'move': {
      let dx = w.x - drag.w0.x, dy = w.y - drag.w0.y;
      const axis = (e.ctrlKey || e.metaKey) && e.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null;
      dx = axis === 'y' ? 0 : sn(drag.grab.x + dx) - drag.grab.x;
      dy = axis === 'x' ? 0 : sn(drag.grab.y + dy) - drag.grab.y;
      for (const [kk, o] of drag.orig) {
        const n = nodeOf(kk); n.x = o.x + dx; n.y = o.y + dy;
        n.i = o.i && { x: o.i.x + dx, y: o.i.y + dy }; n.o = o.o && { x: o.o.x + dx, y: o.o.y + dy };
      }
      break;
    }
    case 'handle': {
      const p = { x: sn(w.x), y: sn(w.y) };
      placeHandle(nodeOf(drag.k), drag.h, p, e.altKey);
      const dx = p.x - drag.h0.x, dy = p.y - drag.h0.y;
      for (const a of drag.arm) { const n = nodeOf(a.k); if (n) placeHandle(n, a.h, { x: a.o.x + dx, y: a.o.y + dy }, e.altKey); }
      break;
    }
    case 'pen': {
      const n = nodeOf(key(drag.ci, drag.ni)), p = { x: sn(w.x), y: sn(w.y) };
      if (Math.hypot(p.x - n.x, p.y - n.y) * view.k > 4) { n.o = p; n.i = { x: 2 * n.x - p.x, y: 2 * n.y - p.y }; n.s = true; }
      break;
    }
    case 'adv': G().adv = Math.max(0, Math.round(sn(w.x))); break;
    case 'fillet': {
      const c = G().contours[drag.ci], f = filletInfo(c, drag.ai); if (!f) break;
      const t = (w.x - f.V.x) * f.bis.x + (w.y - f.V.y) * f.bis.y, sn2 = Math.sin(f.th / 2);
      // Grabbing the arc: its midpoint follows the mouse along the bisector. Grabbing the centre: the centre follows.
      const raw = drag.rel ? drag.rel.r0 + (t - drag.rel.t0) * sn2 / (1 - sn2) : t * sn2;
      const r = Math.max(1, snapOn ? Math.round(raw) : R(raw));
      setFillet(c, f, r);
      const nf = filletInfo(c, drag.ai); if (nf) { cornerR = R(nf.r); $('#crad').value = cornerR; }
      break;
    }
    case 'marquee': {
      drag.x1 = w.x; drag.y1 = w.y;
      const x0 = Math.min(drag.x0, w.x), x1 = Math.max(drag.x0, w.x), y0 = Math.min(drag.y0, w.y), y1 = Math.max(drag.y0, w.y);
      sel = new Set(drag.base);
      G().contours.forEach((c, ci) => c.nodes.forEach((n, ni) => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) sel.add(key(ci, ni)); }));
      break;
    }
  }
  requestRender();
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.before !== undefined) commit(drag.before);
  drag = null; render();
});
cv.addEventListener('pointerleave', () => { if (!drag) { hover = null; hoverS = null; hoverSeg = null; requestRender(); } });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const { sx, sy } = local(e), unit = e.deltaMode === 1 ? 16 : 1;
  if (e.ctrlKey || e.metaKey) zoomAt(sx, sy, Math.exp(-e.deltaY * unit * .0025));
  else if (e.shiftKey) view.tx -= e.deltaY * unit;
  else { view.tx -= e.deltaX * unit; view.ty -= e.deltaY * unit; }
  requestRender();
}, { passive: false });
function toggleSeg(ci, ai) {
  edit(() => {
    const c = G().contours[ci], a = c.nodes[ai], b = c.nodes[(ai + 1) % c.nodes.length];
    if (a.o || b.i) { a.o = null; b.i = null; delete a.fil; a.s = isAligned(a); b.s = isAligned(b); }
    else {
      const dx = b.x - a.x, dy = b.y - a.y;
      a.o = { x: R(a.x + dx / 3), y: R(a.y + dy / 3) };
      b.i = { x: R(a.x + dx * 2 / 3), y: R(a.y + dy * 2 / 3) };
    }
  });
}
function moveNodeTo(n, x, y) {
  const dx = x - n.x, dy = y - n.y; n.x = x; n.y = y;
  for (const h of ['i', 'o']) if (n[h]) n[h] = { x: n[h].x + dx, y: n[h].y + dy };
}
function lineKey(h) {
  if (!h || h.type !== 'seg') return flash('Hover a straight segment first.');
  const c = G().contours[h.ci], a = c.nodes[h.ni], b = c.nodes[(h.ni + 1) % c.nodes.length];
  if (a.o || b.i) return flash('That segment is a curve. Press B to make it a line first.');
  if (!refSeg || !G().contours[refSeg.ci]?.nodes[refSeg.ai]) { refSeg = { ci: h.ci, ai: h.ni }; render(); return; }
  if (refSeg.ci === h.ci && refSeg.ai === h.ni) { refSeg = null; render(); return; }
  const rc = G().contours[refSeg.ci], ra = rc.nodes[refSeg.ai], rb = rc.nodes[(refSeg.ai + 1) % rc.nodes.length];
  if (ra.o || rb.i) { refSeg = null; return flash('The reference segment is no longer straight.'); }
  edit(() => {
    const ref = Math.atan2(rb.y - ra.y, rb.x - ra.x), cur = Math.atan2(b.y - a.y, b.x - a.x);
    const diff = x => Math.abs(Math.atan2(Math.sin(x - cur), Math.cos(x - cur)));
    const t = diff(ref) <= diff(ref + Math.PI) ? ref : ref + Math.PI;
    const len = Math.hypot(b.x - a.x, b.y - a.y), ux = Math.cos(t) * len, uy = Math.sin(t) * len;
    if (a === ra || a === rb) moveNodeTo(b, a.x + ux, a.y + uy);
    else if (b === ra || b === rb) moveNodeTo(a, b.x - ux, b.y - uy);
    else { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; moveNodeTo(a, mx - ux / 2, my - uy / 2); moveNodeTo(b, mx + ux / 2, my + uy / 2); }
  });
  refSeg = null; flash('Made parallel.');
}
function cornerOp(type, keys, r) {
  const m = new Map();
  for (const k of keys) { const [ci, ni] = unkey(k); if (!m.has(ci)) m.set(ci, new Set()); m.get(ci).add(ni); }
  let done = 0, skipped = 0; const newSel = new Set();
  G().contours.forEach((c, ci) => {
    const S = m.get(ci); if (!S) return;
    const L = c.nodes.length, out = [];
    c.nodes.forEach((n, ni) => {
      const hasP = c.closed || ni > 0, hasN = c.closed || ni < L - 1;
      if (!S.has(ni)) { out.push(n); return; }
      if (!hasP || !hasN) { skipped++; out.push(n); return; }
      const pi = (ni - 1 + L) % L, qi = (ni + 1) % L, p = c.nodes[pi], q = c.nodes[qi];
      const l1 = Math.hypot(p.x - n.x, p.y - n.y), l2 = Math.hypot(q.x - n.x, q.y - n.y);
      if (p.o || n.i || n.o || q.i || l1 < 1e-6 || l2 < 1e-6) { skipped++; out.push(n); return; }
      const u1 = { x: (p.x - n.x) / l1, y: (p.y - n.y) / l1 }, u2 = { x: (q.x - n.x) / l2, y: (q.y - n.y) / l2 };
      const th = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
      if (th > Math.PI - 1e-3 || th < 1e-3) { skipped++; out.push(n); return; }
      const dm = Math.min(l1 * (S.has(pi) ? .5 : .999), l2 * (S.has(qi) ? .5 : .999));
      let d, rr = r;
      if (type === 'fillet') { d = r / Math.tan(th / 2); if (d > dm) { d = dm; rr = d * Math.tan(th / 2); } }
      else d = Math.min(r, dm);
      const A = N(n.x + u1.x * d, n.y + u1.y * d), B = N(n.x + u2.x * d, n.y + u2.y * d);
      if (type === 'fillet') {
        const h = 4 / 3 * Math.tan((Math.PI - th) / 4) * rr;
        A.o = { x: A.x - u1.x * h, y: A.y - u1.y * h }; B.i = { x: B.x - u2.x * h, y: B.y - u2.y * h }; A.fil = true;
      }
      newSel.add(key(ci, out.length)); newSel.add(key(ci, out.length + 1));
      out.push(A, B); done++;
    });
    c.nodes = out;
  });
  sel = newSel.size ? newSel : sel;
  return { done, skipped };
}
function cornerNote(type, res) {
  const n = $('#cnote');
  n.className = `note${res.done ? '' : ' err'}`;
  n.textContent = res.done
    ? `${type === 'fillet' ? 'Filleted' : 'Chamfered'} ${res.done} corner${res.done > 1 ? 's' : ''}. Change the radius to adjust.${res.skipped ? ` Skipped ${res.skipped} (curved neighbours or open ends).` : ''}`
    : 'No corners changed. Corners need straight lines on both sides.';
}
function applyCorner(type) {
  if (!sel.size) { flash('Select corner points first.'); return; }
  const before = snapshot(), keys = [...sel];
  const res = cornerOp(type, keys, cornerR);
  cornerNote(type, res);
  if (!res.done) { render(); return; }
  commit(before); active = null;
  lastCorner = { before, keys, type, gi: cur, after: snapshot() };
  render();
}
function startCorner(type) {
  if (cornerMode) return;
  if (!sel.size) { flash('Select corner points first.'); return; }
  const keys = [...sel], before = snapshot();
  let ref = nodeOf(keys[0]);
  if (hover) { let bd = Infinity; for (const k of keys) { const n = nodeOf(k), d = Math.hypot(n.x - hover.x, n.y - hover.y); if (d < bd) { bd = d; ref = n; } } }
  cornerMode = { type, keys, before, gi: cur, ref: { x: ref.x, y: ref.y }, r: cornerR };
  const res = cornerOp(type, keys, cornerR);
  if (!res.done) { font = JSON.parse(before); sel = new Set(keys); cornerMode = null; cornerNote(type, res); render(); return; }
  $('#cnote').className = 'note'; $('#cnote').textContent = 'Move to set the size, click or Enter to apply, Esc to cancel.';
  render();
}
function updateCorner(r) {
  const m = cornerMode; m.r = r; cornerR = r;
  font = JSON.parse(m.before); cornerOp(m.type, m.keys, r);
  $('#crad').value = r; render();
}
function finishCorner(ok) {
  const m = cornerMode; if (!m) return; cornerMode = null;
  if (!ok) { font = JSON.parse(m.before); sel = new Set(m.keys); $('#cnote').textContent = 'Cancelled.'; render(); return; }
  commit(m.before); active = null;
  lastCorner = { before: m.before, keys: m.keys, type: m.type, gi: m.gi, after: snapshot() };
  $('#cnote').textContent = `${m.type === 'fillet' ? 'Filleted' : 'Chamfered'} at ${m.r}. Change the radius to adjust.`;
  render();
}
$('#bFillet').onclick = () => startCorner('fillet');
$('#bChamfer').onclick = () => startCorner('chamfer');
$('#crad').oninput = e => {
  const v = parseFloat(e.target.value); if (!isFinite(v) || v < 0) return;
  if (cornerMode) { updateCorner(v); return; }
  cornerR = v;
  if (lastCorner && lastCorner.gi === cur && snapshot() === lastCorner.after) {
    font = JSON.parse(lastCorner.before);
    const res = cornerOp(lastCorner.type, lastCorner.keys, v);
    cornerNote(lastCorner.type, res);
    lastCorner.after = snapshot(); save(); render();
  }
};
function placeHandle(n, h, p, alt) {
  n[h] = p; if (alt) n.s = false;
  const oh = h === 'i' ? 'o' : 'i';
  if (n.s && n[oh]) {
    const len = Math.hypot(n[oh].x - n.x, n[oh].y - n.y), dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy) || 1;
    n[oh] = { x: n.x + dx / d * len, y: n.y + dy / d * len };
  }
}
function setArm(on) {
  if (!hoverH) {
    if (on) flash('Hover a control point and press + to arm it.');
    else if (armed.size) { armed.clear(); flash('Disarmed all control points.'); }
    return;
  }
  if (on) armed.add(hoverH); else armed.delete(hoverH);
  flash(armed.size ? `${armed.size} control point${armed.size > 1 ? 's' : ''} armed: they move along with the one you drag. − disarms, Esc clears.` : 'Disarmed.');
}
function toggleSelectedSegs() {
  const m = selByContour(); let any = false; const b = snapshot();
  for (const [ci, nis] of m) {
    const c = G().contours[ci];
    for (const ai of segments(c)) {
      const bi = (ai + 1) % c.nodes.length;
      if (!nis.includes(ai) || !nis.includes(bi)) continue;
      const a = c.nodes[ai], n = c.nodes[bi]; any = true;
      if (a.o || n.i) { a.o = null; n.i = null; }
      else { const dx = n.x - a.x, dy = n.y - a.y; a.o = { x: R(a.x + dx / 3), y: R(a.y + dy / 3) }; n.i = { x: R(a.x + dx * 2 / 3), y: R(a.y + dy * 2 / 3) }; }
    }
  }
  G().contours.forEach(c => c.nodes.forEach(n => { if (!n.i || !n.o) n.s = false; }));
  commit(b); render(); return any;
}
cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (cornerMode) return;
  const { sx, sy } = local(e), h = hit(sx, sy);
  if (h && h.type === 'seg') toggleSeg(h.ci, h.ni);
});

/* ---------- point / contour ops ---------- */
function selByContour() { const m = new Map(); for (const k of sel) { const [ci, ni] = unkey(k); if (!m.has(ci)) m.set(ci, []); m.get(ci).push(ni); } return m; }
function targetContours() { const s = new Set(selByContour().keys()); if (active !== null) s.add(active); return [...s]; }
function deleteSelected() {
  if (!sel.size) return;
  edit(() => {
    const g = G(), m = selByContour();
    g.contours.forEach((c, ci) => { const del = m.get(ci); if (del) c.nodes = c.nodes.filter((_, i) => !del.includes(i)); });
    g.contours = g.contours.filter(c => c.nodes.length >= 2);
    sel.clear(); active = null;
  });
}
function setType(type) {
  edit(() => {
    for (const k of sel) {
      const [ci, ni] = unkey(k), c = G().contours[ci], n = c.nodes[ni];
      if (type === 'sharp') { n.i = n.o = null; n.s = false; }
      else if (type === 'free') { if (!n.i && !n.o) autoSmooth(c, ni); n.s = false; }
      else { if (!n.i || !n.o) autoSmooth(c, ni); else alignHandles(n); n.s = true; }
    }
  });
}
function nudge(dx, dy) {
  if (!sel.size) return;
  edit(() => { for (const k of sel) { const n = nodeOf(k); n.x += dx; n.y += dy; for (const h of ['i', 'o']) if (n[h]) { n[h].x += dx; n[h].y += dy; } } });
}

$('#pSharp').onclick = () => setType('sharp');
$('#pSmooth').onclick = () => setType('smooth');
$('#pFree').onclick = () => setType('free');
$('#pDel').onclick = deleteSelected;
$('#cClose').onclick = () => edit(() => { for (const ci of targetContours()) { const c = G().contours[ci]; c.closed = !c.closed; if (ci === active) active = null; } });
$('#cRev').onclick = () => edit(() => {
  const t = targetContours();
  for (const ci of t) reverseContour(G().contours[ci]);
  sel = new Set([...sel].map(k => { const [ci, ni] = unkey(k); return t.includes(ci) ? key(ci, G().contours[ci].nodes.length - 1 - ni) : k; }));
});
function nodeField(axis) {
  return e => {
    const v = parseFloat(e.target.value); if (!isFinite(v) || sel.size !== 1) return;
    edit(() => { const n = nodeOf([...sel][0]), d = v - n[axis]; n[axis] = v; for (const h of ['i', 'o']) if (n[h]) n[h][axis] += d; });
  };
}
$('#nx').onchange = nodeField('x'); $('#ny').onchange = nodeField('y');

/* ---------- glyph ops ---------- */
function freeId() {
  const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');
  for (const id of pool) if (!font.glyphs.some(g => g.id === id)) return id;
  let n = 1; while (font.glyphs.some(g => g.id === `glyph${n}`)) n++; return `glyph${n}`;
}
$('#bAdd').onclick = () => {
  edit(() => { font.glyphs.push({ id: freeId(), adv: 600, contours: [] }); cur = font.glyphs.length - 1; sel.clear(); active = null; });
  fit(); tool = 'pen'; render(); $('#gid').focus(); $('#gid').select();
};
$('#bDup').onclick = () => {
  edit(() => {
    const g = clone(G()); let id = `${g.id}.alt`, n = 2;
    while (font.glyphs.some(x => x.id === id)) id = `${g.id}.alt${n++}`;
    g.id = id; font.glyphs.splice(cur + 1, 0, g); cur++; sel.clear(); active = null;
  });
};
let delArm = 0;
$('#bDelG').onclick = () => {
  const b = $('#bDelG');
  if (font.glyphs.length < 2) { $('#gidnote').className = 'note err'; $('#gidnote').textContent = 'Keep at least one glyph.'; return; }
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = `Delete “${G().id}”?`; clearTimeout(delArm); delArm = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Delete glyph'; }, 3000); return; }
  clearTimeout(delArm); b.classList.remove('armed'); b.textContent = 'Delete glyph';
  edit(() => { font.glyphs.splice(cur, 1); cur = Math.min(cur, font.glyphs.length - 1); sel.clear(); active = null; });
  fit(); render();
};
$('#gid').onchange = e => {
  const v = e.target.value.trim(), note = $('#gidnote');
  if (!v || /\s|\//.test(v)) { note.className = 'note err'; note.textContent = 'IDs need at least one character and no spaces or slashes.'; e.target.value = G().id; return; }
  if (font.glyphs.some((g, gi) => gi !== cur && g.id === v)) { note.className = 'note err'; note.textContent = `“${v}” is already used by another glyph.`; e.target.value = G().id; return; }
  note.className = 'note'; note.textContent = v.length > 1 ? `Type /${v} in the proof line to use it.` : '';
  edit(() => { G().id = v; });
};
$('#gadv').onchange = e => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 0) edit(() => { G().adv = v; }); };
$('#glist').onclick = e => { const b = e.target.closest('[data-gi]'); if (b) selectGlyph(+b.dataset.gi); };

for (const [id, k] of [['#mCap', 'cap'], ['#mXh', 'xh'], ['#mBase', 'base'], ['#mDesc', 'desc']])
  $(id).onchange = e => { const v = parseFloat(e.target.value); if (isFinite(v)) edit(() => { font.metrics[k] = v; }); };

/* ---------- path data editing ---------- */
let dBefore = null;
$('#dtext').onfocus = () => { dBefore = snapshot(); };
$('#dtext').oninput = e => {
  const note = $('#dnote');
  hlD();
  try {
    const cs = parseD(e.target.value);
    G().contours = cs; sel.clear(); active = null;
    note.className = 'note'; note.textContent = `${cs.length} contour${cs.length === 1 ? '' : 's'} parsed.`;
    renderCanvas(); renderList(); renderPreview(); save();
  } catch (err) { note.className = 'note err'; note.textContent = err.message; }
};
$('#dtext').onblur = () => { if (dBefore !== null) commit(dBefore); dBefore = null; render(); };

async function copyText(text, noteEl, okMsg, fallbackEl) {
  try { await navigator.clipboard.writeText(text); noteEl.className = 'note'; noteEl.textContent = okMsg; }
  catch (e) {
    if (fallbackEl) { fallbackEl.value = text; fallbackEl.focus(); fallbackEl.select(); }
    noteEl.className = 'note'; noteEl.textContent = 'Clipboard is blocked here. The text is selected; press Ctrl+C.';
  }
}
$('#bCopyD').onclick = () => copyText(glyphD(G()), $('#dnote'), `Copied the path data for “${G().id}”.`, $('#dtext'));

/* ---------- export / import ---------- */
function bbox(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) if (it.g) for (const c of it.g.contours) for (const ai of segments(c).concat(c.closed ? [] : [])) {
    const Q = cub(c.nodes[ai], c.nodes[(ai + 1) % c.nodes.length]);
    for (let s = 0; s <= 24; s++) { const p = bz(Q, s / 24); x0 = Math.min(x0, p.x + it.x); x1 = Math.max(x1, p.x + it.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  }
  return isFinite(x0) ? { x: R(x0), y: R(y0), w: R(x1 - x0), h: R(y1 - y0) } : { x: 0, y: 0, w: 100, h: 100 };
}
const xmlId = id => /^[A-Za-z_][\w.\-]*$/.test(id) ? id : `g-${id.replace(/[^\w.\-]/g, '_')}`;
function svgDefs() {
  const { items } = layout(ptext), b = bbox(items), used = [...new Set(items.filter(i => i.g).map(i => i.gi))];
  const defs = used.map(gi => `    <path id="${esc(xmlId(font.glyphs[gi].id))}" d="${glyphD(font.glyphs[gi])}"/>`).join('\n');
  const uses = items.filter(i => i.g).map(i => `  <use href="#${esc(xmlId(i.g.id))}" x="${R(i.x)}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" fill="currentColor" fill-rule="evenodd">\n  <defs>\n${defs}\n  </defs>\n${uses}\n</svg>`;
}
function svgFlat() {
  const { items } = layout(ptext), b = bbox(items);
  const paths = items.filter(i => i.g).map(i => `  <path data-glyph="${esc(i.g.id)}" transform="translate(${R(i.x)} 0)" d="${glyphD(i.g)}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" fill="currentColor" fill-rule="evenodd">\n${paths}\n</svg>`;
}
$('#bCopySvg').onclick = () => copyText(svgDefs(), $('#pnote'), 'Copied SVG of the proof line (glyphs as <defs> paths placed with <use>).', null);
const io = $('#iotext'), ionote = $('#ionote');
const ioMsg = (t, err) => { ionote.className = `note${err ? ' err' : ''}`; ionote.textContent = t; };
$('#bIO').onclick = () => { $('#modal').hidden = false; io.value = JSON.stringify(font, null, 1); ioMsg('Project JSON. Loading JSON replaces everything; loading SVG adds each <path> as a glyph named by its id.'); };
$('#ioClose').onclick = () => { $('#modal').hidden = true; };
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };
$('#ioJson').onclick = () => { io.value = JSON.stringify(font, null, 1); ioMsg('Project JSON: all glyphs, metrics and spacing.'); };
$('#ioSvgDefs').onclick = () => { io.value = svgDefs(); ioMsg(`SVG of the proof line “${ptext}”, each glyph defined once with its id.`); };
$('#ioSvgFlat').onclick = () => { io.value = svgFlat(); ioMsg(`SVG of the proof line “${ptext}”, one path per letter.`); };
$('#ioCopy').onclick = () => copyText(io.value, ionote, 'Copied.', io);
function loadText(t) {
  t = t.trim();
  if (!t) return ioMsg('Paste project JSON or SVG first.', true);
  if (t[0] === '{') {
    let f; try { f = JSON.parse(t); } catch (e) { return ioMsg(`That JSON doesn’t parse: ${e.message}`, true); }
    if (!f || !Array.isArray(f.glyphs) || !f.glyphs.length) return ioMsg('That JSON has no glyphs list.', true);
    edit(() => {
      font = Object.assign(sampleFont(), f); font.metrics = Object.assign({ cap: 100, xh: 340, base: 800, desc: 960 }, f.metrics);
      cur = 0; sel.clear(); active = null;
    });
    fit(); render(); return ioMsg(`Loaded ${font.glyphs.length} glyphs.`);
  }
  if (t[0] === '<') {
    const doc = new DOMParser().parseFromString(t, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return ioMsg('That SVG doesn’t parse.', true);
    const paths = [...doc.querySelectorAll('path')];
    if (!paths.length) return ioMsg('No <path> elements found.', true);
    let added = 0, failed = [];
    const b = snapshot();
    paths.forEach((p, n) => {
      const id = p.getAttribute('id') || p.getAttribute('data-glyph') || `import${n + 1}`;
      try {
        const cs = parseD(p.getAttribute('d') || '');
        let mx = 0; cs.forEach(c => c.nodes.forEach(nd => { mx = Math.max(mx, nd.x); }));
        const g = { id, adv: Math.ceil((mx + 40) / 10) * 10, contours: cs }, at = font.glyphs.findIndex(x => x.id === id);
        if (at >= 0) font.glyphs[at] = g; else font.glyphs.push(g);
        added++;
      } catch (e) { failed.push(`${id}: ${e.message}`); }
    });
    commit(b); sel.clear(); active = null; render();
    return ioMsg(`Imported ${added} glyph${added === 1 ? '' : 's'}.${failed.length ? ` Skipped ${failed.join('; ')}` : ''}`, failed.length > 0);
  }
  ioMsg('Paste project JSON (starts with {) or SVG (starts with <).', true);
}
$('#ioLoad').onclick = () => loadText(io.value);
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileBase = () => (ptext.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'logo');
$('#ioDlJson').onclick = () => download(`${(font.name || 'glyphpath').replace(/[^\w.-]+/g, '_')}.json`, JSON.stringify(font, null, 1), 'application/json');
$('#ioDlSvg').onclick = () => download(`${fileBase()}.svg`, svgDefs(), 'image/svg+xml');
$('#ioSaveSvg').onclick = async () => {
  const name = `${fileBase()}.svg`;
  try {
    const r = await fetch(`api/export/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'content-type': 'image/svg+xml' }, body: svgDefs() });
    ioMsg(r.ok ? `Saved exports/${name} in the project folder.` : `Saving failed (${r.status}).`, !r.ok);
  } catch (e) { ioMsg('The server isn’t reachable.', true); }
};
$('#iofile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { io.value = r.result; loadText(r.result); e.target.value = ''; }; r.readAsText(f);
};

/* ---------- preview controls ---------- */
$('#ptext').oninput = e => { ptext = e.target.value; renderPreview(); save(); };
$('#ptrack').onchange = e => { const v = parseFloat(e.target.value); if (isFinite(v)) edit(() => { font.tracking = v; }); };
$('#pspace').onchange = e => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 0) edit(() => { font.space = v; }); };
$('#pview').onclick = e => { const p = e.target.closest('[data-gi]'); if (p) selectGlyph(+p.dataset.gi); };

/* ---------- toolbar ---------- */
function setTool(t) { tool = t; if (t === 'select') active = null; render(); }
$('#tSelect').onclick = () => setTool('select');
$('#tPen').onclick = () => setTool('pen');
$('#bUndo').onclick = undo; $('#bRedo').onclick = redo;
$('#bFit').onclick = () => { fit(); render(); };
$('#bZin').onclick = () => { zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.25); render(); };
$('#bZout').onclick = () => { zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, .8); render(); };
$('#snap').onchange = e => { snapOn = e.target.checked; save(); };
$('#parOn').onchange = e => { parOn = e.target.checked; render(); };
$('#grid').onchange = e => { const v = parseFloat(e.target.value); if (v > 0) { gridSize = v; save(); render(); } };

const keysDlg = $('#keysdlg');
function showKeys(on) { keysDlg.hidden = !on; }
$('#bKeys').onclick = () => showKeys(keysDlg.hidden);
$('#kClose').onclick = () => showKeys(false);
keysDlg.onclick = e => { if (e.target === keysDlg) showKeys(false); };
window.addEventListener('keydown', e => {
  if (!keysDlg.hidden) { if (['Escape', 'h', 'H'].includes(e.key)) { e.preventDefault(); showKeys(false); } return; }
  if (!$('#modal').hidden) { if (e.key === 'Escape') $('#modal').hidden = true; return; }
  if (e.target.closest('input,textarea,select')) return;
  if (cornerMode) { if (e.key === 'Escape') finishCorner(false); else if (e.key === 'Enter') finishCorner(true); e.preventDefault(); return; }
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k.toLowerCase() === 'c') { e.preventDefault(); copySel(false); return; }
  if (mod && k.toLowerCase() === 'x') { e.preventDefault(); copySel(true); return; }
  if (mod && k.toLowerCase() === 'v') { pasteHandled = false; setTimeout(() => { if (!pasteHandled) pasteClip(); }, 60); return; }
  if (mod && k.toLowerCase() === 'a') { e.preventDefault(); sel = new Set(); G().contours.forEach((c, ci) => c.nodes.forEach((_, ni) => sel.add(key(ci, ni)))); render(); return; }
  if (mod) return;
  if (k === ' ') { e.preventDefault(); if (!spaceDown) { spaceDown = true; cv.style.cursor = 'grab'; } return; }
  if (k === 'v' || k === 'V') setTool('select');
  else if (k === 'p' || k === 'P') setTool('pen');
  else if (k === 'f' || k === 'F') { fit(); render(); }
  else if (k === 'h' || k === 'H') showKeys(true);
  else if (k === 'c' || k === 'C') {
    if (active === null && !sel.size) flash('Select a point on a contour (or draw with the pen) to close it.');
    else $('#cClose').onclick();
  }
  else if (k === 'l' || k === 'L') lineKey(hoverS && hit(hoverS.sx, hoverS.sy));
  else if (k === 'r' || k === 'R') startCorner('fillet');
  else if (k === 'k' || k === 'K') startCorner('chamfer');
  else if (k === 'b' || k === 'B') {
    const h = hoverS && hit(hoverS.sx, hoverS.sy);
    if (h && h.type === 'seg') toggleSeg(h.ci, h.ni); else toggleSelectedSegs();
  }
  else if (k === '+' || k === '=') setArm(true);
  else if (k === '-' || k === '_') setArm(false);
  else if (k === 'Escape') { if (armed.size) { armed.clear(); render(); return; } focusSeg = null; focusFil = null; if (refSeg) refSeg = null; else if (active !== null) active = null; else sel.clear(); render(); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelected(); }
  else if (k === '[') selectGlyph(cur - 1);
  else if (k === ']') selectGlyph(cur + 1);
  else if (k.startsWith('Arrow')) {
    e.preventDefault(); const d = e.shiftKey ? 10 : 1;
    nudge(k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0);
  }
});
window.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; cv.style.cursor = ''; } });
window.addEventListener('blur', () => { spaceDown = false; });

/* ---------- copy / paste ---------- */
let clip = null, pasteHandled = false;
function copySel(cut) {
  const g = G(), whole = !sel.size;
  const cis = whole ? g.contours.map((_, i) => i) : [...selByContour().keys()];
  if (!cis.length) { flash('Nothing to copy: this glyph is empty.'); return; }
  const contours = cis.map(ci => clone(g.contours[ci]));
  clip = { contours, adv: g.adv, from: cur, d: contours.map(contourD).join(' ') };
  try { navigator.clipboard.writeText(clip.d).catch(() => {}); } catch (e) {}
  if (cut) edit(() => { g.contours = g.contours.filter((_, i) => !cis.includes(i)); sel.clear(); active = null; });
  flash(`${cut ? 'Cut' : 'Copied'} ${whole ? `all of “${g.id}”` : `${contours.length} contour${contours.length > 1 ? 's' : ''}`}. Ctrl+V pastes into any glyph.`);
}
function pasteContours(cs, adv, fromClip) {
  const off = fromClip && clip.from === cur && G().contours.length > 0 ? gridSize * 2 : 0;
  edit(() => {
    const g = G(), add = clone(cs);
    if (off) add.forEach(c => c.nodes.forEach(n => moveNodeTo(n, n.x + off, n.y + off)));
    if (!g.contours.length && adv) g.adv = adv;
    const start = g.contours.length; g.contours.push(...add);
    sel = new Set(); add.forEach((c, k) => c.nodes.forEach((_, ni) => sel.add(key(start + k, ni))));
    active = null; focusSeg = null; focusFil = null;
  });
  flash(`Pasted ${cs.length} contour${cs.length > 1 ? 's' : ''} into “${G().id}”.`);
}
function pasteClip() { if (clip) pasteContours(clip.contours, clip.adv, true); else flash('Nothing copied yet.'); }
document.addEventListener('paste', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (!$('#modal').hidden) return;
  pasteHandled = true;
  const t = (e.clipboardData?.getData('text') || '').trim();
  e.preventDefault();
  if (!t || (clip && t === clip.d)) { pasteClip(); return; }
  try {
    const cs = t[0] === '<'
      ? [...new DOMParser().parseFromString(t, 'image/svg+xml').querySelectorAll('path')].flatMap(p => parseD(p.getAttribute('d') || ''))
      : parseD(t);
    if (!cs.length) throw Error('no contours found');
    pasteContours(cs, 0, false);
  } catch (err) { flash(`The clipboard doesn’t hold path data (${err.message}).`); }
});
$('#bCopyG').onclick = () => copySel(false);
$('#bPasteG').onclick = pasteClip;

// Mouse clicks shouldn't leave buttons focused: it shows a focus ring and swallows shortcut keys.
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

/* ---------- boot ---------- */
let fitted = false;
await load();
setSaveState(serverOk ? 'saved' : 'saved in browser');
$('#ioSaveSvg').hidden = !serverOk;
new ResizeObserver(() => { if (!fitted && cv.clientWidth) { fit(); fitted = true; } render(); }).observe(cv);
render();
