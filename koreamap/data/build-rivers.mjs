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
