import test from 'node:test';
import assert from 'node:assert/strict';
import { ulToWorld, ulToImage, ulSetBase, ulCorners, ulHit, ulFit, newUnderlay } from '../public/underlay.js';

const near = (a, b, msg) => {
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `${msg}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
};
const ul = { iw: 400, ih: 200, bx: 100, by: 50, x: 300, y: 500, rot: 30, s: 1.5 };

test('basepoint maps to its world position', () => {
  near(ulToWorld(ul, ul.bx, ul.by), { x: ul.x, y: ul.y }, 'base');
});

test('image <-> world round trip', () => {
  const w = ulToWorld(ul, 321, 17);
  near(ulToImage(ul, w), { x: 321, y: 17 }, 'round trip');
});

test('moving the basepoint keeps the image where it is', () => {
  const moved = ulSetBase(ul, { x: 123, y: 456 });
  ulCorners(ul).forEach((c, i) => near(ulCorners(moved)[i], c, `corner ${i}`));
  near({ x: moved.x, y: moved.y }, { x: 123, y: 456 }, 'new base');
});

test('rotating and scaling pivot on the basepoint', () => {
  const r = { ...ul, rot: ul.rot + 77, s: ul.s * 2 };
  near(ulToWorld(r, ul.bx, ul.by), { x: ul.x, y: ul.y }, 'base stays');
});

test('hit test uses the image rectangle', () => {
  assert.ok(ulHit(ul, ulToWorld(ul, 10, 10)));
  assert.ok(!ulHit(ul, ulToWorld(ul, -10, 10)));
  assert.ok(!ulHit(ul, ulToWorld(ul, 10, 210)));
});

test('fit centres an upright image inside the frame', () => {
  const f = ulFit(ul, { x: 0, y: 0, w: 1000, h: 1000 });
  assert.equal(f.rot, 0);
  assert.equal(f.s, 2.5);
  near(ulToWorld(f, 200, 100), { x: 500, y: 500 }, 'centre');
  const fresh = newUnderlay('id', 'a.png', 400, 200, { x: 0, y: 0, w: 1000, h: 1000 });
  assert.equal(fresh.op, 0.5);
  assert.equal(fresh.vis, true);
});
