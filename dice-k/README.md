# 🎲🗺️ dice-k · 주사위 땅따먹기 (우리나라 시·군)

다이스 워즈 방식으로 시·군을 차지하면서, 어디와 어디가 맞닿아 있는지 자연스럽게 익히는 게임이에요.
기획: `docs/dice-k_specification_v3.2.md`

## 파일

| 파일 | 하는 일 |
|---|---|
| `index.html`, `style.css`, `game.js` | 화면 (로비, 지도 줌·팬, 2단계 공격, "○○ 옆 △△" 배너, 주사위 충전, 결과) |
| `engine.js` | 규칙만 담은 엔진 (화면 없이 node에서도 돌아감). 지도는 맵 팩으로 받아서 `dice-w`에서 그대로 재사용 |
| `data/kr161.js` | 맵 팩: 161칸 SVG 경로, 인접 404쌍, 다리 9곳, 뱃길 8곳 (자동 생성) |
| `data/src/202604_sg.geojson` | 원본 지도: 한반도 색칠 웹앱의 '전남·광주 통합 전' 시군 경계를 **복사**해 온 것 (연동 아님) |
| `data/build-map.js` | 원본 → 맵 팩 변환, 칸 수 161 · 고립 칸 검증 |
| `tools/sim.js` | AI끼리 자동 대전 (순번별 승률) |

## 지도 다시 만들기

```bash
npm i topojson-server topojson-client topojson-simplify d3-geo polylabel
node data/build-map.js            # → data/kr161.js
```

원본 자료의 오타 두 곳을 고쳐서 씁니다: 강원 '홍성' → 횡성, 전북 '군사' → 군산.

## 밸런스 시뮬레이션

```bash
node tools/sim.js 400 all 4,5,6,7,8 5          # 판 수, 맵, 인원, 주사위 개수
BONUS='{"4":[0,3,6,8]}' node tools/sim.js 600 all 4 5   # 후공 보정 표 바꿔서 시험
```
