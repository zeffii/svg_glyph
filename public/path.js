// Pure path-data helpers: the node model <-> SVG `d` strings. Shared by the app and the tests.
export const R = v => (Math.round(v * 10) / 10) || 0;
export const P = p => `${R(p.x)} ${R(p.y)}`;
export const N = (x, y) => ({ x, y, i: null, o: null, s: false });

export function contourD(c) {
  const ns = c.nodes; if (!ns.length) return '';
  const seg = (a, b) => (a.o || b.i) ? ` C${P(a.o || a)} ${P(b.i || b)} ${P(b)}` : ` L${P(b)}`;
  let d = `M${P(ns[0])}`;
  for (let k = 1; k < ns.length; k++) d += seg(ns[k - 1], ns[k]);
  if (c.closed && ns.length > 1) { const a = ns[ns.length - 1], b = ns[0]; if (a.o || b.i) d += seg(a, b); d += ' Z'; }
  return d;
}
export const glyphD = g => g.contours.map(contourD).filter(Boolean).join(' ');

export function parseD(d) {
  if (/[^MmLlHhVvCcSsQqTtZzAa0-9eE+\-.,\s]/.test(d)) throw Error('Unexpected character in path data.');
  if (/[Aa]/.test(d.replace(/[eE][+-]?\d/g, ''))) throw Error('Arc (A) commands aren’t supported yet.');
  const re = /([MmLlHhVvCcSsQqTtZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  const toks = []; let m;
  while ((m = re.exec(d))) toks.push(m[1] ? { c: m[1] } : { n: parseFloat(m[2]) });
  const cs = []; let c = null, cx = 0, cy = 0, sx = 0, sy = 0, pc = null, pq = null, cmd = null, i = 0;
  const num = () => { const t = toks[i]; if (!t || t.n === undefined) throw Error(`Command ${cmd} is missing numbers.`); i++; return t.n; };
  const ensure = () => { if (!c) { c = { closed: false, nodes: [N(cx, cy)] }; cs.push(c); } };
  const last = () => c.nodes[c.nodes.length - 1];
  const curve = (x1, y1, x2, y2, x, y) => { ensure(); last().o = { x: x1, y: y1 }; const n = N(x, y); n.i = { x: x2, y: y2 }; c.nodes.push(n); };
  while (i < toks.length) {
    if (toks[i].c) { cmd = toks[i].c; i++; }
    else if (!cmd) throw Error(i ? 'Numbers after Z need a command.' : 'Path data must start with M.');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    let x = cx, y = cy, npc = null, npq = null;
    switch (C) {
      case 'Z':
        if (c) {
          c.closed = true; const ns = c.nodes;
          if (ns.length > 1) { const a = ns[ns.length - 1], b = ns[0]; if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01) { b.i = a.i; ns.pop(); } }
        }
        c = null; cx = sx; cy = sy; pc = pq = null; cmd = null; continue;
      case 'M': x = num() + ox; y = num() + oy; c = { closed: false, nodes: [N(x, y)] }; cs.push(c); sx = x; sy = y; cmd = rel ? 'l' : 'L'; break;
      case 'L': x = num() + ox; y = num() + oy; ensure(); c.nodes.push(N(x, y)); break;
      case 'H': x = num() + ox; ensure(); c.nodes.push(N(x, y)); break;
      case 'V': y = num() + oy; ensure(); c.nodes.push(N(x, y)); break;
      case 'C': { const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy; x = num() + ox; y = num() + oy; curve(x1, y1, x2, y2, x, y); npc = { x: x2, y: y2 }; break; }
      case 'S': { const r = pc ? { x: 2 * cx - pc.x, y: 2 * cy - pc.y } : { x: cx, y: cy }; const x2 = num() + ox, y2 = num() + oy; x = num() + ox; y = num() + oy; curve(r.x, r.y, x2, y2, x, y); npc = { x: x2, y: y2 }; break; }
      case 'Q': case 'T': {
        const q = C === 'Q' ? { x: num() + ox, y: num() + oy } : (pq ? { x: 2 * cx - pq.x, y: 2 * cy - pq.y } : { x: cx, y: cy });
        x = num() + ox; y = num() + oy;
        curve(cx + 2 / 3 * (q.x - cx), cy + 2 / 3 * (q.y - cy), x + 2 / 3 * (q.x - x), y + 2 / 3 * (q.y - y), x, y); npq = q; break;
      }
    }
    pc = npc; pq = npq; cx = x; cy = y;
  }
  const out = cs.filter(k => k.nodes.length >= 2);
  out.forEach(k => k.nodes.forEach(n => { n.s = isAligned(n); }));
  return out;
}
export function isAligned(n) {
  if (!n.i || !n.o) return false;
  const ax = n.i.x - n.x, ay = n.i.y - n.y, bx = n.o.x - n.x, by = n.o.y - n.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (la < 1e-6 || lb < 1e-6) return false;
  return Math.abs(ax * by - ay * bx) / (la * lb) < 0.02 && ax * bx + ay * by < 0;
}
