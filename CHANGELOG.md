# Changelog

Newest first. Each numbered entry is one build; the number shows in the app header next to the commit.

## 015 · 2026-11-04

- **Equal handles:** select points and press **E**, or use the new **Equal** point-type button. Each point's two handles are set in line at their average length, and they stay mirrored when you drag either one. Equal points show a dot inside the point. Alt-drag still breaks a handle free.
  - The flag is also recognised from path data, so it survives editing the text box.
  - Splitting a neighbouring segment changes the handle lengths, so it turns Equal back into Smooth for the points on either side.

## 014 · 2026-11-04

- **N**, or the new **Nodes** checkbox in the toolbar, hides points, handles, chain links, and the fillet and circle markers, so you see just the shapes. Hidden points can't be grabbed by accident, but clicking an outline still selects and moves the contour. The setting is saved with the project.
- To keep the toolbar on one line: Export / Import is now **File**, the checkboxes read Parallel and Base, and the grid field is narrower.

## 013 · 2026-11-04

- **Path data box marks the selection.** Each contour line holding selected points gets a pink bar in the margin, and the command that ends at each selected point (`M…`, `L…` or `C…`) is outlined in the same pink as selected points on the board. It updates live while you select and drag. While you're typing in the box it shows plain highlighting instead.
- `path.js` gains `contourTokens`, which `contourD` is now built from, so each command knows which point it belongs to.

## 012 · 2026-11-04

- **Circles stay circles.** Any contour that forms a true circle or ellipse is recognised from its shape: 4 smooth points with the right handles, in any start point or direction, including imported ones.
  - Clicking its outline selects it as a circle. The outline turns red, with a ⊕ centre and a □ radius handle (one per axis on an ellipse).
  - Drag ⊕ to move it (the centre snaps to the grid) and □ to resize it (snapped).
  - Reshape it some other way and it becomes an ordinary contour.
- **Path data box:**
  - One contour per line. Circles and ellipses get a green display-only comment (`// circle  c 480,470  r 230`).
  - `//` comments are ignored when editing or pasting, and never exported.
  - New **Copy without comments** button under the box. The bar's Copy copies the text as shown.

## 011 · 2026-11-04

- **Circle tool (O):** drag from the centre to set the radius, which snaps to the grid. Shift-drag makes an ellipse. A live guide shows the radius. The circle is four cubic quarter-arcs on four smooth points (within 0.03% of a true circle), so it can be divided, filleted, copied and edited like any other contour. It works in both modes, and the new circle comes out selected.
- The header shows the build as `#011 · <commit>`, and the toolbar spacing was tightened so the new tool still fits on one line.

## 010 · 2026-11-04

- **Divide:** hover a segment and press **D**, then a digit **1–9** to add that many points, evenly spaced by length. Curves keep their exact shape. With nothing hovered, D divides every segment whose two end points are selected. The target is highlighted while it waits for the digit, any other key cancels, and the new points come out selected.

## 009 · 2026-11-04

Glyphpath becomes a small SVG drawing tool.

- **Logo mode** (M, or the Glyphs / Logo tabs):
  - Free drawings on an artboard with their own ID and size, using the same drawing tools. The list becomes the drawing list, and metrics and proof are hidden.
  - Copy SVG, Download SVG and Save SVG export the current drawing at artboard size.
  - Importing an SVG adds it as a new drawing (paths merged, viewBox as the artboard).
- **Image underlay** on every glyph and drawing:
  - Add one by importing, dropping or pasting.
  - Place it with U: drag to move, ⊕ to set the basepoint (or double-click), ○ to rotate and □ to scale around the basepoint. Both handles sit on short arms from the basepoint, so they stay on screen. Shift snaps rotation to 15°, and arrow keys nudge.
  - Panel settings: opacity, visible, invert, exact basepoint / rotation / scale, Fit and Remove.
- Images are kept in the browser (IndexedDB) so the project JSON stays small; placement is saved with the project.
- New modules: `public/underlay.js` (placement maths, with 6 tests) and `public/images.js` (browser image store).
- Panel text can no longer be selected by accident when clicking fast. The header subtitle was dropped and the toolbar spacing tightened to keep it on one line.
- `FEATURES.md` covers both modes and the underlay.

## 008 · 2026-10-30

- New `FEATURES.md`: a compact guide to everything Glyphpath does, with keys. It's linked from the README.

## 007 · 2026-10-22

- **I** inserts a point on the segment under the cursor, at the spot you're hovering. It works in both tools and keeps the curve's shape. The new point is selected.

## 006 · 2026-10-21

- Tidier panels using header strips (option C). Every section has a darker title bar with a live summary on the right:
  - Glyph list: count and + Add.
  - Glyph: ID, contour count and point count.
  - Points: selection count.
  - Corners: current radius.
  - Path data: length, with the Copy button on the bar.
  - Proof: glyph count and total width.
- Inspector rows use a fixed label column so values line up. X and Y share a Position row. Point type and contour actions have their own labelled rows. Buttons are shorter: Dup, Del, Del pts.
- Radius, Fillet and Chamfer stay on one row.

## 005 · 2026-10-21

- The header shows the build number and commit, e.g. `build 005 · f7594fe`. On Pages the deploy writes it; locally `serve.mjs` reads it from git, with `+` when there are uncommitted changes.
- Radius, Fillet and Chamfer now sit on one line in the Corners section.
- The new **Base/desc** toggle in the toolbar (or **G**) hides the baseline and descender guides, including the proof strip's baseline. The setting is saved with the project.

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
