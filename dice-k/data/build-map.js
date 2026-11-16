// dice-k 지도 데이터 만들기
// 원본: data/src/202604_sg.geojson (한반도 색칠 앱의 '전남·광주 통합 전' 시군 경계를 복사해 온 것, 161칸)
// 결과: data/kr161.js  (화면에 바로 그릴 수 있게 미리 투영한 SVG 경로 + 인접 + 다리·뱃길)
// 실행: node build-map.js <원본 geojson> <결과 파일>
// 필요한 꾸러미: topojson-server topojson-client topojson-simplify d3-geo polylabel
const fs = require('fs');
const { topology } = require('topojson-server');
const tc = require('topojson-client');
const ts = require('topojson-simplify');
const d3 = require('d3-geo');
const polylabelM = require('polylabel'); const polylabel = polylabelM.default || polylabelM;

const [src = __dirname + '/src/202604_sg.geojson', out = __dirname + '/kr161.js'] = process.argv.slice(2);
const sg = JSON.parse(fs.readFileSync(src));

// ---------- 1. 이름 정리 ----------
const FIX = { '강원특별자치도/홍성': '횡성', '전북특별자치도/군사': '군산' };   // 원본 자료의 오타
const PROV = {   // 시도 → [짧은 이름, 권역]
  '서울특별시': ['서울', 'capital'], '인천광역시': ['인천', 'capital'], '경기도': ['경기', 'capital'],
  '대전광역시': ['대전', 'chungcheong'], '세종특별자치시': ['세종', 'chungcheong'], '충청북도': ['충북', 'chungcheong'], '충청남도': ['충남', 'chungcheong'],
  '강원특별자치도': ['강원', 'gangwon'],
  '광주광역시': ['광주', 'honam'], '전북특별자치도': ['전북', 'honam'], '전라남도': ['전남', 'honam'],
  '부산광역시': ['부산', 'yeongnam'], '대구광역시': ['대구', 'yeongnam'], '울산광역시': ['울산', 'yeongnam'], '경상북도': ['경북', 'yeongnam'], '경상남도': ['경남', 'yeongnam'],
  '제주특별자치도': ['제주', 'jeju'],
};
const CITY = new Set(('수원 성남 의정부 안양 부천 광명 평택 동두천 안산 고양 과천 구리 남양주 오산 시흥 군포 의왕 하남 용인 파주 이천 안성 김포 화성 광주 양주 포천 여주 ' +
  '춘천 원주 강릉 동해 태백 속초 삼척 청주 충주 제천 천안 공주 보령 아산 서산 논산 계룡 당진 전주 군산 익산 정읍 남원 김제 목포 여수 순천 나주 광양 ' +
  '포항 경주 김천 안동 구미 영주 영천 상주 문경 경산 창원 진주 통영 사천 김해 밀양 거제 양산 제주 서귀포').split(' '));

const feats = sg.features.map(f => {
  const p = f.properties, prov = p.NL_NAME_1;
  let label = FIX[prov + '/' + p.NL_NAME_2] || p.NL_NAME_2;
  const metro = !prov.endsWith('도');          // 특별시·광역시·특별자치시
  const suffix = metro ? '' : (prov === '경기도' && label === '광주') || CITY.has(label) ? '시' : '군';
  if (!PROV[prov]) throw new Error('모르는 시도: ' + prov);
  return { type: 'Feature', geometry: f.geometry, properties: { label, name: label + suffix, suffix, prov, provShort: PROV[prov][0], region: PROV[prov][1] } };
});
// 같은 이름(고성: 강원·경남, 광주: 경기·광주광역시) 구분용 id
feats.forEach(f => { f.id = f.properties.provShort + ':' + f.properties.label; });
if (feats.length !== 161) throw new Error('칸 수가 161이 아니에요: ' + feats.length);
if (new Set(feats.map(f => f.id)).size !== 161) throw new Error('id 중복');

