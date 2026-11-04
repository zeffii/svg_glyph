# Glyphpath features

Glyphpath is a small SVG drawing tool with two modes. **Glyphs** edits named paths with font metrics and a proof line that sets them like a font. **Logo** edits free drawings on an artboard. Both modes use the same drawing tools, and both can trace over an image underlay.

Live version: https://zeffii.github.io/svg_glyph/ · Press **H** in the app for the key list.

## Glyphs

- Every glyph has an **ID** (`A`, `N`, `A.alt`…) and an **advance width**. The advance is the dashed line on the right of the board; drag it to change the width.
- A glyph can hold several **contours**. Even-odd fill makes counters, so the hole in an O is just a second contour.
- The **glyph list** on the left shows a preview, the ID, the advance, and the contour and point counts. **[ ]** steps through the glyphs.
- **Dup** copies the current glyph into a new one named `ID.alt`. **Del** deletes the glyph; click it twice to confirm.
- **Copy / Paste**, or **Ctrl+C / X / V**, copies whole contours: the ones holding selected points, or the whole glyph when nothing is selected. Paste keeps the position, so a stem copied from N lands in the same spot in another glyph. Path data or SVG from the system clipboard can also be pasted in.

## Modes

- **M**, or the Glyphs / Logo tabs, switches mode. Each mode remembers which item you had open.
- **Logo mode** works on *drawings*: each has an ID and an artboard **Size** (W × H), shown as a dashed frame. The list on the left becomes the drawing list (+ Add, Dup, Del), and the metrics and proof line are hidden.
- **Copy SVG**, Export → Download SVG and Save SVG to exports/ give you the current drawing as an SVG sized to its artboard.
- Importing an SVG in logo mode adds it as a new drawing. All its paths are merged, and its viewBox becomes the artboard.
- Contours copy and paste between modes, so a letter can be pasted into a logo.

## Underlay

Every glyph and drawing can have one image to trace over.

- **Add an image:** use **Import…** in the Underlay panel, drop an image on the board, or paste one (Ctrl+V). It's fitted into the em box or the artboard at 50% opacity.
- **Place it:** press **U**, or click **Place**. The image gets gold handles, and path editing pauses until you press U or Esc.
  - Drag the image to move it. With Snap on, the basepoint lands on grid points.
  - Drag **⊕**, or double-click the image, to set the **basepoint**. This picks a spot in the picture and leaves the image where it is.
  - Drag **○** to rotate around the basepoint. Shift snaps to 15°.
  - Drag **□** to scale from the basepoint.
  - The arrow keys nudge the image (Shift for 10).
- **Panel settings:**
  - Opacity, visible and invert. Invert helps dark artwork show up on the dark board.
  - Exact basepoint position, rotation and scale.
  - **Fit** resets the image to upright and fitted.
  - **Remove** takes it off (Ctrl+Z undoes).
- **Storage:** images are stored in this browser (IndexedDB), not in the project JSON. Placement settings travel with the project, but the image file itself doesn't. On another browser you'll see an outline asking you to import it again.

## Drawing

| Do this | Result |
|---|---|
| **P**, then click | Pen: add points |
| Pen, drag | Pull out a smooth curve |
| Pen, click the first point, or **C** | Close the contour |
| **Esc** | Finish the contour |
| **V** | Select tool |
| **O**, then drag | Circle from the centre, radius snapped to the grid. **Shift**-drag makes an ellipse. It's built from 4 smooth points, so it edits like any other contour |
| Click a circle's outline | Select it as a circle: the outline turns red, with a ⊕ centre and a □ radius handle (one per axis on an ellipse). Drag ⊕ to move it (the centre snaps to the grid) and □ to resize it |
| **I** over a segment | Insert a point at the cursor; curves keep their shape |
| **D**, then **1–9** | Divide the hovered segment (or every segment between selected points) with that many evenly spaced points |
| Double-click a segment | Insert a point (Select tool) |
| Double-click a point | Toggle sharp / smooth |
| **B** or right-click a segment | Toggle line ↔ curve. The new curve has handles at ⅓ and ⅔ |

## Editing

- **Drag** points or handles. Drag on empty board to box-select; **Shift** adds to the selection. **Ctrl+A** selects all.
- **Shift-drag a line** to move that segment's two points.
- **Ctrl+Shift-drag** restricts any move to horizontal or vertical.
- **Arrows** nudge by 1, or 10 with Shift.
- **Alt-drag** a handle to break a smooth point.
- **A** over a control point swings it into line with the point's other handle, keeping its length. With no other handle, it lines up with the straight segment on the other side. Nothing gets locked, so add Smooth, Equal or the chain afterwards if you want it to stay in line.
- The **point type** buttons are Sharp, Smooth (handles stay in line), **Equal** (in line and the same length, mirrored while you drag; key **E**. Equal pairs are drawn with orange arms, a tick across each arm and a dot in the point) and Free (handles move independently).
- **Close**, **Reverse** and **Del pts** act on the selected contour.
- **Wheel** zooms around the mouse position, and so do Ctrl+wheel and trackpad pinch. **Shift+wheel** scrolls sideways, **Alt+wheel** scrolls up and down, and Space-drag or the middle mouse button pans.
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
- **N**, or the **Nodes** checkbox, hides points, handles, chain links, and the fillet and circle markers, so you see just the shapes. Hidden points can't be grabbed, but clicking an outline still selects and moves the contour.
- **Metrics:** cap height, x-height, baseline and descender. **G** hides the baseline and descender guides.

## Panels

- Click a header strip on the right to fold or unfold that section. Alt-click keeps only that section open. Your folds are remembered in this browser.
- A folded section's header shows a fuller read-only summary:
  - Glyph: ID, advance and counts.
  - Points: position and type of the selected point.
  - Underlay: file, opacity and invert.
  - Metrics: all four values.

  Unfold a section to edit.

## Path data

- The box shows one contour per line. Circles and ellipses get a comment such as `// circle  c 480,470  r 230`.
- Comments are display-only. Anything after `//` is ignored when you edit the box or paste path text, and exports never include them.
- **Selection is marked in the box.** Each contour with selected points gets a pink bar in the margin, and the command ending at each selected point is outlined in pink, the same pink as selected points on the board.
- **Copy** copies the text as shown. **Copy without comments**, under the box, copies plain path data on one line.

- The **path data** box shows the glyph's `d` attribute with commands highlighted. Editing it updates the glyph live.
- The parser accepts M L H V C S Q T Z, absolute or relative. Quadratics become cubics. Arcs (A) aren't supported yet.

## Proof and export

- **Proof** sets glyph IDs as text. Use `/name` for longer IDs (`N/A.altVA`), and adjust **Tracking** and **Space**. Click a letter in the proof to open it.
- **Download PDF** (File) gives the same artwork as a vector PDF. In Glyphs mode that's the proof line; in Logo mode it's the drawing at artboard size. Curves are exact, it's filled black with even-odd fill, and 1 unit = 1 point. Locally, **Save PDF to exports/** writes it next to the SVG.
- **Copy SVG** copies the proof line as `<defs>` paths placed with `<use>`.
- **File** has:
  - Project JSON, SVG with defs or flat.
  - Download buttons.
  - Load from text or a file. Importing SVG turns each `<path id>` into a glyph.

## Running it

- **Online:** GitHub Pages. The project is saved in your browser, so download the project JSON to back it up.
- **Locally:** `node serve.mjs` serves on port 5180 (`PORT=8081 node serve.mjs` for another port). It saves to `data/project.json`, and **Save SVG to exports/** writes to `exports/`.
- The header shows the build number and commit. `npm test` runs the path parser tests.
