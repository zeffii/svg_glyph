// Minimal vector PDF writer. Pure functions, no DOM, shared with the tests.
//
// Contours use the app's node model ({ closed, nodes: [{ x, y, i, o }] }), whose cubic curves map
// one-to-one onto PDF's `c` operator, so the export is exact.
// One unit = one PDF point (1/72 inch). PDF's y axis points up, so y is flipped inside the page box.
// The whole drawing is one even-odd filled path (`f*`), so counters stay hollow, as in the SVG export.

const num = v => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };

// pieces: [{ contours, dx }] (dx shifts a glyph along the proof line); box: { x, y, w, h } in world units.
export function pdfContent(pieces, box) {
  const X = x => num(x - box.x), Y = y => num(box.y + box.h - y);
  const out = [];
  for (const { contours, dx = 0 } of pieces) {
    for (const c of contours) {
      const ns = c.nodes; if (ns.length < 2) continue;
      const pt = p => `${X(p.x + dx)} ${Y(p.y)}`;
      out.push(`${pt(ns[0])} m`);
      const seg = (a, b) => out.push((a.o || b.i) ? `${pt(a.o || a)} ${pt(b.i || b)} ${pt(b)} c` : `${pt(b)} l`);
      for (let k = 1; k < ns.length; k++) seg(ns[k - 1], ns[k]);
      if (c.closed) { seg(ns[ns.length - 1], ns[0]); out.push('h'); }
    }
  }
  if (out.length) out.push('f*');
  return `0 0 0 rg\n${out.join('\n')}\n`;
}

export function pdfDocument(pieces, box, title = 'Glyphpath') {
  const content = pdfContent(pieces, box);
  const safeTitle = String(title).replace(/[()\\]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(box.w)} ${num(box.h)}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    `<< /Title (${safeTitle}) /Producer (Glyphpath) >>`,
  ];
  // The file is pure ASCII, so string length equals byte offset.
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