// ---------- 2. 투영 (메르카토르, 지도 단위 1000 x ...) ----------
const fc = { type: 'FeatureCollection', features: feats };
// 경도·위도 범위로 맞춤 (d3는 고리 방향이 반대인 다각형을 '지구 전체'로 봐서 fc로 맞추면 지도가 점처럼 작아짐)
let lo0 = Infinity, la0 = Infinity, lo1 = -Infinity, la1 = -Infinity;
feats.forEach(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2).forEach(([x, y]) => { lo0 = Math.min(lo0, x); lo1 = Math.max(lo1, x); la0 = Math.min(la0, y); la1 = Math.max(la1, y); }));
const proj = d3.geoMercator().fitWidth(1000, { type: 'MultiPoint', coordinates: [[lo0, la0], [lo1, la1]] });
const P = ([x, y]) => proj([x, y]);

// ---------- 3. 위상 만들기 → 인접 추출 ----------
// 주의: topology()는 넣은 좌표를 그 자리에서 바꿔 버리므로 복사본으로 만든다
const topo = topology({ c: JSON.parse(JSON.stringify(fc)) }, 1e6);
const objs = topo.objects.c.geometries;
// 각 arc의 실제 길이(km) — 꼭짓점만 닿는 경우를 거르기 위해
const arcsAbs = tc.feature(topo, { type: 'MultiLineString', arcs: topo.arcs.map((_, i) => [i]) }).geometry.coordinates;
const arcLenKm = arcsAbs.map(line => { let s = 0; for (let i = 1; i < line.length; i++) s += d3.geoDistance(line[i - 1], line[i]) * 6371; return s; });
const arcOwners = new Map();
const walk = (a, fn) => Array.isArray(a) ? a.forEach(x => walk(x, fn)) : fn(a < 0 ? ~a : a);
objs.forEach((g, i) => walk(g.arcs, a => { if (!arcOwners.has(a)) arcOwners.set(a, new Set()); arcOwners.get(a).add(i); }));
const shared = new Map();   // "i-j" → km
for (const [a, own] of arcOwners) {
  const o = [...own]; if (o.length < 2) continue;
  for (let x = 0; x < o.length; x++) for (let y = x + 1; y < o.length; y++) {
    const k = Math.min(o[x], o[y]) + '-' + Math.max(o[x], o[y]); shared.set(k, (shared.get(k) || 0) + arcLenKm[a]);
  }
}
const MIN_KM = 0.05;   // 이보다 짧게 닿으면 '꼭짓점만 닿음'으로 보고 인접 아님
const adjacency = [], weak = [];
for (const [k, km] of shared) { const [i, j] = k.split('-').map(Number); (km >= MIN_KM ? adjacency : weak).push([i, j, +km.toFixed(2)]); }

// ---------- 4. 다리·하굿둑, 뱃길 ----------
const idx = id => { const i = feats.findIndex(f => f.id === id); if (i < 0) throw new Error('없는 칸: ' + id); return i; };
const BRIDGES = [   // [칸 A, 칸 B, 근거]
  ['전남:신안', '전남:목포', '압해대교'], ['전남:신안', '전남:무안', '김대중대교'],
  ['전남:진도', '전남:해남', '진도대교'],
  ['전남:완도', '전남:해남', '완도대교'], ['전남:완도', '전남:강진', '고금대교'],
  ['경남:거제', '경남:통영', '거제대교'], ['경남:거제', '부산:부산', '거가대교'],
  ['경남:남해', '경남:하동', '남해대교'], ['경남:남해', '경남:사천', '창선·삼천포대교'],
  ['전북:군산', '충남:서천', '금강하굿둑'], ['경기:평택', '충남:당진', '서해대교'],
  ['전남:여수', '전남:고흥', '백리섬섬길'], ['전남:영광', '전북:고창', '칠산대교'],
];
const PORT = {   // 뱃길 그릴 항구 위치 [경도, 위도]
  '경북:울릉': [130.905, 37.485], '경북:포항': [129.385, 36.035], '강원:강릉': [128.948, 37.772], '강원:동해': [129.115, 37.548], '경북:울진': [129.455, 36.678],
  '제주:제주': [126.535, 33.522], '전남:목포': [126.378, 34.783], '전남:완도': [126.757, 34.312], '부산:부산': [129.045, 35.098], '인천:인천': [126.598, 37.452],
};
const SEA = [   // [칸 A, 칸 B, 뱃길이 휘는 기준점(바다 위) 경도·위도]
  ['경북:울릉', '경북:포항', [130.15, 36.55]], ['경북:울릉', '강원:강릉', [129.85, 37.9]], ['경북:울릉', '강원:동해', [129.95, 37.62]], ['경북:울릉', '경북:울진', [130.15, 37.05]],
  ['제주:제주', '전남:목포', [126.15, 34.2]], ['제주:제주', '전남:완도', [126.8, 33.95]], ['제주:제주', '부산:부산', [128.1, 33.95]], ['제주:제주', '인천:인천', [125.25, 35.6]]];

