import test from 'node:test';
import assert from 'node:assert/strict';
import { inkMask, boundaryLoops, loopArea, traceMask } from '../public/trace.js';

// Synthetic bitmaps: f(x, y) → true for ink.
const bitmap = (w, h, f) => { const m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = f(x + .5, y + .5) ? 1 : 0; return m; };
const distToContour = (c, p) => {
  // Sample the contour densely and return the nearest distance.
  let best = Infinity;
  const ns = c.nodes, L = ns.length;
  for (let k = 0; k < L; k++) {
    const a = ns[k], b = ns[(k + 1) % L], Q = [a, a.o || a, b.i || b, b];
    for (let s = 0; s <= 40; s++) {
      const t = s / 40, u = 1 - t;
      const x = u * u * u * Q[0].x + 3 * u * u * t * Q[1].x + 3 * u * t * t * Q[2].x + t * t * t * Q[3].x;
      const y = u * u * u * Q[0].y + 3 * u * u * t * Q[1].y + 3 * u * t * t * Q[2].y + t * t * t * Q[3].y;
      best = Math.min(best, Math.hypot(x - p.x, y - p.y));
    }
  }
  return best;
};

test('ink mask: dark by threshold, transparency is background, region limits it', () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 10, 10, 10, 255]);
  assert.deepEqual([...inkMask(rgba, 4, 1)], [1, 0, 0, 1]);
  assert.deepEqual([...inkMask(rgba, 4, 1, { light: true })], [0, 1, 0, 0]);
  assert.deepEqual([...inkMask(rgba, 4, 1, { region: new Uint8Array([0, 1, 1, 1]) })], [0, 0, 0, 1]);
});

test('a filled square traces to 4 straight sides on its pixel edges', () => {
  const m = bitmap(40, 40, (x, y) => x > 10 && x < 30 && y > 10 && y < 30);
  const [c, ...rest] = traceMask(m, 40, 40);
  assert.equal(rest.length, 0);
  assert.equal(c.nodes.length, 4);
  assert.ok(c.nodes.every(n => !n.i && !n.o), 'all straight');
  const xs = c.nodes.map(n => n.x).sort((a, b) => a - b), ys = c.nodes.map(n => n.y).sort((a, b) => a - b);
  assert.deepEqual([xs[0], xs[3], ys[0], ys[3]], [10, 30, 10, 30]);
});

test('a ring gives an outline and a hole, wound opposite ways', () => {
  const m = bitmap(80, 80, (x, y) => { const r = Math.hypot(x - 40, y - 40); return r < 30 && r > 15; });
  const loops = boundaryLoops(m, 80, 80);
  assert.equal(loops.length, 2);
  assert.ok(Math.sign(loopArea(loops[0])) !== Math.sign(loopArea(loops[1])));
  assert.equal(traceMask(m, 80, 80).length, 2);
});

test('a disc becomes a few smooth curves that stay on the circle', () => {
  const m = bitmap(120, 120, (x, y) => Math.hypot(x - 60, y - 60) < 40);
  const [c] = traceMask(m, 120, 120);
  assert.ok(c.nodes.length >= 2 && c.nodes.length <= 12, `nodes: ${c.nodes.length}`);
  assert.ok(c.nodes.every(n => n.i && n.o), 'all curved');
  for (let a = 0; a < 360; a += 15) {
    const p = { x: 60 + 40 * Math.cos(a * Math.PI / 180), y: 60 + 40 * Math.sin(a * Math.PI / 180) };
    assert.ok(distToContour(c, p) < 1.6, `off the circle at ${a}°`);
  }
});

test('specks below the minimum area are dropped', () => {
  const m = bitmap(50, 50, (x, y) => (x > 5 && x < 25 && y > 5 && y < 25) || (x > 40 && x < 42 && y > 40 && y < 42));
  assert.equal(traceMask(m, 50, 50, { minArea: 12 }).length, 1);
  assert.equal(traceMask(m, 50, 50, { minArea: 1 }).length, 2);
});
