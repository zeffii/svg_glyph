# Glyphpath

A logo and glyph editor for SVG paths. Each glyph is a named path (`A`, `N`, `A.alt`…), and the proof line sets glyphs side by side like a font.

## Run

```
node serve.mjs        # or: npm start
```

Then open http://127.0.0.1:5180/. Set `PORT` or `HOST` to change where it listens.

No dependencies; Node 18 or newer.

## Where things are saved

- `data/project.json`: the project. It autosaves on every edit. The browser keeps a copy too, as a fallback if the server is down.
- `exports/*.svg`: written by **Export / Import → Save SVG to exports/**.

Both folders are created on first save and are git-ignored.

## Files

- `serve.mjs`: static server plus a small JSON API (`GET/PUT /api/project`, `PUT /api/export/<name>.svg`).
- `public/index.html`, `public/style.css`: the page.
- `public/app.js`: the editor.
- `public/path.js`: path-data model, parser and writer (shared with the tests).
- `test/`: `npm test` (node's built-in test runner).

## GitHub Pages

`.github/workflows/pages.yml` publishes `public/` on every push to `master` (tests run first). Turn it on once in the repo: Settings → Pages → Source: **GitHub Actions**.

On Pages there is no server, so the project is kept in the browser's storage. Use Export / Import → Download project JSON to back it up, and the Save SVG to exports/ button is hidden.
