// 한반도 지도 데이터 만들기: 시군·시도·북측(GADM 기반, 예전 앱 202607 자료) + 주변국(Natural Earth 10m)
// node build-korea.js <예전앱 폴더> <ne_10m_admin_0_countries.geojson> <줄이기 값> <출력> <파일 앞이름: 202607(통합 후) | 202604(통합 전)>
const fs = require('fs'), { topology } = require('topojson-server'), S = require('topojson-simplify'), tc = require('topojson-client');
const d3 = require('d3-geo'), clip = require('@turf/bbox-clip').default;
const [src, neFile, minW = '0', out = 'korea.json', pre = '202607'] = process.argv.slice(2);
const L = f => JSON.parse(fs.readFileSync(src + '/' + f));
const sg = L(pre + '_sg.geojson'), sd = L(pre + '_sd.geojson'), nk = L(pre + '_nk.geojson');
// 시군 이름 끝(시·군·구) 붙이기: 예전 앱의 도시 목록 이름에서 찾고, 없으면 아래 표
const CITY = new Set(['수원','성남','의정부','안양','부천','광명','평택','동두천','안산','고양','과천','구리','남양주','오산','시흥','군포','의왕','하남','용인','파주','이천','안성','김포','화성','광주','양주','포천','여주',
 '춘천','원주','강릉','동해','태백','속초','삼척','청주','충주','제천','천안','공주','보령','아산','서산','논산','계룡','당진','전주','군산','익산','정읍','남원','김제','목포','여수','순천','나주','광양',
 '포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','창원','진주','통영','사천','김해','밀양','거제','양산','제주','서귀포']);
const META = {   // 광역시·특별시는 시도 이름 그대로
 '서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시','대전':'대전광역시','울산':'울산광역시','세종':'세종특별자치시', '광주':'광주광역시' };
const short = s => s.replace(/특별자치시|특별자치도|특별시|광역시|통합특별시/g, '').replace(/^충청북도$/, '충북').replace(/^충청남도$/, '충남').replace(/^경상북도$/, '경북').replace(/^경상남도$/, '경남').replace(/^전남광주$/, '전남광주');
sg.features.forEach(f => {
  const p = f.properties, b = p.NL_NAME_2, sido = p.NL_NAME_1;
  const ko = META[b] && sido === META[b] ? META[b] : /구$/.test(b) ? b : b + (CITY.has(b) ? '시' : '군');
  // 통합 전·후를 바꿔도 전남 시군의 색이 이어지게, 전라남도·전남광주통합특별시는 같은 이름표(전남)로
  f.id = 'sg:' + (/^전라남도$|^전남광주/.test(sido) ? '전남' : sido) + ':' + b;
  f.properties = { ko, sd: sido };
});
sd.features.forEach(f => { const p = f.properties; f.id = 'sd:' + p.NL_NAME_1; f.properties = { ko: p.NL_NAME_1, s: short(p.NL_NAME_1) }; });
nk.features.forEach(f => { f.id = 'nk'; f.properties = { ko: '북한' }; });
const NE = JSON.parse(fs.readFileSync(neFile));
const box = [112, 24, 146, 50];
const nb = { type: 'FeatureCollection', features: NE.features.filter(f => ['CHN','JPN','RUS','TWN','MNG'].includes(f.properties.ADM0_A3)).map(f => {
  const c = clip(f, box); c.id = 'nb:' + f.properties.ADM0_A3; c.properties = { ko: { CHN:'중국', JPN:'일본', RUS:'러시아', TWN:'타이완', MNG:'몽골' }[f.properties.ADM0_A3] }; return c;
}).filter(f => f.geometry.coordinates.length) };
let topo = topology({ sg, nk, nb });
// 시도는 시군을 합쳐서 만들어요 (같은 선을 함께 써서 경계가 딱 맞게)
const groups = {}; topo.objects.sg.geometries.forEach(g => (groups[g.properties.sd] = groups[g.properties.sd] || []).push(g));
topo.objects.sd = { type: 'GeometryCollection', geometries: sd.features.map(f => {
  const m = tc.mergeArcs(topo, groups[f.properties.ko] || []); m.id = f.id; m.properties = f.properties; return m; }) };
const pts = t => t.arcs.reduce((s, a) => s + a.length, 0), before = pts(topo);
if (+minW > 0) { topo = S.presimplify(topo);
  // 독도는 아주 작아서 줄이면 삼각형이 돼요 → 독도 둘레 점은 모두 남겨요
  for (const arc of topo.arcs) if (arc.some(p => p[0] > 131.8 && p[1] > 37.2 && p[1] < 37.3)) for (const p of arc) p[2] = Infinity; topo = S.simplify(topo, +minW); topo = S.filter(topo, S.filterAttachedWeight(topo, +minW * 4)); }
