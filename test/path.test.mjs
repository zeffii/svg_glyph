import test from 'node:test';
import assert from 'node:assert/strict';
import { parseD, contourD, glyphD } from '../public/path.js';

test('round-trips lines and curves', () => {
  const d = 'M60 800 L60 100 C120 40 200 40 260 100 L260 800 Z';
  assert.equal(glyphD({ contours: parseD(d) }), d);
});

test('closing curve that returns to the start merges the duplicate node', () => {
  const cs = parseD('M330 90 C490 90 620 251 620 450 C620 649 490 810 330 810 C170 810 40 649 40 450 C40 251 170 90 330 90 Z');
  assert.equal(cs.length, 1);
  assert.equal(cs[0].nodes.length, 4);
  assert.ok(cs[0].nodes.every(n => n.s), 'circle nodes are smooth');
});

test('relative, H/V and implicit lineto after M', () => {
  const [c] = parseD('m10 10 20 0 v20 h-20 z');
  assert.deepEqual(c.nodes.map(n => [n.x, n.y]), [[10, 10], [30, 10], [30, 30], [10, 30]]);
  assert.equal(c.closed, true);
});

test('quadratics become cubics with the 2/3 rule', () => {
  const [c] = parseD('M0 0 Q30 30 60 0');
  assert.deepEqual(c.nodes[0].o, { x: 20, y: 20 });
  assert.deepEqual(c.nodes[1].i, { x: 40, y: 20 });
});

test('S reflects the previous control point', () => {
  const [c] = parseD('M0 0 C0 10 10 20 20 20 S40 30 40 40');
  assert.deepEqual(c.nodes[1].o, { x: 30, y: 20 });
});

test('multiple subpaths become separate contours', () => {
  assert.equal(parseD('M0 0 L10 0 L10 10 Z M2 2 L8 2 L8 8 Z').length, 2);
});

test('rejects arcs and junk with a readable message', () => {
  assert.throws(() => parseD('M0 0 A10 10 0 0 1 20 0'), /Arc/);
  assert.throws(() => parseD('M0 0 L10 zz'), /Numbers after Z|Unexpected|missing/);
  assert.throws(() => parseD('10 10'), /start with M/);
});

test('open contour output has no Z', () => {
  assert.equal(contourD({ closed: false, nodes: parseD('M0 0 L5 5')[0].nodes }), 'M0 0 L5 5');
});
