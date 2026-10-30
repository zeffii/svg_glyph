# Glyphpath features

Glyphpath is a logo and glyph editor for SVG paths. Each glyph is a named path, and the proof line sets glyphs side by side like a font.

Live version: https://zeffii.github.io/svg_glyph/ · Press **H** in the app for the key list.

## Glyphs

- Every glyph has an **ID** (`A`, `N`, `A.alt`…) and an **advance width**. The advance is the dashed line on the right of the board; drag it to change the width.
- A glyph can hold several **contours**. Even-odd fill makes counters, so the hole in an O is just a second contour.
- The **glyph list** on the left shows a preview, the ID, the advance, and the contour and point counts. **[ ]** steps through the glyphs.
- **Dup** copies the current glyph into a new one named `ID.alt`. **Del** deletes the glyph; click it twice to confirm.
- **Copy / Paste**, or **Ctrl+C / X / V**, copies whole contours: the ones holding selected points, or the whole glyph when nothing is selected. Paste keeps the position, so a stem copied from N lands in the same spot in another glyph. Path data or SVG from the system clipboard can also be pasted in.

## Drawing

| Do this | Result |
|---|---|
| **P**, then click | Pen: add points |
| Pen, drag | Pull out a smooth curve |
| Pen, click the first point, or **C** | Close the contour |
| **Esc** | Finish the contour |
| **V** | Select tool |
| **I** over a segment | Insert a point at the cursor; curves keep their shape |
| Double-click a segment | Insert a point (Select tool) |
| Double-click a point | Toggle sharp / smooth |
| **B** or right-click a segment | Toggle line ↔ curve. The new curve has handles at ⅓ and ⅔ |

## Editing

- **Drag** points or handles. Drag on empty board to box-select; **Shift** adds to the selection. **Ctrl+A** selects all.
- **Shift-drag a line** to move that segment's two points.
- **Ctrl+Shift-drag** restricts any move to horizontal or vertical.
- **Arrows** nudge by 1, or 10 with Shift.
- **Alt-drag** a handle to break a smooth point.
- The **point type** buttons are Sharp, Smooth (handles stay in line) and Free (handles move independently).
- **Close**, **Reverse** and **Del pts** act on the selected contour.
- **Snap** to a grid of any size. **Undo / redo** with Ctrl+Z / Ctrl+Shift+Z.

## Corners

- **R** fillets and **K** chamfers the selected sharp corners. Move the mouse to set the size, then click or press Enter. Esc or right-click cancels.
- A fillet is a true circular arc tangent to both lines, stored as a cubic.
- **Fillets stay editable.** Each one shows a ⊕ at its centre. Drag the ⊕, or click the arc (it turns red) and drag, to change the radius.

## Guides and alignment

- When you hover a line, dashed extensions run out to the board edges.
- **Parallels:** clicking or moving a line highlights the lines parallel to it. Solid means exactly parallel; dashed means within 3°. **L** on one line, then **L** on another, makes the second parallel to the first.
- **Control arms** turn green when they line up with an adjacent arm. Solid green means the same infinite line; dashed green means parallel but offset.
- **Chain icon:** click it to lock collinear arms, on a point (its two arms) or across a segment (the facing arms stay on the line through its points). Click again to unlink.
- **Arming:** hover a control point and press **+** to arm it. Armed points move along with the one you drag. **−** disarms.
- **Metrics:** cap height, x-height, baseline and descender. **G** hides the baseline and descender guides.

## Path data

- The **path data** box shows the glyph's `d` attribute with commands highlighted. Editing it updates the glyph live.
- The parser accepts M L H V C S Q T Z, absolute or relative. Quadratics become cubics. Arcs (A) aren't supported yet.

## Proof and export

- **Proof** sets glyph IDs as text. Use `/name` for longer IDs (`N/A.altVA`), and adjust **Tracking** and **Space**. Click a letter in the proof to open it.
- **Copy SVG** copies the proof line as `<defs>` paths placed with `<use>`.
- **Export / Import** has:
  - Project JSON, SVG with defs or flat.
  - Download buttons.
  - Load from text or a file. Importing SVG turns each `<path id>` into a glyph.

## Running it

- **Online:** GitHub Pages. The project is saved in your browser, so download the project JSON to back it up.
- **Locally:** `node serve.mjs` serves on port 5180 (`PORT=8081 node serve.mjs` for another port). It saves to `data/project.json`, and **Save SVG to exports/** writes to `exports/`.
- The header shows the build number and commit. `npm test` runs the path parser tests.
