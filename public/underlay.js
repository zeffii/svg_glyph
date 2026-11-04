// Underlay placement maths. Pure functions, no DOM, shared with the tests.
//
// An underlay is an image placed behind a glyph or drawing:
//   { img, name, iw, ih,      image id in the browser store, file name, pixel size
//     bx, by,                 basepoint, in image pixels
//     x, y,                   where the basepoint sits in the world (glyph units)
//     rot, s,                 rotation in degrees and scale, both around the basepoint
//     op, inv, vis }          opacity 0..1, invert colours, visible
//
// Image pixel (u, v) lands in the world at:  P = (x, y) + R(rot) · s · ((u, v) − (bx, by))

const rad = d => d * Math.PI / 180;

export function ulToWorld(ul, u, v) {
  const a = rad(ul.rot), c = Math.cos(a), s = Math.sin(a);
  const dx = (u - ul.bx) * ul.s, dy = (v - ul.by) * ul.s;
  return { x: ul.x + c * dx - s * dy, y: ul.y + s * dx + c * dy };
}

export function ulToImage(ul, p) {
  const a = rad(ul.rot), c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - ul.x, dy = p.y - ul.y;
  return { x: ul.bx + (c * dx + s * dy) / ul.s, y: ul.by + (-s * dx + c * dy) / ul.s };
}

// Move the basepoint to world point p without moving the image.
export function ulSetBase(ul, p) {
  const q = ulToImage(ul, p);
  return { ...ul, bx: q.x, by: q.y, x: p.x, y: p.y };
}

// SVG transform for an <image x=0 y=0 width=iw height=ih> drawn in world space.
export const ulTransform = ul => `translate(${ul.x} ${ul.y}) rotate(${ul.rot}) scale(${ul.s}) translate(${-ul.bx} ${-ul.by})`;

export const ulCorners = ul => [[0, 0], [ul.iw, 0], [ul.iw, ul.ih], [0, ul.ih]].map(([u, v]) => ulToWorld(ul, u, v));

export function ulHit(ul, p) {
  const q = ulToImage(ul, p);
  return q.x >= 0 && q.y >= 0 && q.x <= ul.iw && q.y <= ul.ih;
}

// Centre the image in a frame { x, y, w, h }, upright, scaled to fit, basepoint at the image centre.
export function ulFit(ul, frame) {
  const s = Math.min(frame.w / ul.iw, frame.h / ul.ih);
  return { ...ul, bx: ul.iw / 2, by: ul.ih / 2, x: frame.x + frame.w / 2, y: frame.y + frame.h / 2, rot: 0, s };
}

export function newUnderlay(img, name, iw, ih, frame) {
  return ulFit({ img, name, iw, ih, bx: 0, by: 0, x: 0, y: 0, rot: 0, s: 1, op: 0.5, inv: false, vis: true }, frame);
}