// 이름 위치: 가장 큰 조각의 중심
const lab = (o) => topo.objects[o].geometries.forEach(g => {
  const f = tc.feature(topo, g), polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = null, ba = -1; for (const pc of polys) { const a = d3.geoArea({ type: 'Polygon', coordinates: pc }); if (a > ba) { ba = a; best = pc; } }
  const c = d3.geoCentroid({ type: 'Polygon', coordinates: best }); g.properties.lx = +c[0].toFixed(3); g.properties.ly = +c[1].toFixed(3);
});
['sg', 'sd', 'nk'].forEach(lab);
// 통합 후 자료: 광주의 구(다른 원본) 둘레가 이웃 시군과 딱 맞지 않아 '바깥선'처럼 남아요.
// 원본 시도 경계 안쪽 깊숙이 있는 바깥선(틈)을 찾아 표시해 두고, 앱에서 해안선을 그릴 때 빼요.
{
  const use = new Map(), idx = a => a < 0 ? ~a : a, walk = (x) => Array.isArray(x) ? x.forEach(walk) : use.set(idx(x), (use.get(idx(x)) || 0) + 1);
  topo.objects.sg.geometries.forEach(g => walk(g.arcs));
  const sdPoly = new Map(sd.features.map(f => [f.properties.ko, f]));
  const box = [126.55, 34.9, 127.15, 35.35];   // 광주 둘레만 검사
  const gap = [];
  for (const [i, n] of use) {
    if (n !== 1) continue;
    const line = tc.feature(topo, { type: 'LineString', arcs: [i] }).geometry.coordinates;
    const m = line[Math.floor(line.length / 2)];
    if (m[0] < box[0] || m[0] > box[2] || m[1] < box[1] || m[1] > box[3]) continue;
    const owner = topo.objects.sg.geometries.find(g => JSON.stringify(g.arcs).match(new RegExp('[\\[,](' + i + '|' + (~i) + ')[\\],]')));
    const poly = owner && sdPoly.get(owner.properties.sd); if (!poly) continue;
    const d = 0.004, inside = [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]].every(([dx, dy]) => d3.geoContains(poly, [m[0] + dx, m[1] + dy]));
    if (inside) gap.push(i);
  }
  global.GAP = gap; console.log('gap arcs', gap.length);
}
// 휴전선: 남측 바깥선 중 북측 경계와 겹치거나(같은 선) 아주 가까운 선 → 앱에서 점선으로
{
  const idx = a => a < 0 ? ~a : a, set = o => { const r = new Map(); const w = x => Array.isArray(x) ? x.forEach(w) : r.set(idx(x), (r.get(idx(x)) || 0) + 1); topo.objects[o].geometries.forEach(g => w(g.arcs)); return r; };
  const sgU = set('sg'), nkU = set('nk');
  const segs = []; for (const line of tc.mesh(topo, topo.objects.nk).coordinates) for (let i = 1; i < line.length; i++) segs.push([line[i - 1], line[i]]);
  const dist = (p) => { let m = 1e9; for (const [a, b] of segs) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; m = Math.min(m, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return m; };
  const dmz = [], dmzN = [];
  for (const [i, n] of sgU) {
    if (nkU.has(i)) { dmz.push(i); dmzN.push(i); continue; }
    if (n !== 1) continue;
    const line = tc.feature(topo, { type: 'LineString', arcs: [i] }).geometry.coordinates, m = line[Math.floor(line.length / 2)];
    if (m[1] < 37.55 || m[0] < 126.0 || m[0] > 128.7) continue;
    if (dist(m) < 0.004 && dist(line[0]) < 0.006 && dist(line[line.length - 1]) < 0.006) dmz.push(i);
  }
  // 북측 쪽 선 중 남측 바깥선과 아주 가까운 것
  const ssegs = []; for (const i of dmz) { const c = tc.feature(topo, { type: 'LineString', arcs: [i] }).geometry.coordinates; for (let k = 1; k < c.length; k++) ssegs.push([c[k - 1], c[k]]); }
  const dist2 = (p) => { let m = 1e9; for (const [a, b] of ssegs) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; m = Math.min(m, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return m; };
  for (const [i] of nkU) { if (dmzN.includes(i)) continue; const c = tc.feature(topo, { type: 'LineString', arcs: [i] }).geometry.coordinates, m = c[Math.floor(c.length / 2)]; if (m[1] < 37.55 || m[1] > 38.7) continue; if (dist2(m) < 0.004) dmzN.push(i); }
  global.DMZ = dmz; global.DMZN = dmzN; console.log('dmz arcs', dmz.length, 'north side', dmzN.length);
}
topo.arcs = topo.arcs.map(a => a.map(p => [p[0], p[1]])); delete topo.transform; topo = tc.quantize(topo, 1e5); topo.gap = global.GAP || []; topo.dmz = global.DMZ || []; topo.dmzN = global.DMZN || [];
fs.writeFileSync(out, JSON.stringify(topo));
console.log('points', before, '->', pts(topo), 'size', (fs.statSync(out).size / 1024).toFixed(0), 'KB');
