import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfContent, pdfDocument } from '../public/pdf.js';
import { parseD } from '../public/path.js';

const box = { x: 0, y: 0, w: 100, h: 100 };

test('lines and curves map to PDF path operators with y flipped', () => {
  const c = pdfContent([{ contours: parseD('M10 10 L90 10 C90 50 50 90 10 90 Z') }], box);
  assert.match(c, /^0 0 0 rg\n10 90 m\n90 90 l\n90 50 50 10 10 10 c\n10 90 l\nh\nf\*\n$/);
});

test('dx shifts a piece along the line', () => {
  const c = pdfContent([{ contours: parseD('M0 0 L10 0 L10 10 Z'), dx: 50 }], box);
  assert.match(c, /^0 0 0 rg\n50 100 m\n60 100 l/);
});

test('document has a valid header, xref offsets and trailer', () => {
  const pdf = pdfDocument([{ contours: parseD('M10 10 L90 10 L50 90 Z') }], box, 'Logo (test)');
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  const xrefAt = Number(pdf.match(/startxref\n(\d+)/)[1]);
  assert.ok(pdf.slice(xrefAt).startsWith('xref\n0 6\n'));
  const entries = pdf.slice(xrefAt).split('\n').slice(3, 8).map(l => Number(l.slice(0, 10)));
  entries.forEach((off, i) => assert.ok(pdf.slice(off).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1} offset`));
  const len = Number(pdf.match(/\/Length (\d+)/)[1]);
  const start = pdf.indexOf('>>\nstream\n') + '>>\nstream\n'.length;
  const body = pdf.slice(start, pdf.indexOf('endstream', start));
  assert.equal(body.length, len);
  assert.match(pdf, /\/MediaBox \[0 0 100 100\]/);
  assert.match(pdf, /\/Title \(Logo \\\(test\\\)\)/);
});