// ---------- 5. 단순화 → 칸별 SVG 경로 ----------
const simp = ts.presimplify(topo);
const sTopo = ts.simplify(simp, 4e-6);   // 한반도 색칠 앱과 같은 정도로 꼭짓점 줄이기 (위상 유지)
const r1 = v => Math.round(v * 10) / 10;
const pathOf = geom => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let d = '';
  for (const pg of polys) for (const ring of pg) {
    const pts = ring.map(P).map(([x, y]) => [r1(x), r1(y)]);
    const clean = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    if (clean.length < 4) continue;
    d += 'M' + clean.slice(0, -1).map(p => p[0] + ',' + p[1]).join('L') + 'Z';
  }
  return d;
};
const sFeats = tc.feature(sTopo, sTopo.objects.c).features;
// 시도 경계선, 해안(바깥)선
const provMesh = tc.mesh(sTopo, sTopo.objects.c, (a, b) => a !== b && a.properties.prov !== b.properties.prov);
const lineD = ml => ml.coordinates.map(l => 'M' + l.map(P).map(([x, y]) => r1(x) + ',' + r1(y)).join('L')).join('');

// 칸 정보: 이름 놓을 자리(polylabel), 놓을 수 있는 크기, 면적
const cells = feats.map((f, i) => {
  const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // 가장 큰 덩어리에 이름 놓기
  let best = null, bestA = -1;
  for (const pg of polys) { const pr = pg.map(r => r.map(P)); const a = areaOf(pr[0]); if (a > bestA) { bestA = a; best = pr; } }
  const pl = polylabel(best, 0.5);
  const xs = best[0].map(q => q[0]), ys = best[0].map(q => q[1]);
  const cen = centroidOf(best[0]);   // 방위(북동쪽 등) 계산용 무게중심   // 가장 큰 덩어리의 범위 (먼 작은 섬 빼고 화면 맞추기용)
  return {
    id: f.id, name: f.properties.name, label: f.properties.label, suffix: f.properties.suffix,
    prov: f.properties.prov, provShort: f.properties.provShort, region: f.properties.region,
    lp: [r1(pl[0]), r1(pl[1])], cen: [r1(cen[0]), r1(cen[1])], bb: [r1(Math.min(...xs)), r1(Math.min(...ys)), r1(Math.max(...xs)), r1(Math.max(...ys))], room: r1(pl.distance), area: Math.round(polys.reduce((s, pg) => s + areaOf(pg[0].map(P)), 0)),
    d: pathOf(tc.merge(sTopo, [sTopo.objects.c.geometries[i]])),   // 한 칸 안의 조각들을 합쳐 안쪽 선 없애기
  };
});
function centroidOf(ring) { let a = 0, x = 0, y = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f; } return [x / (3 * a), y / (3 * a)]; }
function areaOf(ring) { let s = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return Math.abs(s / 2); }

