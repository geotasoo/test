# 세계지도 색칠하기 (새 버전 시안)

기존 앱(geotasoo.github.io/coloring_world_map)을 처음부터 다시 만드는 작업본입니다.

- `index.html`, `style.css`, `app.js` — 앱
- `data/world.json` — Natural Earth 1:50m 국가·호수 (한국어 이름·대륙 포함, TopoJSON)
- `data/build-world.js` — 위 파일을 만드는 스크립트 (나라 이름 표기는 여기의 `KO` 표에서 고칩니다)
- `lib/` — d3, topojson-client (외부 CDN 없이 동작)

지도 데이터: Natural Earth (public domain)
