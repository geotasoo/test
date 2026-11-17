import fs from 'fs';
import * as tc from 'topojson-client';
import * as ts from 'topojson-server';
import * as tsimp from 'topojson-simplify';
import { geoContains } from 'd3-geo';
const R = JSON.parse(fs.readFileSync('/tmp/riv/rivers.json'));
const K = JSON.parse(fs.readFileSync('/home/claude/test/koreamap/data/korea-after.json'));
const south = { type: 'Feature', geometry: tc.merge(K, K.objects.sg.geometries) };
const north = tc.feature(K, K.objects.nk).features[0];
// 강 하나(MAIN_RIV)의 하구 상류 면적 = 그 강의 크기
const basin = {};
for (const f of R.features) { const p = f.properties; basin[p.MAIN_RIV] = Math.max(basin[p.MAIN_RIV] || 0, p.UPLAND_SKM); }
const lines = f => f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
const mid = l => l[Math.floor(l.length / 2)];
const nbF = tc.feature(K, K.objects.nb).features;
// 줄기의 점 가운데 하나라도 남측/북측 안이면 그쪽. 하구·바닷가처럼 어디에도 안 들어가면 그 강의 대부분이 있는 쪽을 따라요
const samp = l => [l[0], l[Math.floor(l.length / 2)], l[l.length - 1]];
const zone0 = l0 => { const l = samp(l0); for (const pt of l) if (geoContains(south, pt)) return 's'; for (const pt of l) if (geoContains(north, pt)) return 'n'; for (const pt of l) if (nbF.some(f => geoContains(f, pt))) return 'o'; return null; };
const riverZone = {};
for (const f of R.features) for (const l of lines(f)) { const z = zone0(l); if (!z) continue; const r = riverZone[f.properties.MAIN_RIV] = riverZone[f.properties.MAIN_RIV] || {}; r[z] = (r[z] || 0) + 1; }
const zoneOf = (l, riv) => zone0(l) || (riverZone[riv] ? Object.entries(riverZone[riv]).sort((a, b) => b[1] - a[1])[0][0] : 'o');
const MAJOR_BASIN = +(process.env.MB || 600), TRIB = +(process.env.TB || 2000);
const groups = {};   // key: level(m|d) + zone + width
for (const f of R.features) {
  const p = f.properties, b = basin[p.MAIN_RIV];
  const major = (p.ORD_CLAS === 1 && b >= MAJOR_BASIN) || (p.ORD_CLAS === 2 && p.UPLAND_SKM >= TRIB);
  const w = p.UPLAND_SKM >= 10000 ? 3 : p.UPLAND_SKM >= 2000 ? 2 : 1;
  for (const l of lines(f)) {
    const z = zoneOf(l, p.MAIN_RIV);
    const key = (major ? 'm' : 'd') + z + (major ? w : 0);
    (groups[key] = groups[key] || []).push(l);
  }
}
// HydroRIVERS는 넓은 하구(조간대)를 바다로 보고 강이 일찍 끝나요 → 교과서 지도처럼 바다까지 이어 줘요 (하구 경로)
const EXT = {
  40423228: [[126.73, 37.68], [126.68, 37.76], [126.60, 37.75], [126.52, 37.76]],   // 한강 → 오두산(임진강 합류) → 강화 북쪽
  40505530: [[128.99, 35.17], [128.965, 35.12], [128.95, 35.075]],                  // 낙동강 → 하굿둑 → 바다
  40515775: [[126.49, 34.86], [126.45, 34.79]],                                     // 영산강 → 영산강 하굿둑
  40479690: [[126.75, 35.93], [126.70, 35.925]],                                    // 만경강 → 새만금
  40485071: [[126.71, 35.79]],                                                       // 동진강
  40449356: [[126.86, 36.88]],                                                       // 삽교천
  40443183: [[126.90, 36.93]],                                                       // 안성천
  40475481: [[126.756, 36.011]],                                                     // 금강
  40476409: [[129.396, 36.018]],                                                     // 형산강
  40513639: [[127.77, 34.967]],                                                      // 섬진강
  40391614: [[125.42, 38.73], [125.30, 38.72], [125.22, 38.71]],                    // 대동강 → 남포
};
for (const [rid, pts] of Object.entries(EXT)) {
  let b = null; for (const f of R.features) if (String(f.properties.MAIN_RIV) === rid && (!b || f.properties.UPLAND_SKM > b.properties.UPLAND_SKM)) b = f;
  if (!b) continue;
  const c = b.geometry.type === 'LineString' ? b.geometry.coordinates : b.geometry.coordinates.at(-1);
  const up = b.properties.UPLAND_SKM, w = up >= 10000 ? 3 : up >= 2000 ? 2 : 1, z = zoneOf(c, b.properties.MAIN_RIV);
  const key = 'm' + z + w; (groups[key] = groups[key] || []).push([c.at(-1), ...pts]);
}
const objs = {};
for (const [k, ls] of Object.entries(groups)) objs[k] = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: ls } };
let topo0 = ts.topology(objs, 1e5);
for (const k of Object.keys(objs)) objs[k] = { type: 'Feature', geometry: tc.mesh(topo0, topo0.objects[k]) };   // 이어진 조각을 긴 선으로
let topo = ts.topology(objs);
topo = tsimp.presimplify(topo, tsimp.planarTriangleArea);
topo = tsimp.simplify(topo, +(process.env.SIMP || 1.5e-6));
topo = tsimp.filter(topo, tsimp.filterWeight(topo, 0));
topo.arcs = topo.arcs.map(a => a.map(p => [p[0], p[1]]));
topo = tc.quantize(topo, +(process.env.Q || 3e4));
fs.writeFileSync(process.env.OUT || '/home/claude/test/koreamap/data/rivers.json', JSON.stringify(topo));
console.error(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), fs.statSync(process.env.OUT || '/home/claude/test/koreamap/data/rivers.json').size);
