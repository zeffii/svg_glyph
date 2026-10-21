# Changelog

Newest first. Each delivery zip is numbered (`glyphpath-NNN.zip`) and matches one entry here.

## 004 · 2026-10-21

- The GitHub Pages workflow now runs on pushes to `master`, this repo's branch. It was set to `main`, so pushes never deployed.

## 003 · 2026-10-21

- Collinear arms can be locked and unlinked with a chain icon (green when locked, grey when open).
  - **Point:** select a point whose two arms are in line and click the icon beside it. Locking keeps both arms on one line, the same as Smooth; unlinking makes it Free.
  - **Segment:** when a segment's two facing arms both lie on the line through its points, an icon appears between them. Locked arms stay on that line while you drag handles or move either point.
  - Locks are cleared when the segment is split, flattened with B, or loses a point. Reversing a contour keeps them.

## 002 · 2026-10-21

- Control arms that line up with an adjacent arm are highlighted green. Adjacent means the other arm of the same point, or the facing arm across a segment. A solid green arm is on the same infinite line; a dashed green arm is parallel but offset. The tolerance is 0.5°.

## 001 · 2026-10-21

First numbered delivery. Everything built so far:

### Node app
- `serve.mjs` serves `public/` with no dependencies. The default port is 5180; set `PORT` to change it.
- The project autosaves to `data/project.json`, with the browser's storage as a fallback.
- **Save SVG to exports/** writes the proof line to the `exports/` folder.
- The app detects static hosting (GitHub Pages). There it saves in the browser only and hides the server-only button.
- `.github/workflows/pages.yml` runs the tests and publishes `public/` to GitHub Pages on every push to `main`.
- `public/path.js` holds the path parser and writer, with 8 tests (`npm test`).
- Fix: the Export / Import and Keys dialogs couldn't be closed outside the artifact viewer, because a `[hidden]` reset was missing.

### Editor
- Named glyphs (ID and advance width), each with several contours; even-odd fill gives counters.
- Proof line sets glyphs like a font: `/name` for longer IDs, plus tracking and space width. Clicking a glyph opens it.
- Pen tool: click to add points, drag to pull curves, click the first point (or press C) to close. Clicking a segment inserts a point.
- Select tool: drag points and handles, box-select, and drag the advance line.
- Shift-drag a line to move it. Ctrl+Shift restricts any move to horizontal or vertical.
- Hovering a line shows dashed light-blue extensions to the board edges.
- B or right-click a segment toggles it between line and curve.
- Fillet (R) and chamfer (K) on sharp corners: move the mouse to size them, click to apply.
- Fillets stay editable: drag the ⊕ centre or the arc (which shows red when clicked) to change the radius. Fillets are detected from their geometry.
- Parallel lines are highlighted when you click or move a line. L, then L, makes a second line parallel to the first.
- Control points fill solid on hover. + arms extra control points to move along with the one you drag; − disarms them.
- Copy, cut and paste contours or whole glyphs (Ctrl+C/X/V). Pasting path data or SVG from the clipboard also works.
- Path data box with commands highlighted in light blue, editable both ways (M L H V C S Q T Z).
- Export SVG as `<defs>` + `<use>` or flat paths. Project JSON import and export, and SVG import (each path id becomes a glyph).
- Undo and redo, snap to grid, zoom and pan, and font metric guides.
- Oldschool tracker-style dark UI with a three-line glyph list. The key list is a popup (H).