// 다리: 두 칸에서 가장 가까운 꼭짓점 쌍을 이은 짧은 선
const ringsOf = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat().map(r => r.map(P));
const links = [];
for (const [a, b, why] of BRIDGES) {
  const i = idx(a), j = idx(b);
  if (adjacency.some(([x, y]) => (x === Math.min(i, j) && y === Math.max(i, j)))) { console.log('  (이미 육지로 맞닿음, 다리 생략)', a, b); continue; }
  const A = ringsOf(feats[i].geometry).flat(), B = ringsOf(feats[j].geometry).flat();
  let bd = Infinity, bp = null;
  for (let s = 0; s < A.length; s += 2) for (let t = 0; t < B.length; t += 2) { const dx = A[s][0] - B[t][0], dy = A[s][1] - B[t][1], dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bp = [A[s], B[t]]; } }
  links.push({ a: i, b: j, type: 'bridge', why, line: bp.map(([x, y]) => [r1(x), r1(y)]) });
}
for (const [a, b, c] of SEA) { const i = idx(a), j = idx(b); links.push({ a: i, b: j, type: 'sea', line: [P(PORT[a]), P(PORT[b])].map(([x, y]) => [r1(x), r1(y)]), ctrl: P(c).map(r1) }); }

// ---------- 6. 검증 ----------
const nb = cells.map(() => new Set());
adjacency.forEach(([i, j]) => { nb[i].add(j); nb[j].add(i); });
const isolatedLand = cells.map((c, i) => nb[i].size ? null : c.id).filter(Boolean);
links.forEach(l => { nb[l.a].add(l.b); nb[l.b].add(l.a); });
const isolated = cells.map((c, i) => nb[i].size ? null : c.id).filter(Boolean);
// 전체가 하나로 이어지는지
const seen = new Set([0]), st = [0]; while (st.length) { const v = st.pop(); for (const w of nb[v]) if (!seen.has(w)) { seen.add(w); st.push(w); } }
console.log('칸', cells.length, '| 육지 인접', adjacency.length, '| 꼭짓점만 닿아 뺀 쌍', weak.length, '| 다리', links.filter(l => l.type === 'bridge').length, '| 뱃길', links.filter(l => l.type === 'sea').length);
console.log('육지로 안 닿는 칸:', isolatedLand.join(', ') || '없음');
console.log('연결 후에도 고립:', isolated.join(', ') || '없음', '| 한 덩어리로 이어진 칸:', seen.size);
weak.forEach(([i, j, km]) => console.log('  꼭짓점 접촉(인접 아님):', cells[i].id, cells[j].id, km + 'km'));

// 시도 이름 자리 (칸 이름 자리를 면적으로 가중 평균)
const provs = {};
cells.forEach(c => { const p = provs[c.provShort] = provs[c.provShort] || { name: c.provShort, x: 0, y: 0, w: 0, region: c.region }; p.x += c.lp[0] * c.area; p.y += c.lp[1] * c.area; p.w += c.area; });
const provLabels = Object.values(provs).filter(p => !['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종'].includes(p.name)).map(p => ({ name: p.name, region: p.region, p: [r1(p.x / p.w), r1(p.y / p.w)] }));

const pack = {
  id: 'kr161', name: '대한민국 시·군 (전남·광주 통합 전)', source: '한반도 색칠 웹앱 지도 자료(GADM 기반, 2026년 4월 기준)에서 복사·가공',
  width: 1000, height: Math.ceil(proj([lo0, la0])[1]),
  regions: { capital: '수도권', chungcheong: '충청권', gangwon: '강원권', honam: '호남권', yeongnam: '영남권', jeju: '제주권' },
  cells, adjacency: adjacency.map(([i, j]) => [i, j]), links, provLabels,
  provLines: lineD(provMesh),
};
fs.writeFileSync(out, '// 자동 생성: node data/build-map.js  (직접 고치지 마세요)\n(typeof window !== "undefined" ? window : globalThis).MAP_KR161 = ' + JSON.stringify(pack) + ';\nif (typeof module !== "undefined") module.exports = globalThis.MAP_KR161 || window.MAP_KR161;\n');
console.log('저장:', out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
