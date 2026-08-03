# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **pure static, client-side web app** — no backend, no build step, no package manager, no lockfiles, and no automated tests. It is a set of Korean-language interactive "map coloring" tools.

### Products / entry points
- `index_2026test07.html` — Korea map coloring tool (Leaflet.js). Fetches local `q_sd.json` (provinces / 시도) and `q_sg.json` (municipalities / 시군) at runtime.
- `index_world_20260421.html` — World map coloring tool (D3.js v7 + topojson-client).
- `index.html` — trivial placeholder (`hi test`), not a real entry point.
- `sw.js` — a service worker that only caches Wikimedia images; currently not registered by any page.

### Running (dev)
- Serve the repo root over HTTP (do **not** open via `file://`, or the Korea map's `fetch('q_sd.json')` calls fail): `python3 -m http.server 8000`
- Then open `http://localhost:8000/index_2026test07.html` (Korea) or `http://localhost:8000/index_world_20260421.html` (World).

### Gotchas
- Third-party libraries and some geo data load from external CDNs (`unpkg.com`, `d3js.org`, `cloudfront.net`) at runtime, so **outbound internet is effectively required** for the maps to render.
- In the Korea map, region coloring happens in the **province (시도) view**: pick a color from the `색상:` palette, then click a region. The `지도↔시도` toggle switches between the base map and the colorable province view.
- The `202604_*.geojson` files (~18 MB total) are alternate/newer datasets **not referenced** by the active pages, which use `q_sd.json` / `q_sg.json`.

### Lint / test / build
- There is no lint config, no test suite, and no build. Validation is manual/visual: serve the folder and interact with the two map pages in a browser.
