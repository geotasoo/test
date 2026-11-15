/* 세계지도 색칠하기 — 시안 12
 * 도법 두 가지:
 *  - 메르카토르: 지도 한 장을 회전시켜 그려서 이음매가 없고, 좌우로 끝없이 돌릴 수 있어요.
 *  - 이퀄 어스: 넓이가 실제 비율대로 보이는 도법. 가운데 경선을 150°E로 고정한 태평양 중심 지도예요.
 */
(() => {
  'use strict';

  // ───────── 설정값 ─────────
  const STORE_KEY = 'worldmap.v1';
  const HOME_LON = 150;          // 처음 화면 가운데 경도 (태평양 중심, 대서양에서 잘림)
  const LAT_TOP = 84, LAT_BOT = -72;
  const MAX_ZOOM = 30;
  const RAD = Math.PI / 180;
  const EE_CENTER = 150;         // 이퀄 어스 지도의 처음 가운데 경선 (좌우로 끌면 바뀜)
  const PROJ_INFO = {
    merc: { name: '메르카토르 도법', note: '방향과 모양이 정확해 항해에 쓰여요. 극으로 갈수록 넓이가 크게 보여요.' },
    ee: { name: '이퀄 어스 도법', note: '나라의 넓이를 실제 비율대로 보여줘요. 2026년 UN 총회가 사용을 권고했어요.' },
  };

  const PALETTES = [
    { name: '시험지 회색', colors: ['#D9D9D9', '#BFBFBF', '#A6A6A6', '#8C8C8C', '#737373', '#595959', '#404040'] },
    { name: '기본', colors: ['#F94144', '#F8961E', '#F9C74F', '#90BE6D', '#43AA8B', '#4D96FF', '#7B61FF', '#E56BCF', '#9C6644', '#5C677D'] },
    { name: '파랑 단계', colors: ['#DCEBFA', '#A9CDF0', '#6AA6DE', '#2F78C2', '#164A8A'] },
    { name: '빨강 단계', colors: ['#FDE2D6', '#F9B193', '#F27A55', '#D9412B', '#A01B17'] },
    { name: '초록 단계', colors: ['#E3F2D9', '#B5DDA0', '#7CC16A', '#3F9441', '#1D5E28'] },
    { name: '노랑-갈색', colors: ['#FFF3C4', '#FAD776', '#F2B134', '#C98320', '#8A5A12'] },
  ];
  const LAND_COLORS = ['#FFFFFF', '#F7F3EA', '#EEF1F4', '#E6E6E6'];
  const OCEAN_COLORS = ['#E3E3E3', '#DDEEFB', '#C9E4F7', '#FFFFFF'];

  // ───────── 상태 ─────────
  const S = {
    colors: new Map(),      // 나라코드 → 색
    current: '#A6A6A6',     // 시험지처럼 중간 회색
    palette: 0,
    tool: 'paint',          // 'paint' | 'erase'
    land: '#FFFFFF',
    ocean: '#E3E3E3',       // 시험지처럼 옅은 회색 바다
    line: 1.0,
    borderDash: true,       // 국경선 점선(기본) / 실선
    show: { borders: true, kp: false, names: false, tiny: false, grid: true, equator: false, lakes: true, scale: true },
    dockHidden: false,
    lakes: { sel: WM_PLACES.LAKES.filter(l => l.on).map(l => l.ko), all: false },   // 켜 둔 주요 호수
    points: [],             // 찍은 점 { id, lon, lat, city(목록 도시면 이름), label, off(라벨을 옮겼으면 [dx, dy]) }
    pstyle: { color: '#1A1A1A', shape: 'circle', size: 6, outline: true, font: 16 },   // 모든 점 공통 모양 (font: 라벨 글자 크기)
    fill: null,             // 'alpha' | 'hangulp' | 'hangul' 이면 순서대로 라벨 자동
    regions: [],            // 색칠한 나라 라벨 { id, label, off }
    rfill: null,            // 색칠 라벨 자동 순서
    rfont: 20,              // 색칠 라벨 글자 크기
    view: null,             // 메르카토르 { lon, lat, z } 저장용
    proj: 'merc',           // 'merc' | 'ee'
    eeLon: EE_CENTER,       // 이퀄 어스 가운데 경선
  };
  const undoStack = [], redoStack = [];
  // 라벨 글꼴: 시험지처럼 명조 계열 (웹 글꼴이 없으면 컴퓨터의 바탕·명조)
  const LABEL_FONT = '"Noto Serif KR", "Nanum Myeongjo", "Batang", "AppleMyungjo", "Times New Roman", serif';
  const fontAsked = new Set();
  function ensureFont(font, text) {   // 캔버스는 웹 글꼴을 스스로 내려받지 않아서, 쓰는 글자를 미리 불러와요
    if (!document.fonts || !text) return;
    const k = font + '|' + text; if (fontAsked.has(k)) return; fontAsked.add(k);
    document.fonts.load(font, text).then(() => requestDraw()).catch(() => {});
  }
  const DOKDO = [131.8686, 37.2411];   // 독도: 지도 데이터에 없을 만큼 작아서 점으로 과장해 표시

  // ───────── DOM ─────────
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), canvas = $('#map');
  let ctx = canvas.getContext('2d');   // 저장할 때는 잠시 다른 캔버스로 바꿔 그려요
  let EXP = null;                      // 저장 중: { exam, phase: 'map'|'over', rect }
  const outRect = p => EXP && EXP.rect && (p[0] < EXP.rect.x || p[0] > EXP.rect.x + EXP.rect.w || p[1] < EXP.rect.y || p[1] > EXP.rect.y + EXP.rect.h);
  const tip = $('#tip'), toast = $('#toast');

  // ───────── 지도 투영 ─────────
  let W = 0, H = 0, dpr = 1;
  let sMin = 1;                              // 현재 도법의 최소 축척
  let lon0 = HOME_LON, s = 1, cy = 0;       // 메르카토르: 가운데 경도, 축척, 적도의 화면 y
  let ex = 0, ey = 0;                        // 이퀄 어스: 지도 원점의 화면 위치 (축척은 s 공용)
  let sMinM = 1, sMinE = 1, eeFit = null, area = { top: 0, bot: 0, left: 0, line: 0 };
  const projM = d3.geoMercator().precision(0);
  const projE = d3.geoEqualEarth().precision(0.5);
  const eeBase = d3.geoEqualEarth().scale(1).translate([0, 0]).precision(0.0002);
  const EE_BOUNDS = d3.geoPath(eeBase).bounds({ type: 'Sphere' });   // 돌려도 테두리 모양은 같음
  // 이퀄 어스에서 x는 같은 위도에서는 경도에 비례해요. 위도별 '1라디안당 x' 값
  const eeFlat = d3.geoEqualEarth().scale(1).translate([0, 0]);
  const eeG = lat => eeFlat([1, Math.max(-89, Math.min(89, lat))])[0] / RAD;
  const normLon = l => ((l % 360) + 540) % 360 - 180;
  let proj = projM;
  const isEE = () => S.proj === 'ee';
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2));
  const MERC_SPAN = merc(LAT_TOP) - merc(LAT_BOT);

  function applyProj() {
    if (isEE()) { proj = projE.rotate([-S.eeLon, 0]).scale(s).translate([ex, ey]); }
    else { proj = projM.rotate([-lon0, 0]).scale(s).translate([W / 2, cy]); }
  }
  const MIN_ZOOM = 0.6;   // 꽉 찬 화면보다 더 축소 가능 (남극까지 한눈에)
  function clampScale(v) { return Math.max(sMin * MIN_ZOOM, Math.min(sMin * MAX_ZOOM, v)); }
  function clampView() {
    s = clampScale(s);
    if (isEE()) {
      // 지도가 화면보다 작으면 가운데에 고정, 크면 가장자리 밖으로 빈 곳이 생기지 않게
      const [[x0, y0], [x1, y1]] = EE_BOUNDS;
      const top = eeFit ? eeFit.cy - eeFit.h / 2 : 0, bot = eeFit ? eeFit.cy + eeFit.h / 2 : H;
      const L = area.left, cxFit = eeFit ? eeFit.cx : W / 2;     // PC에서는 왼쪽 팔레트를 피해서
      if (s * (x1 - x0) <= W - L) ex = cxFit - s * (x0 + x1) / 2;
      else ex = Math.min(L - s * x0, Math.max(W - s * x1, ex));
      if (s * (y1 - y0) <= bot - top) ey = (top + bot) / 2 - s * (y0 + y1) / 2;
      else ey = Math.min(top - s * y0, Math.max(bot - s * y1, ey));
    } else {
      const hi = s * merc(LAT_TOP);          // 위쪽 끝이 화면 위로 넘치지 않게
      const lo = H + s * merc(-85);          // 아래로는 남극(85°S)까지 내려 볼 수 있게
      cy = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, cy));
      lon0 = ((lon0 % 360) + 540) % 360 - 180;
    }
    applyProj();
  }
  function zoomAt(px, py, factor) {
    const ns = clampScale(s * factor);
    if (isEE()) {
      ex = px - (px - ex) * ns / s; ey = py - (py - ey) * ns / s; s = ns;
    } else {
      const lonP = lon0 + (px - W / 2) / s / RAD;
      const m = (cy - py) / s;
      s = ns;
      lon0 = lonP - (px - W / 2) / s / RAD;
      cy = py + m * s;
    }
    clampView(); requestDraw(); saveSoon();
  }
  function panBy(dx, dy, px, py) {
    if (isEE()) {
      // 좌우로 끌면 지구를 돌리고(가운데 경선 변경), 위아래로 끌면 지도를 옮겨요.
      let lat = 0;
      if (px != null) { const ll = proj.invert([px, py]); if (ll && isFinite(ll[1])) lat = ll[1]; }
      rotateEE(S.eeLon - dx / (s * eeG(lat)) / RAD);
      ey += dy;
    }
    else { lon0 -= dx / s / RAD; cy += dy; }
    clampView(); requestDraw();
  }
  function rotateEE(lon) {
    lon = normLon(lon);
    if (lon === S.eeLon) return;
    S.eeLon = lon; eeStale();
  }
  function animateTo(target, dur = 450) {
    // target: 메르카토르 { lon, s, cy } / 이퀄 어스 { s, ex, ey }
    const ee = isEE(), from = ee ? { s, ex, ey, lon: S.eeLon } : { lon: lon0, s, cy }, t0 = performance.now();
    const dl = target.lon == null ? 0 : ((target.lon - from.lon + 540) % 360) - 180;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      s = from.s * Math.pow(target.s / from.s, e);
      if (ee) { ex = from.ex + (target.ex - from.ex) * e; ey = from.ey + (target.ey - from.ey) * e; if (dl) rotateEE(from.lon + dl * e); }
      else { lon0 = from.lon + dl * e; cy = from.cy + (target.cy - from.cy) * e; }
      clampView(); requestDraw();
      if (t < 1) requestAnimationFrame(step); else saveSoon();
    };
    requestAnimationFrame(step);
  }
  function setView(lon, lat, z, animate) {
    // 메르카토르 전용
    const ts = Math.max(sMinM, Math.min(sMinM * MAX_ZOOM, sMinM * z));
    const target = { lon, s: ts, cy: H / 2 + ts * merc(lat) };
    if (animate) return animateTo(target);
    lon0 = target.lon; s = target.s; cy = target.cy; clampView(); requestDraw(); saveSoon();
  }
  function homeEE(animate) {
    // 세로로 긴 화면(폰)에서는 지도가 너무 작아지지 않게 조금 확대해서 시작
    const hs = !isPhone() ? sMinE : Math.min(sMinE * 2.4, Math.max(sMinE, eeFit.h * 0.82 / (EE_BOUNDS[1][1] - EE_BOUNDS[0][1])));
    const target = { lon: EE_CENTER, s: hs, ex: eeFit.cx - hs * (EE_BOUNDS[0][0] + EE_BOUNDS[1][0]) / 2, ey: eeFit.cy - hs * (EE_BOUNDS[0][1] + EE_BOUNDS[1][1]) / 2 };
    if (animate) return animateTo(target);
    s = target.s; ex = target.ex; ey = target.ey; rotateEE(target.lon); clampView(); requestDraw();
  }
  function goHome() { isEE() ? homeEE(true) : setView(HOME_LON, 18, 1, true); }
  function currentView() {
    return { lon: +lon0.toFixed(3), lat: +((Math.atan(Math.sinh((cy - H / 2) / s)) / RAD)).toFixed(3), z: +(s / sMinM).toFixed(4) };
  }

  const isPhone = () => window.matchMedia('(max-width: 719px)').matches;
  function computeFits() {
    sMinM = Math.max(W / (2 * Math.PI), H / MERC_SPAN);
    const st = stage.getBoundingClientRect();
    const hidden = document.body.classList.contains('dock-hidden');
    // 폰: 아래 시트 높이만큼 아래 여백 / PC: 왼쪽 팔레트 너비만큼 왼쪽 여백
    let dockH = 0, left = 0, right = 0;
    const sideOpen = !$('#side').hidden;
    if (isPhone()) {
      if (sideOpen) dockH = Math.max(0, st.bottom - $('#side').getBoundingClientRect().top);
      else if (!hidden) dockH = Math.max(0, st.bottom - $('#dock').getBoundingClientRect().top);
    } else {
      if (!hidden && !document.body.classList.contains('point-mode')) left = $('#dock').getBoundingClientRect().right - st.left;
      if (sideOpen) right = $('#side').offsetWidth;
    }
    stage.style.setProperty('--dock-h', dockH + 'px');
    const top = Math.max(0, $('#controls').getBoundingClientRect().bottom - st.top) + 8;
    const botPad = 30;     // 아래쪽 출처·축척 줄 (폰에서 접으면 팔레트 버튼 자리)
    const bot = H - dockH - botPad;
    const bw = EE_BOUNDS[1][0] - EE_BOUNDS[0][0], bh = EE_BOUNDS[1][1] - EE_BOUNDS[0][1];
    const fitW = W - left - 16 - (isPhone() ? 0 : 54);   // 오른쪽 확대 버튼 자리 (오른쪽 패널은 지도 위에 겹쳐 열림)
    sMinE = Math.min(fitW / bw, (bot - top) / bh);
    eeFit = { cx: left + 8 + fitW / 2, cy: (top + bot) / 2, h: bot - top };
    area = { top, bot, left, right, line: H - dockH - 10 };
    sMin = isEE() ? sMinE : sMinM;
  }

  function resize() {
    const keepM = W && !isEE() ? currentView() : null;
    const keepE = W && isEE() ? { z: s / sMinE, cx: (W / 2 - ex) / s, cy: (H / 2 - ey) / s } : null;
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    computeFits();
    if (isEE()) {
      if (keepE) { s = sMinE * keepE.z; ex = W / 2 - keepE.cx * s; ey = H / 2 - keepE.cy * s; clampView(); requestDraw(); }
      else { const keep = S.eeLon; homeEE(false); rotateEE(keep); }
    } else if (keepM) setView(keepM.lon, keepM.lat, keepM.z, false);
    else if (S.view) setView(S.view.lon, S.view.lat, S.view.z, false);
    else setView(HOME_LON, 18, 1, false);
  }

  // ───────── 도법 바꾸기 ─────────
  let fade = null;   // { img, t0 } 이전 화면을 잠깐 겹쳐 부드럽게 바꿈
  function setProjection(mode, quiet) {
    if (mode === S.proj) return;
    if (!quiet && W) {
      const snap = document.createElement('canvas');
      snap.width = canvas.width; snap.height = canvas.height;
      snap.getContext('2d').drawImage(canvas, 0, 0);
      fade = { img: snap, t0: performance.now() };
    }
    if (!isEE()) S.view = currentView();      // 메르카토르 위치 기억
    S.proj = mode;
    sMin = isEE() ? sMinE : sMinM;
    hoverId = null; hideTip();
    if (isEE()) { const keep = S.eeLon; homeEE(false); rotateEE(keep); }
    else if (S.view) setView(S.view.lon, S.view.lat, S.view.z, false);
    else setView(HOME_LON, 18, 1, false);
    syncProjUI();
    if (!quiet) showToast(`${PROJ_INFO[mode].name} — ${PROJ_INFO[mode].note}`, false, 4200);
    requestDraw(); saveSoon();
  }
  function syncProjUI() {
    document.querySelectorAll('#projSeg button').forEach(b => {
      const on = b.dataset.proj === S.proj;
      b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on));
    });
    updateProjName();
  }

  let lastName = '';
  function updateProjName() {
    let t = PROJ_INFO[S.proj].name;
    if (isEE()) { const l = Math.round(S.eeLon); t += ` (중심 ${Math.abs(l)}°${l > 0 ? 'E' : l < 0 ? 'W' : ''})`; }
    if (t !== lastName) { lastName = t; $('#projName').textContent = t; }
  }

  // ───────── 데이터 ─────────
  let countries = [], lakes = [], borderMesh, kpMesh, coastMesh, byId = new Map(), tiny = [];
  const GRID_STEPS = [30, 10, 5];
  const graticules = Object.fromEntries(GRID_STEPS.map(st => [st, d3.geoGraticule().step([st, st]).extentMajor([[-180, -89.99], [180, 89.99]]).stepMajor([st, st])()]));
  const graticule = graticules[30];
  const gridStep = () => { const z = s / sMin; return z < 2.6 ? 30 : z < 7 ? 10 : 5; };
  const equator = { type: 'LineString', coordinates: d3.range(-180, 181, 2).map(x => [x, 0]) };

  function dropAntimeridian(mesh) {
    const on180 = p => Math.abs(Math.abs(p[0]) - 180) < 1e-6;
    const lines = [];
    for (const line of mesh.coordinates) {
      let cur = [line[0]];
      for (let i = 1; i < line.length; i++) {
        if (on180(line[i - 1]) && on180(line[i])) {   // 180° 위를 따라가는 구간은 버림
          if (cur.length > 1) lines.push(cur);
          cur = [line[i]];
        } else cur.push(line[i]);
      }
      if (cur.length > 1) lines.push(cur);
    }
    return { type: 'MultiLineString', coordinates: lines };
  }

  let lo = null;   // 이퀄 어스를 돌리는 동안 쓰는 가벼운 지도
  const lakeGroups = new Map();
  // 지금 보이는 호수 (전체 호수 또는 고른 주요 호수)
  function visibleLakes(which = 'hi') {
    if (S.lakes.all) return which === 'hi' ? lakes : (lo ? lo.lakesAll : lakes);
    return S.lakes.sel.flatMap(ko => (lakeGroups.get(ko) || {})[which] || []);
  }
  const lakeKey = () => S.lakes.all ? 'all' : [...S.lakes.sel].sort().join('|');
  const FC = features => ({ type: 'FeatureCollection', features });
  // 남북한 경계선은 따로 떼어서 켜고 끌 수 있게
  const isKP = (a, b) => (a.id === 'KOR' && b.id === 'PRK') || (a.id === 'PRK' && b.id === 'KOR');
  async function loadData() {
    const [topo, topoLo] = await Promise.all([
      fetch('data/world.json').then(r => r.json()),
      fetch('data/world-lo.json').then(r => r.json()).catch(() => null),
    ]);
    if (topoLo) {
      lo = {
        countries: topojson.feature(topoLo, topoLo.objects.countries).features,
        lakesAll: topojson.feature(topoLo, topoLo.objects.lakes).features,
        border: topojson.mesh(topoLo, topoLo.objects.countries, (a, b) => a !== b && !isKP(a, b)),
        kp: topojson.mesh(topoLo, topoLo.objects.countries, isKP),
        coast: dropAntimeridian(topojson.mesh(topoLo, topoLo.objects.countries, (a, b) => a === b)),
      };
    }
    countries = topojson.feature(topo, topo.objects.countries).features;
    lakes = topojson.feature(topo, topo.objects.lakes).features;
    borderMesh = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && !isKP(a, b));
    kpMesh = topojson.mesh(topo, topo.objects.countries, isKP);
    // 원본 데이터는 러시아·피지·남극을 180° 경선에서 잘라 두었어요.
    // 그 자른 자리(가짜 해안선)를 지워야 지도에 세로줄이 생기지 않아요.
    coastMesh = dropAntimeridian(topojson.mesh(topo, topo.objects.countries, (a, b) => a === b));
    for (const f of countries) {
      const b = d3.geoBounds(f);
      f.bb = b; f.wrap = b[0][0] > b[1][0];
      f.area = d3.geoArea(f);
      f.label = [f.properties.lx, f.properties.ly];
      byId.set(f.id, f);
      // 지도에서 점처럼 작게 보이는 독립국은 따로 동그라미로 표시
      if (f.area < 2e-5 && f.properties.t === 'S' && f.id !== 'MAC') tiny.push(f);
    }
    for (const l of lakes) { l.bb = d3.geoBounds(l); l.wrap = l.bb[0][0] > l.bb[1][0]; }
    // 주요 호수: 한국어 이름 → 지도 조각들
    for (const def of WM_PLACES.LAKES) {
      lakeGroups.set(def.ko, {
        hi: lakes.filter(l => def.en.includes(l.properties.en)),
        lo: lo ? lo.lakesAll.filter(l => def.en.includes(l.properties.en)) : [],
      });
    }
    // 라벨: 중요한 나라부터
    countries.sort((a, b) => a.properties.ml - b.properties.ml);
  }

  // ───────── 그리기 ─────────
  let drawQueued = false, hoverId = null;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(draw); } }

  // 도형은 처음 한 번만 Path2D로 만들어 두고, 화면을 움직일 때는 확대·이동만 해요.
  // 기준 좌표: 0°를 가운데로 둔 메르카토르(축척 1). 지도 두 벌을 180°에서 이어 붙여
  // 한 Path2D 안에 담기 때문에, 이음매가 보이지 않고 좌우로 끝없이 돌릴 수 있어요.
  const TAU = 2 * Math.PI;
  function makeShape(geo) {
    const p2 = new Path2D();
    // 원본 데이터가 이미 180°에서 잘려 있으므로, 구면 자르기 없이 평면으로 바로 옮겨요.
    for (const dx of [0, TAU]) {
      const flat = d3.geoTransform({
        point(lon, lat) {
          const la = Math.max(-85, Math.min(85, lat));
          this.stream.point(lon * RAD + dx, -merc(la));
        },
      });
      d3.geoPath(flat, p2)(geo);
    }
    return p2;
  }
  function makeShapeEE(geo) {
    const p2 = new Path2D();
    d3.geoPath(eeBase.rotate([-ee.lon, 0]), p2)(geo);
    return p2;
  }
  // 이퀄 어스 도형 보관함: 가운데 경선이 바뀌면 새로 만들어야 해요.
  const ee = { lon: null, shapes: new Map(), shared: {}, ready: false, timer: 0, job: 0 };
  function eeStale() {
    clearTimeout(ee.timer);
    ee.ready = false;
    ee.timer = setTimeout(buildEE, 160);
  }
  function buildEE() {
    if (!isEE() || !countries.length) return;
    if (pointers.size) { ee.timer = setTimeout(buildEE, 120); return; }   // 끄는 중이면 기다림
    const job = ++ee.job, lon = S.eeLon;
    ee.lon = lon; ee.shapes = new Map(); ee.shared = {}; ee.ready = false;
    const list = [...countries];
    const tasks = [
      () => sharedShape('lakes:' + lakeKey(), () => FC(visibleLakes())),
      () => sharedShape('coast', () => coastMesh), () => sharedShape('border', () => borderMesh),
      () => sharedShape('kp', () => kpMesh),
      () => sharedShape('grid' + gridStep(), () => graticules[gridStep()]), () => sharedShape('equator', () => equator),
      () => sharedShape('sphere', () => SPHERE),
    ];
    const step = () => {
      if (job !== ee.job || S.eeLon !== lon || !isEE()) return;    // 그사이 또 돌렸으면 취소
      const t0 = performance.now();
      while (performance.now() - t0 < 12) {
        if (list.length) { const f = list.pop(); ee.shapes.set(f, makeShapeEE(f)); }
        else if (tasks.length) tasks.shift()();
        else { ee.ready = true; requestDraw(); return; }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function buildEESync() {
    ee.job++; ee.lon = S.eeLon; ee.shapes = new Map(); ee.shared = {};
    for (const f of countries) ee.shapes.set(f, makeShapeEE(f));
    ee.ready = true;
  }
  const shapeOf = o => isEE() ? ee.shapes.get(o) : (o.shape || (o.shape = makeShape(o)));
  const SH = { merc: {} };
  function sharedShape(name, geo) {
    if (isEE()) return ee.shared[name] || (ee.shared[name] = makeShapeEE(geo()));
    return SH.merc[name] || (SH.merc[name] = makeShape(geo()));
  }
  const shared = sharedShape;
  const SPHERE = { type: 'Sphere' };

  function setWorldTransform() {
    if (isEE()) { ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ex, dpr * ey); return; }
    // 화면 왼쪽 끝의 기준 x가 [-π, π) 안에 오도록 지도 벌을 고름
    const l0 = lon0 * RAD, xLeft = l0 - (W / 2) / s;
    const n = Math.floor((xLeft + Math.PI) / TAU);
    const tx = W / 2 - s * (l0 - n * TAU);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * cy);
  }

  function draw() {
    drawQueued = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (EXP && EXP.phase === 'over') { ctx.clearRect(0, 0, W, H); drawTextLayer(); return; }
    ctx.fillStyle = isEE() ? (EXP ? '#FFFFFF' : '#EEF1F5') : S.ocean; ctx.fillRect(0, 0, W, H);
    if (!countries.length) return;
    if (isEE()) updateProjName();
    updateZoomPct();
    if (isEE() && !(ee.ready && ee.lon === S.eeLon)) { drawLiveEE(); return drawOverlays(); }
    const lw = S.line, px = 1 / s;   // 화면 1픽셀 = 기준 좌표 px
    const lakeShape = S.show.lakes ? shared('lakes:' + lakeKey(), () => FC(visibleLakes())) : null;
    const coastShape = shared('coast', () => coastMesh), borderShape = shared('border', () => borderMesh);
    const step = gridStep();
    const gridShape = S.show.grid ? shared('grid' + step, () => graticules[step]) : null, equatorShape = shared('equator', () => equator);
    setWorldTransform();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (isEE()) {   // 지도 바깥 테두리(타원) 안을 바다색으로
      const sp = shared('sphere', () => SPHERE);
      ctx.save(); if (!EXP) { ctx.shadowColor = 'rgba(20,40,70,.10)'; ctx.shadowBlur = 18; }
      ctx.fillStyle = S.ocean; ctx.fill(sp); ctx.restore();
    }

    // 1) 나라 채우기
    for (const f of countries) {
      ctx.fillStyle = S.colors.get(f.id) || S.land;
      ctx.fill(shapeOf(f));
    }
    // 2) 호수
    if (S.show.lakes) {
      ctx.fillStyle = S.ocean; ctx.fill(lakeShape);
      ctx.lineWidth = lw * 0.8 * px; ctx.strokeStyle = '#333'; ctx.stroke(lakeShape);
    }
    // 3) 경위선·적도
    if (S.show.grid) {
      ctx.lineWidth = 0.6 * px; ctx.strokeStyle = 'rgba(0,0,0,.22)';   /* 경위선은 가는 실선 (국경 점선과 구별) */
      ctx.stroke(gridShape); ctx.setLineDash([]);
    }
    if (S.show.equator) { ctx.lineWidth = 1.1 * px; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(equatorShape); }
    // 4) 해안선·국경선
    ctx.lineWidth = lw * px; ctx.strokeStyle = '#1a1a1a';
    ctx.stroke(coastShape);
    if (S.show.borders || S.show.kp) {
      ctx.lineWidth = lw * 0.9 * px; ctx.strokeStyle = '#2b2b2b';
      if (S.borderDash) ctx.setLineDash([3.2 * px * Math.max(1, lw), 2.2 * px * Math.max(1, lw)]);   // 시험지처럼 점선
      if (S.show.borders) ctx.stroke(borderShape);
      if (S.show.kp) ctx.stroke(shared('kp', () => kpMesh));
      ctx.setLineDash([]);
    }
    if (isEE()) { ctx.lineWidth = 1.2 * px; ctx.strokeStyle = EXP ? '#1a1a1a' : '#7d8a99'; ctx.stroke(shared('sphere', () => SPHERE)); }
    // 6) 마우스를 올린 나라 강조
    if (hoverId && byId.has(hoverId) && !isEE()) {
      const f = byId.get(hoverId);
      const key = isEE() ? 'outlineE' : 'outlineM';
      if (!f[key]) {
        const g = f.geometry, rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
        f[key] = (isEE() ? makeShapeEE : makeShape)(dropAntimeridian({ coordinates: rings }));
      }
      ctx.lineWidth = Math.max(1.6, lw * 2.2) * px; ctx.strokeStyle = '#1d2733'; ctx.stroke(f[key]);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlays();
  }

  // 라벨·점·경위선 숫자·축척
  function drawTextLayer() {
    drawRegionLabels();
    drawPoints();
    if (S.show.grid && !(EXP && EXP.exam)) drawGridLabels();
    if (S.show.scale && !(EXP && EXP.exam)) drawScale();
  }

  // 이퀄 어스를 돌리는 동안: 가벼운 지도를 바로 계산해서 그림
  function drawLiveEE() {
    const g = d3.geoPath(proj, ctx), lw = S.line;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.shadowColor = 'rgba(20,40,70,.10)'; ctx.shadowBlur = 18;
    ctx.beginPath(); g(SPHERE); ctx.fillStyle = S.ocean; ctx.fill(); ctx.restore();
    const src = lo || { countries, border: borderMesh, kp: kpMesh, coast: coastMesh };
    src.lakes = FC(visibleLakes(lo ? 'lo' : 'hi'));
    const groups = new Map();
    for (const f of src.countries) {
      const c = S.colors.get(f.id) || S.land;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(f);
    }
    for (const [c, fs] of groups) { ctx.beginPath(); for (const f of fs) g(f); ctx.fillStyle = c; ctx.fill(); }
    if (S.show.lakes) { ctx.beginPath(); g(src.lakes); ctx.fillStyle = S.ocean; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#333'; ctx.stroke(); }
    if (S.show.grid) { ctx.beginPath(); g(graticules[gridStep()]); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.stroke(); ctx.setLineDash([]); }
    if (S.show.equator) { ctx.beginPath(); g(equator); ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(); }
    ctx.beginPath(); g(src.coast); ctx.lineWidth = lw; ctx.strokeStyle = '#1a1a1a'; ctx.stroke();
    if (S.show.borders || S.show.kp) {
      ctx.beginPath(); if (S.show.borders) g(src.border); if (S.show.kp) g(src.kp || kpMesh);
      ctx.lineWidth = lw * 0.9; ctx.strokeStyle = '#2b2b2b';
      if (S.borderDash) ctx.setLineDash([3.2 * Math.max(1, lw), 2.2 * Math.max(1, lw)]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); g(SPHERE); ctx.lineWidth = 1.2; ctx.strokeStyle = '#7d8a99'; ctx.stroke();
  }

  // 도법과 상관없이 화면 좌표로 그리는 것들
  function drawOverlays() {
    const lw = S.line;
    if (hoverId && byId.has(hoverId) && isEE() && !pointers.size) {
      const f = byId.get(hoverId);
      if (!f.outlineGeo) {
        const gm = f.geometry, rings = gm.type === 'Polygon' ? gm.coordinates : gm.coordinates.flat();
        f.outlineGeo = dropAntimeridian({ coordinates: rings });
      }
      ctx.beginPath(); d3.geoPath(proj, ctx)(f.outlineGeo);
      ctx.lineWidth = Math.max(1.6, lw * 2.2); ctx.strokeStyle = '#1d2733'; ctx.stroke();
    }

    // 5) 아주 작은 나라 동그라미 (화면에서 7px보다 작게 보일 때만)
    const z = s / sMin;
    for (const f of S.show.tiny ? tiny : []) {
      const p = proj(f.label); if (!p || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
      const k = isEE() ? 1 : 1 / Math.cos(f.label[1] * RAD);   // 메르카토르는 고위도일수록 커 보임
      if (Math.sqrt(f.area) * s * k > 6) continue;
      const r = Math.max(2.6, Math.min(4.5, 2.2 + z * 0.15));
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
      ctx.fillStyle = S.colors.get(f.id) || S.land; ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = '#1a1a1a'; ctx.stroke();
    }

    // 독도: 대한민국과 같은 색의 작은 점 (확대해도 점으로)
    {
      const p = dokdoVisible() && proj(DOKDO);
      if (p && p[0] > -10 && p[0] < W + 10 && p[1] > -10 && p[1] < H + 10) {
        ctx.beginPath(); ctx.arc(p[0], p[1], dokdoR(), 0, 2 * Math.PI);
        ctx.fillStyle = S.colors.get('KOR') || S.land; ctx.fill();
        ctx.lineWidth = Math.min(0.9, dokdoR() * 0.5); ctx.strokeStyle = '#4b5663'; ctx.stroke();
      }
    }

    // 7) 나라 이름
    if (S.show.names) drawLabels(z);
    if (EXP) return;          // 저장할 때 라벨·점은 따로 (틀 바깥 여백까지 나갈 수 있게)
    drawTextLayer();

    // 8) 도법을 바꾼 직후: 이전 화면을 서서히 지움
    if (fade) {
      const t = (performance.now() - fade.t0) / 380;
      if (t >= 1) fade = null;
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - t * t; ctx.drawImage(fade.img, 0, 0); ctx.globalAlpha = 1;
        requestDraw();
      }
    }
  }

  const FONT = getComputedStyle(document.documentElement).fontFamily;

  // ───────── 경위선 라벨 ─────────
  const fmtLat = v => v === 0 ? '0°' : `${Math.abs(v)}°${v > 0 ? 'N' : 'S'}`;
  const fmtLon = v => { v = normLon(v); if (Math.abs(v) === 180) return '180°'; return v === 0 ? '0°' : `${Math.abs(v)}°${v > 0 ? 'E' : 'W'}`; };
  function haloText(t, x, y, align, color) {
    ctx.textAlign = align; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(t, x, y);
    ctx.fillStyle = color; ctx.fillText(t, x, y);
  }
  function drawGridLabels() {
    const step = gridStep(), top = area.top + 6, bot = area.bot - 8;   // 아래쪽 축척·출처와 겹치지 않게
    ctx.font = `600 11px ${FONT}`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const col = '#333';
    // 위도: 왼쪽·오른쪽 가장자리
    for (let lat = -Math.floor(80 / step) * step; lat <= 80; lat += step) {
      let L, R;
      if (isEE()) {
        L = proj([S.eeLon - 179.999, lat]); R = proj([S.eeLon + 179.999, lat]);
        if (!L || !R) continue;
        const wL = ctx.measureText(fmtLat(lat)).width;
        L = L[0] - 5 - wL < 4 ? [Math.max(4, L[0]) + 4, L[1], 'left'] : [L[0] - 5, L[1], 'right'];
        R = R[0] + 5 + wL > W - 4 ? [Math.min(W - 4, R[0]) - 4, R[1], 'right'] : [R[0] + 5, R[1], 'left'];
      } else {
        const y = proj([lon0, lat])[1];
        L = [area.left + 6, y, 'left']; R = [W - (area.right || 0) - 6, y, 'right'];
      }
      if (L[1] < top || L[1] > bot) continue;
      haloText(fmtLat(lat), L[0], L[1], L[2], col);
      if (!isEE() || Math.abs(R[0] - L[0]) > 80) haloText(fmtLat(lat), R[0], R[1], R[2], col);
    }
    // 경도: 적도를 따라 (적도가 화면 밖이면 화면 가장자리에)
    const eq = proj([isEE() ? S.eeLon : lon0, 0]);
    const y = Math.max(top + 4, Math.min(bot - 4, eq[1] + 11));
    let lastX = -1e9;
    const lons = [];
    for (let lon = -180; lon < 180; lon += step) lons.push(lon);
    const pts = lons.map(lon => {
      if (isEE() && Math.abs(normLon(lon - S.eeLon)) > 179) return null;
      const p = proj([lon, 0]); return p && p[0] > 14 && p[0] < W - 14 ? [lon, p[0]] : null;
    }).filter(Boolean).sort((a, b) => a[1] - b[1]);
    for (const [lon, x] of pts) {
      const t = fmtLon(lon), w = ctx.measureText(t).width;
      if (x - w / 2 < lastX + 6) continue;
      haloText(t, x, y, 'center', col); lastX = x + w / 2;
    }
  }

  // ───────── 축척 막대 ─────────
  function niceKm(v) {
    const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
  }
  // 축척 1 : N — 화면 가운데 지점에서 화면 1픽셀(1/96인치)이 실제로 몇 m인지로 계산
  function drawScale() {
    const cx = (area.left + W - (area.right || 0)) / 2, cyM = (area.top + area.bot) / 2;
    const a = proj.invert([cx - 50, cyM]), b = proj.invert([cx + 50, cyM]), ref = proj.invert([cx, cyM]);
    const bad = q => !q || !isFinite(q[0]) || !isFinite(q[1]) || Math.abs(q[1]) > 85;
    if (bad(a) || bad(b) || bad(ref)) return;
    if (isEE() && Math.hypot(...proj(a).map((v, i) => v - [cx - 50, cyM][i])) > 1) return;
    const mPerPx = d3.geoDistance(a, b) * 6371000 / 100;
    const raw = mPerPx / (0.0254 / 96);
    const e = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
    const denom = Math.round(raw / e) * e;                       // 앞 두 자리만 남김
    const text = `1 : ${denom.toLocaleString('ko-KR')}`;
    const lat = Math.round(ref[1]);
    const capt = `화면 가운데(${lat === 0 ? '적도' : fmtLat(lat)}) 기준`;
    const x = W - (area.right || 0) - 12, y = area.line;
    ctx.save();
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    ctx.font = `700 13px ${FONT}`;
    const wT = ctx.measureText(text).width;
    ctx.font = `500 10px ${FONT}`;
    const wC = ctx.measureText(capt).width;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    roundRect(x - Math.max(wT, wC) - 10, y - 30, Math.max(wT, wC) + 20, 36, 8); ctx.fill();
    ctx.fillStyle = '#1d2733'; ctx.font = `700 13px ${FONT}`; ctx.fillText(text, x, y - 14);
    ctx.fillStyle = '#5b6776'; ctx.font = `500 10px ${FONT}`; ctx.fillText(capt, x, y - 1);
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawLabels(z) {
    const limit = 2.6 + Math.log2(z) * 1.6;   // 확대할수록 작은 나라 이름까지
    const boxes = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of countries) {
      const ml = f.properties.ml;
      if (ml > limit || f.properties.t === 'O') continue;
      const p = proj(f.label);
      if (!p || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue;
      const big = ml <= 2 ? 13 : ml <= 3 ? 12 : 11;
      ctx.font = `${ml <= 2 ? 700 : 600} ${big}px ${FONT}`;
      const text = f.properties.ko;
      const w = ctx.measureText(text).width, h = big + 2;
      const box = [p[0] - w / 2 - 2, p[1] - h / 2, p[0] + w / 2 + 2, p[1] + h / 2];
      if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      boxes.push(box);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(text, p[0], p[1]);
      ctx.fillStyle = '#1d2733'; ctx.fillText(text, p[0], p[1]);
    }
  }

  // ───────── 나라 찾기 (클릭 위치) ─────────
  const inBox = (f, lon, lat) => lat >= f.bb[0][1] && lat <= f.bb[1][1] &&
    (f.wrap ? (lon >= f.bb[0][0] || lon <= f.bb[1][0]) : (lon >= f.bb[0][0] && lon <= f.bb[1][0]));

  let hitDokdo = false;
  // 독도: 울릉도(지름 약 10km)의 1/4 크기 → 반지름 약 1.25km. 축소하면 사라지지 않게 가장 작은 점으로
  const pxPerKm = () => s / (6371 * (isEE() ? 1 : Math.cos(DOKDO[1] * RAD)));
  const dokdoVisible = () => pxPerKm() * 10 >= 6;     // 울릉도(지름 약 10km)가 6px 이상으로 보일 때만
  const dokdoR = () => Math.max(1.2, 1.25 * pxPerKm());
  function hitTest(px, py, tolerance) {
    let ll = proj.invert([px, py]);
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return null;
    if (isEE()) {   // 지도 바깥(타원 밖)을 누른 경우
      const back = proj(ll);
      if (!back || Math.hypot(back[0] - px, back[1] - py) > 1 || Math.abs(ll[1]) > 90) return near(px, py, tolerance);
    }
    ll = [((ll[0] + 540) % 360) - 180, ll[1]];
    const [lon, lat] = ll;
    const dp = proj(DOKDO);   // 독도 점을 누르면 대한민국
    if (dp && dokdoVisible() && Math.hypot(dp[0] - px, dp[1] - py) < Math.max(dokdoR() + 3, tolerance * 0.6)) { hitDokdo = true; return byId.get('KOR'); }
    hitDokdo = false;
    if (S.show.lakes && visibleLakes().some(l => inBox(l, lon, lat) && d3.geoContains(l, ll))) return null;
    // 작은 나라 우선 (큰 나라 안에 있는 바티칸·산마리노 등)
    let best = null;
    for (const f of countries) {
      if (inBox(f, lon, lat) && d3.geoContains(f, ll)) { if (!best || f.area < best.area) best = f; }
    }
    if (best) return best;
    return near(px, py, tolerance);
  }
  // 바다를 눌렀어도 가까운 작은 나라가 있으면 그 나라로
  function near(px, py, tolerance) {
    if (!S.show.tiny) return null;
    let hit = null, nd = tolerance;
    for (const f of tiny) {
      const p = proj(f.label); if (!p) continue;
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < nd) { nd = d; hit = f; }
    }
    return hit;
  }

  // ───────── 색칠 · 되돌리기 ─────────
  function commit(changes, label) {
    // changes: [[id, before, after], ...]
    if (!changes.length) return;
    for (const [id, , after] of changes) after ? S.colors.set(id, after) : S.colors.delete(id);
    undoStack.push({ changes, label }); if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    afterChange();
  }
  // 점찍기처럼 색칠이 아닌 작업: { label, undo(), redo() }
  function commitAction(a) {
    undoStack.push(a); if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0; afterChange();
  }
  function undo() {
    const a = undoStack.pop(); if (!a) return;
    if (a.undo) a.undo();
    else for (const [id, before] of a.changes) before ? S.colors.set(id, before) : S.colors.delete(id);
    redoStack.push(a); afterChange(); if (sideName === 'points') renderCities(); showToast(`되돌렸어요: ${a.label}`);
  }
  function redo() {
    const a = redoStack.pop(); if (!a) return;
    if (a.redo) a.redo();
    else for (const [id, , after] of a.changes) after ? S.colors.set(id, after) : S.colors.delete(id);
    undoStack.push(a); afterChange(); if (sideName === 'points') renderCities(); showToast(`다시 했어요: ${a.label}`);
  }
  function afterChange() {
    $('#undo').disabled = !undoStack.length;
    $('#redo').disabled = !redoStack.length;
    $('#count').textContent = `칠한 나라 ${S.colors.size}개`;
    if (typeof updateCounts === 'function') updateCounts();
    syncRegions();
    if (typeof renderRegions === 'function') renderRegions();
    if (typeof renderPoints === 'function') renderPoints();
    requestDraw(); saveSoon();
  }

  function paintTo(f, color) {
    const before = S.colors.get(f.id) || null;
    if (before === color) return;
    commit([[f.id, before, color]], f.properties.ko);
    showToast(color ? `${f.properties.ko} 칠함` : `${f.properties.ko} 지움`, true);
  }
  function paint(f) {
    const id = f.id, before = S.colors.get(id) || null;
    const name = f.properties.ko;
    let after;
    if (S.tool === 'erase') after = null;
    else after = (before && before.toLowerCase() === S.current.toLowerCase()) ? null : S.current;
    if (before === after) { showToast(`${name} — 칠해진 색이 없어요`); return; }
    commit([[id, before, after]], name);
    showToast(after ? `${name} 칠함` : `${name} 지움`, true);
  }

  // ───────── 입력: 마우스·터치 ─────────
  const pointers = new Map();
  let tap = null, pinch = null, lastTip = 0;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 1) {
      tap = { id: e.pointerId, x, y, t: performance.now(), moved: false, type: e.pointerType };
      // 점찍기 중에 찍어 둔 점을 누르면: 끌어서 옮기기
      // 라벨은 언제든 끌어 옮길 수 있어요 (점 라벨이 위에 그려지므로 먼저 확인)
      const lp = labelAt(x, y), rl = !lp && rlabelAt(x, y);
      if (lp) tap.label = { pt: lp, base: lp.off ? [...lp.off] : defaultOff(), from: lp.off ? [...lp.off] : null };
      else if (rl) tap.rlabel = { r: rl, base: rl.off ? [...rl.off] : [0, 0], from: rl.off ? [...rl.off] : null };
      else if (pointMode) { const pt = pointAt(x, y, e.pointerType === 'mouse' ? 4 : 8); if (pt) tap.point = { pt, from: [pt.lon, pt.lat] }; }
    }
    else { tap = null; pinch = null; }
    hideTip();
  });
  canvas.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (!pointers.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(x, y); return; }
    const p = pointers.get(e.pointerId);
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (pointers.size === 1) {
      if (tap && !tap.moved && Math.hypot(x - tap.x, y - tap.y) > 6) { tap.moved = true; canvas.classList.add('dragging'); }
      if (tap && tap.rlabel && tap.moved) {         // 색칠 라벨 끌기
        tap.rlabel.r.off = [tap.rlabel.base[0] + x - tap.x, tap.rlabel.base[1] + y - tap.y]; requestDraw();
      } else if (tap && tap.label && tap.moved) {          // 라벨 끌기 → 가이드선
        tap.label.pt.off = [tap.label.base[0] + x - tap.x, tap.label.base[1] + y - tap.y]; requestDraw();
      } else if (tap && tap.point && tap.moved) {
        const ll = toLonLat(x, y);
        if (ll) { tap.point.pt.lon = ll[0]; tap.point.pt.lat = ll[1]; requestDraw(); }
      } else if (!tap || tap.moved) panBy(dx, dy, x, y);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { panBy(mx - pinch.mx, my - pinch.my, mx, my); zoomAt(mx, my, d / pinch.d); }
      pinch = { mx, my, d };
    }
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (tap && tap.rlabel && tap.moved) {
      const { r, from } = tap.rlabel;
      let to = r.off; if (to && Math.hypot(to[0], to[1]) < 10) to = null;
      r.off = from;
      regionsAction(to ? '라벨 옮김' : '라벨 원래 자리', () => { const q = S.regions.find(x => x.id === r.id); if (q) q.off = to; });
      if (sideName !== 'regions') openSide('regions');      // 라벨을 옮기면 그 라벨 패널을 열어요
    } else if (tap && tap.label && tap.moved) {          // 라벨 옮기기 끝 (원래 자리 가까이 놓으면 가이드선 없앰)
      const { pt, from } = tap.label, d0 = defaultOff();
      let to = pt.off; if (to && Math.hypot(to[0] - d0[0], to[1] - d0[1]) < 12) to = null;
      pt.off = from;
      pointsAction(to ? '라벨 옮김' : '라벨 원래 자리', () => { const p = S.points.find(q => q.id === pt.id); if (p) p.off = to; });
      if (sideName !== 'points') { openSide('points'); setPtab('list'); }
      selPoint = pt.id; renderPoints();
    } else if (tap && tap.point && tap.moved) {          // 점 옮기기 끝 (목록 도시를 옮기면 직접 찍은 점이 돼요)
      const { pt, from } = tap.point, to = [pt.lon, pt.lat];
      pt.lon = from[0]; pt.lat = from[1];
      pointsAction(`${pt.label || '점'} 옮김`, () => { const p = S.points.find(q => q.id === pt.id); if (p) { p.lon = to[0]; p.lat = to[1]; if (p.city) p.city = null; } });
    } else if (tap && tap.id === e.pointerId && !tap.moved && performance.now() - tap.t < 700 && e.type === 'pointerup') {
      if (pointMode) {
        const hitP = tap.point ? tap.point.pt : tap.label ? tap.label.pt : null;
        if (hitP) selectPoint(hitP.id, true);
        else addPoint(tap.x, tap.y);
      } else {
        const f = hitTest(tap.x, tap.y, tap.type === 'mouse' ? 10 : 22);
        if (f) paint(f);
      }
    }
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) { tap = null; saveSoon(); }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pointers.size) { hoverId = null; hideTip(); requestDraw(); } });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [x, y] = pos(e);
    const k = e.ctrlKey ? 0.012 : 0.0018;
    zoomAt(x, y, Math.exp(-e.deltaY * k));
  }, { passive: false });

  function hover(x, y) {
    const now = performance.now(); if (now - lastTip < 16) return; lastTip = now;
    if (!pointMode && (labelAt(x, y) || rlabelAt(x, y))) { canvas.style.cursor = 'grab'; if (hoverId) { hoverId = null; requestDraw(); } return hideTip(); }
    if (!pointMode) canvas.style.cursor = S.tool === 'erase' ? 'cell' : '';
    if (pointMode) {
      const pt = labelAt(x, y) || pointAt(x, y, 4);
      canvas.style.cursor = pt ? 'grab' : '';
      if (hoverId) { hoverId = null; requestDraw(); }
      return hideTip();
    }
    const f = hitTest(x, y, 10);
    const id = f ? f.id : null;
    if (id !== hoverId) { hoverId = id; requestDraw(); }
    if (!f) return hideTip();
    tip.innerHTML = hitDokdo ? '독도<small>대한민국</small>' : `${f.properties.ko}<small>${f.properties.en}</small>`;
    tip.style.display = 'block';
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(W - tw - 8, x + 16) + 'px';
    tip.style.top = (y + 18) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  // ───────── 알림 ─────────
  let toastTimer;
  function showToast(text, withUndo, ms) {
    toast.querySelector('span').textContent = text;
    toast.querySelector('button').hidden = !withUndo;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms || (withUndo ? 2600 : 1600));
  }
  toast.querySelector('button').addEventListener('click', () => { undo(); });

  // ───────── 도크 (팔레트·도구) ─────────
  function renderTabs() {
    const el = $('#paletteTabs'); el.innerHTML = '';
    PALETTES.forEach((p, i) => {
      const b = document.createElement('button');
      b.textContent = p.name; b.className = i === S.palette ? 'sel' : '';
      b.onclick = () => { S.palette = i; renderTabs(); renderSwatches(); saveSoon(); };
      el.appendChild(b);
    });
  }
  function renderSwatches() {
    const el = $('#swatches'); el.innerHTML = '';
    PALETTES[S.palette].colors.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c; b.title = c;
      if (i < 9) b.innerHTML = `<kbd>${i + 1}</kbd>`;
      b.onclick = () => selectColor(c);
      el.appendChild(b);
    });
    syncSelection();
  }
  function selectColor(c) {
    S.current = c; S.tool = 'paint'; syncSelection(); saveSoon();
  }
  function syncSelection() {
    let found = false;
    document.querySelectorAll('.swatch').forEach(b => {
      const on = S.tool === 'paint' && b.title.toLowerCase() === S.current.toLowerCase();
      b.classList.toggle('sel', on); found = found || on;
    });
    $('.custom').classList.toggle('sel', S.tool === 'paint' && !found);
    $('.custom').style.setProperty('--c', S.current);
    $('#eraser').classList.toggle('sel', S.tool === 'erase');
    const dot = $('#colorBtn .dot'); if (dot) dot.style.background = S.tool === 'erase' ? '#fff' : S.current;
    canvas.style.cursor = S.tool === 'erase' ? 'cell' : '';
  }
  $('#customColor').addEventListener('input', e => selectColor(e.target.value.toUpperCase()));
  $('#eraser').addEventListener('click', () => { S.tool = S.tool === 'erase' ? 'paint' : 'erase'; syncSelection(); });

  // ───────── 레이어·설정 ─────────
  document.querySelectorAll('input[data-layer]').forEach(cb => {
    cb.addEventListener('change', () => { S.show[cb.dataset.layer] = cb.checked; syncLayers(); requestDraw(); saveSoon(); });
  });
  function syncLayers() {
    document.querySelectorAll('input[data-layer]').forEach(cb => { cb.checked = !!S.show[cb.dataset.layer]; });
    $('#lineWidth').closest('.row').classList.toggle('off', !S.show.borders && !S.show.kp);
    document.querySelector('[data-layer="borders"]').closest('.row').classList.toggle('off', !S.show.borders && !S.show.kp);
    document.querySelectorAll('#dashSeg button').forEach(b => b.classList.toggle('sel', (b.dataset.dash === '1') === !!S.borderDash));
  }
  document.querySelectorAll('#dashSeg button').forEach(b => b.addEventListener('click', () => {
    S.borderDash = b.dataset.dash === '1'; syncLayers(); requestDraw(); saveSoon();
  }));
  const layersBtn = $('#layersBtn'), layersPanel = $('#layersPanel');
  function openLayers(open) {
    layersPanel.hidden = !open; layersBtn.setAttribute('aria-expanded', String(open));
  }
  layersBtn.addEventListener('click', e => { e.stopPropagation(); openLayers(layersPanel.hidden); });
  document.addEventListener('pointerdown', e => {
    if (!layersPanel.hidden && !layersPanel.contains(e.target) && !layersBtn.contains(e.target)) openLayers(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') openLayers(false); });

  function renderMiniSwatches() {
    document.querySelectorAll('.mini-swatches').forEach(el => {
      const key = el.dataset.target, list = key === 'land' ? LAND_COLORS : OCEAN_COLORS;
      el.innerHTML = '';
      list.forEach(c => {
        const b = document.createElement('button'); b.style.background = c; b.title = c;
        b.className = S[key].toLowerCase() === c.toLowerCase() ? 'sel' : '';
        b.onclick = () => { S[key] = c; renderMiniSwatches(); requestDraw(); saveSoon(); };
        el.appendChild(b);
      });
    });
  }
  const lineInput = $('#lineWidth'), lineOut = $('#lineWidthOut');
  lineInput.addEventListener('input', () => { S.line = +lineInput.value; lineOut.textContent = S.line.toFixed(1); requestDraw(); saveSoon(); });

  // ───────── 초기화 (되돌리기로 되살릴 수 있게 전체 상태를 기억) ─────────
  const KEEP = ['current', 'palette', 'land', 'ocean', 'line', 'borderDash', 'show', 'lakes', 'points', 'pstyle', 'fill', 'regions', 'rfill', 'rfont', 'proj', 'eeLon'];
  const fullSnap = () => JSON.parse(JSON.stringify({ ...Object.fromEntries(KEEP.map(k => [k, S[k]])), colors: [...S.colors] }));
  function applySnap(sn) {
    const proj0 = S.proj;
    for (const k of KEEP) S[k] = JSON.parse(JSON.stringify(sn[k]));
    S.colors = new Map(sn.colors);
    if (S.proj !== proj0) { const to = S.proj; S.proj = proj0; setProjection(to, true); }
    renderTabs(); renderSwatches(); renderMiniSwatches(); syncLayers(); syncProjUI();
    lineInput.value = S.line; lineOut.textContent = S.line.toFixed(1);
    selPoint = null;
    if (sideName === 'points') { renderPstyle(); renderCities(); }
    if (sideName === 'regions') renderRstyle();
    if (sideName === 'lakes') renderLakes();
  }
  function resetAll() {
    const before = fullSnap();
    const def = JSON.parse(JSON.stringify(DEFAULTS));
    applySnap({ ...Object.fromEntries(KEEP.map(k => [k, def[k]])), colors: [] });
    const after = fullSnap();
    commitAction({ label: '초기화', undo: () => applySnap(before), redo: () => applySnap(after) });
    goHome();
    showToast('처음 상태로 돌렸어요', true);
  }
  const askReset = () => { $('#resetConfirm').hidden = false; $('#resetOk').focus(); };
  $('#resetBtn').addEventListener('click', askReset);
  $('#brand').addEventListener('click', askReset);   // 제목을 눌러도 초기화
  // 도움말
  $('#helpBtn').addEventListener('click', () => { $('#helpDlg').hidden = false; });
  $('#helpClose').addEventListener('click', () => { $('#helpDlg').hidden = true; });
  $('#helpDlg').addEventListener('click', e => { if (e.target.id === 'helpDlg') $('#helpDlg').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#helpDlg').hidden = true; $('#exportDlg').hidden = true; } });
  $('#resetCancel').addEventListener('click', () => { $('#resetConfirm').hidden = true; });
  $('#resetConfirm').addEventListener('click', e => { if (e.target.id === 'resetConfirm') $('#resetConfirm').hidden = true; });
  $('#resetOk').addEventListener('click', () => { $('#resetConfirm').hidden = true; resetAll(); });

  // ───────── 팔레트 접기 ─────────
  function syncDock() {
    document.body.classList.toggle('dock-hidden', !!S.dockHidden);
    if (!S.dockHidden) openLayers(false);
    $('#colorBtn .dot').style.background = S.tool === 'erase' ? '#fff' : S.current;
    $('#colorBtn').classList.toggle('on', !S.dockHidden && !pointMode);
    resize(); requestDraw();
  }
  $('#dockHide').addEventListener('click', () => { S.dockHidden = true; syncDock(); saveSoon(); });
  $('#colorBtn').addEventListener('click', e => {
    e.stopPropagation();
    if (pointMode) { openSide(null); S.dockHidden = false; }      // 점찍기 중이면 색칠하기로 바꿈
    else S.dockHidden = !S.dockHidden;
    syncDock(); saveSoon();
  });

  // ───────── 상단 버튼·확대 ─────────
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#clear').addEventListener('click', () => {
    if (!S.colors.size) return showToast('지울 색이 없어요');
    const changes = [...S.colors].map(([id, c]) => [id, c, null]);
    commit(changes, '모두 지우기');
    showToast(`${changes.length}개 나라의 색을 지웠어요`, true);
  });
  // 확대 비율 (세계 전체 = 100%)
  const ZREF = 1000 / (2 * Math.PI);
  const zoomPct = $('#zoomPct');
  let lastPct = '';
  function updateZoomPct() {
    const v = String(Math.round(s / ZREF * 100));   // 화면 크기와 상관없는 값: 100 = 적도 둘레가 1000px
    if (v !== lastPct && document.activeElement !== zoomPct) { zoomPct.value = v; lastPct = v; }
  }
  function zoomToPct(pct) {
    const target = Math.max(sMin * MIN_ZOOM, Math.min(sMin * MAX_ZOOM, pct / 100 * ZREF));
    zoomAt((area.left + W - (area.right || 0)) / 2, (area.top + area.bot) / 2, target / s);
  }
  zoomPct.addEventListener('focus', () => zoomPct.select());
  zoomPct.addEventListener('keydown', e => {
    if (e.key === 'Enter') { zoomPct.blur(); }
    else if (e.key === 'Escape') { lastPct = ''; zoomPct.blur(); }
    e.stopPropagation();
  });
  zoomPct.addEventListener('blur', () => {
    const v = parseFloat(zoomPct.value.replace(/[^\d.]/g, ''));
    lastPct = '';
    if (isFinite(v) && v > 0) zoomToPct(v); else requestDraw();
  });
  $('#zoomIn').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.6));
  $('#zoomOut').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.6));
  $('#home').addEventListener('click', goHome);
  document.querySelectorAll('#projSeg button').forEach(b => b.addEventListener('click', () => setProjection(b.dataset.proj)));

  // ───────── 키보드 ─────────
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (pointMode && (e.key === 'Delete' || e.key === 'Backspace') && selPoint) { e.preventDefault(); deletePoint(selPoint); }
    else if (e.key === 'Escape' && pointMode && selPoint) { selPoint = null; renderPoints(); requestDraw(); }
    else if (!mod && e.key.toLowerCase() === 'p') { setProjection(isEE() ? 'merc' : 'ee'); }
    else if (!mod && e.key.toLowerCase() === 'e') { S.tool = S.tool === 'erase' ? 'paint' : 'erase'; syncSelection(); }
    else if (!mod && /^[1-9]$/.test(e.key)) {
      const c = PALETTES[S.palette].colors[+e.key - 1]; if (c) selectColor(c);
    }
    else if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.4);
    else if (e.key === '-') zoomAt(W / 2, H / 2, 1 / 1.4);
    else if (e.key.startsWith('Arrow')) {
      const d = 60; panBy(e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0, W / 2, H / 2);
    }
  });

  // ───────── 점 그리기 (도시·직접 찍은 점 모두 같은 모양) ─────────
  // 모양 그리기 (지도 위 점, 목록 미리보기 공용)
  function drawSymbol(g, shape, x, y, r, fill, outline) {
    g.beginPath();
    if (shape === 'square') { const h = r * 0.9; g.rect(x - h, y - h, 2 * h, 2 * h); }
    else if (shape === 'triangle') { const R = r * 1.3; g.moveTo(x, y - R); g.lineTo(x + R * 0.866, y + R * 0.5); g.lineTo(x - R * 0.866, y + R * 0.5); g.closePath(); }
    else if (shape === 'diamond') { const R = r * 1.25; g.moveTo(x, y - R); g.lineTo(x + R, y); g.lineTo(x, y + R); g.lineTo(x - R, y); g.closePath(); }
    else if (shape === 'star') {
      const R = r * 1.4, q = R * 0.45;
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? q : R; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
      g.closePath();
    }
    else if (shape === 'cross') {
      const L = r * 1.2, t = r * 0.42;
      g.moveTo(x - t, y - L); g.lineTo(x + t, y - L); g.lineTo(x + t, y - t); g.lineTo(x + L, y - t); g.lineTo(x + L, y + t); g.lineTo(x + t, y + t);
      g.lineTo(x + t, y + L); g.lineTo(x - t, y + L); g.lineTo(x - t, y + t); g.lineTo(x - L, y + t); g.lineTo(x - L, y - t); g.lineTo(x - t, y - t); g.closePath();
    }
    else g.arc(x, y, r, 0, 2 * Math.PI);
    g.fillStyle = fill; g.fill();
    if (outline) { g.lineWidth = 1.3; g.strokeStyle = '#1d2733'; g.lineJoin = 'round'; g.stroke(); }
  }
  const labelFont = () => S.pstyle.font || 14;   // 글자 크기 (점 크기와 따로)
  const defaultOff = () => [S.pstyle.size * 1.35 + 4, 0];
  let labelBoxes = [];   // 지도 위 라벨 자리 (끌어 옮기기용)
  function drawPoints() {
    labelBoxes = [];
    if (!S.points.length) return;
    const st = S.pstyle, r = st.size, fs = labelFont();
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    ctx.font = `700 ${fs}px ${LABEL_FONT}`;
    for (const pt of S.points) {
      const p = proj([pt.lon, pt.lat]); if (!p || p[0] < -200 || p[0] > W + 200 || p[1] < -200 || p[1] > H + 200 || outRect(p)) continue;
      if (pt.id === selPoint && pointMode && !EXP) {
        ctx.beginPath(); ctx.arc(p[0], p[1], r * 1.5 + 5, 0, 2 * Math.PI);
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1f6feb'; ctx.stroke(); ctx.setLineDash([]);
      }
      if (pt.label) {
        const off = pt.off || defaultOff(), ax = p[0] + off[0], ay = p[1] + off[1];
        ensureFont(`700 ${fs}px "Noto Serif KR"`, pt.label);
        const w = ctx.measureText(pt.label).width;
        const box = [ax - 3, ay - fs / 2 - 3, ax + w + 3, ay + fs / 2 + 3];
        // 가이드선: 라벨을 점에서 떼어 놓았으면 점과 라벨을 이어요
        if (pt.off && pt.guide !== false) {
          // 라벨 네 모서리(왼쪽 위·왼쪽 아래·오른쪽 위·오른쪽 아래) 중 점 쪽 모서리에 연결
          const mx = (box[0] + box[2]) / 2, my = (box[1] + box[3]) / 2;
          const nx = p[0] > mx ? box[2] - 2 : box[0] + 2, ny = p[1] < my ? box[1] + 2 : box[3] - 2;
          const d = Math.hypot(nx - p[0], ny - p[1]);
          if (d > r + 6) {
            const ux = (nx - p[0]) / d, uy = (ny - p[1]) / d;
            ctx.beginPath(); ctx.moveTo(p[0] + ux * (r + 1.5), p[1] + uy * (r + 1.5)); ctx.lineTo(nx, ny);
            ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
            ctx.lineWidth = 1; ctx.strokeStyle = '#1d2733'; ctx.stroke();
          }
        }
        labelBoxes.push({ pt, box });
        pt._lab = [ax, ay];
      }
    }
    // 점은 가이드선 위에, 라벨은 맨 위에
    for (const pt of S.points) {
      const p = proj([pt.lon, pt.lat]); if (!p || outRect(p)) continue;
      drawSymbol(ctx, st.shape, p[0], p[1], r, st.color, st.outline || st.color.toUpperCase() === '#FFFFFF');
    }
    for (const { pt } of labelBoxes) {
      const [ax, ay] = pt._lab;
      ctx.lineWidth = Math.max(3.2, fs * 0.28); ctx.strokeStyle = '#fff'; ctx.strokeText(pt.label, ax, ay);
      ctx.fillStyle = '#1d2733'; ctx.fillText(pt.label, ax, ay);
    }
    ctx.restore();
  }
  function labelAt(x, y) {
    for (let i = labelBoxes.length - 1; i >= 0; i--) {
      const { pt, box } = labelBoxes[i];
      if (x >= box[0] - 2 && x <= box[2] + 2 && y >= box[1] - 2 && y <= box[3] + 2) return pt;
    }
    return null;
  }

  // ───────── 점찍기 ─────────
  let pointMode = false, selPoint = null, ptab = 'cities';
  const SHAPES = [['circle', '동그라미'], ['square', '네모'], ['triangle', '세모'], ['diamond', '마름모'], ['star', '별'], ['cross', '십자']];
  const PCOLORS = ['#1A1A1A', '#7F7F7F', '#FFFFFF', '#E63946', '#F4A261', '#F9C74F', '#2A9D8F', '#277DA1', '#7B61FF', '#E56BCF'];
  const SEQ = ['alpha', 'hangulp', 'hangul'];
  const HANGUL = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
  const seqLabel = (mode, i) => {
    if (mode === 'alpha') { let t = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); } return t; }
    const h = `${HANGUL[i % 14]}${i >= 14 ? Math.floor(i / 14) + 1 : ''}`;
    if (mode === 'hangulp') return `(${h})`;
    if (mode === 'hangul') return h;
    return '';
  };
  // A B C 또는 (가)(나)로 채운 상태면, 점을 더하거나 빼거나 순서를 바꿀 때 다시 차례대로 붙여요
  function relabel() {
    if (SEQ.includes(S.fill)) S.points.forEach((p, i) => { p.label = seqLabel(S.fill, i); });
  }
  function toLonLat(x, y) {
    const ll = proj.invert([x, y]);
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return null;
    if (isEE()) { const b = proj(ll); if (!b || Math.hypot(b[0] - x, b[1] - y) > 1) return null; }
    if (Math.abs(ll[1]) > 85) return null;
    return [+normLon(ll[0]).toFixed(4), +ll[1].toFixed(4)];
  }
  function pointAt(x, y, pad) {
    for (let i = S.points.length - 1; i >= 0; i--) {
      const pt = S.points[i], p = proj([pt.lon, pt.lat]);
      if (p && Math.hypot(p[0] - x, p[1] - y) <= S.pstyle.size * 1.3 + pad) return pt;
    }
    return null;
  }
  // 점 목록을 바꾸는 작업은 전과 후를 통째로 기억해서 되돌려요
  const snapPoints = () => ({ points: S.points.map(p => ({ ...p, off: p.off ? [...p.off] : null })), fill: S.fill || null });
  const restorePoints = sn => { S.points = sn.points.map(p => ({ ...p, off: p.off ? [...p.off] : null })); S.fill = sn.fill; if (!S.points.some(p => p.id === selPoint)) selPoint = null; };
  let lastTag = null;
  function pointsAction(label, mutate, tag) {
    const top = undoStack[undoStack.length - 1], now = performance.now();
    if (tag && lastTag && lastTag.tag === tag && lastTag.action === top && now - lastTag.t < 1500) {
      mutate(); lastTag.action.after = snapPoints(); lastTag.t = now; afterChange(); return;
    }
    const before = snapPoints(); mutate(); const after = snapPoints();
    const action = { label, before, after, undo() { restorePoints(this.before); }, redo() { restorePoints(this.after); } };
    lastTag = tag ? { tag, action, t: now } : null;
    commitAction(action);
  }
  let pid = Date.now() % 1e6;
  const newId = () => 'p' + (++pid);
  function addPoint(x, y) {
    const ll = toLonLat(x, y);
    if (!ll) return showToast('지도 바깥에는 점을 찍을 수 없어요');
    let pt;
    pointsAction('점 찍음', () => { pt = { id: newId(), lon: ll[0], lat: ll[1], city: null, label: '', off: null }; S.points.push(pt); relabel(); });
    selPoint = pt.id; if (ptab === 'cities') renderCities(); else setPtab('list');
    showToast(`점 찍음${pt.label ? ' (' + pt.label + ')' : ''} · ‘라벨 입력’에서 라벨을 넣을 수 있어요`, true);
  }
  function deletePoint(id) {
    const pt = S.points.find(p => p.id === id); if (!pt) return;
    const name = pt.label || pt.city || '점';
    pointsAction(`${name} 삭제`, () => { S.points = S.points.filter(p => p.id !== id); relabel(); });
    if (selPoint === id) selPoint = null;
    showToast(`${name} 삭제`, true);
  }
  function toggleCity(c, on) {
    if (on) pointsAction(`${c.name} 추가`, () => { S.points.push({ id: newId(), lon: c.lon, lat: c.lat, city: c.name, label: c.name, off: null }); relabel(); });
    else pointsAction(`${c.name} 뺌`, () => { S.points = S.points.filter(p => p.city !== c.name); relabel(); });
  }
  function selectPoint(id, scroll) {
    selPoint = id;
    if (id) setPtab('list');
    renderPoints(); requestDraw();
    if (id && scroll) { const row = $(`#pointList [data-id="${id}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); }
  }
  function setStyle(patch) { Object.assign(S.pstyle, patch); saveSoon(); renderPstyle(); renderPoints(); requestDraw(); }

  // ───────── 색칠한 나라 라벨 ─────────
  // 칠한 나라 목록과 맞춰요: 새로 칠한 나라는 끝에 붙고, 색을 지운 나라는 빠져요
  function syncRegions() {
    const before = S.regions.length;
    S.regions = S.regions.filter(r => S.colors.has(r.id));
    const have = new Set(S.regions.map(r => r.id));
    for (const id of S.colors.keys()) if (!have.has(id)) S.regions.push({ id, label: '', off: null });
    if (S.regions.length !== before || SEQ.includes(S.rfill)) relabelRegions();
  }
  function relabelRegions() {
    if (SEQ.includes(S.rfill)) S.regions.forEach((r, i) => { r.label = seqLabel(S.rfill, i); });
  }
  const snapRegions = () => ({ regions: S.regions.map(r => ({ ...r, off: r.off ? [...r.off] : null })), rfill: S.rfill || null });
  const restoreRegions = sn => { S.regions = sn.regions.map(r => ({ ...r, off: r.off ? [...r.off] : null })); S.rfill = sn.rfill; };
  let lastRTag = null;
  function regionsAction(label, mutate, tag) {
    const top = undoStack[undoStack.length - 1], now = performance.now();
    if (tag && lastRTag && lastRTag.tag === tag && lastRTag.action === top && now - lastRTag.t < 1500) {
      mutate(); lastRTag.action.after = snapRegions(); lastRTag.t = now; afterChange(); return;
    }
    const before = snapRegions(); mutate(); const after = snapRegions();
    const action = { label, before, after, undo() { restoreRegions(this.before); }, redo() { restoreRegions(this.after); } };
    lastRTag = tag ? { tag, action, t: now } : null;
    commitAction(action);
  }
  let rlabelBoxes = [];
  function drawRegionLabels() {
    rlabelBoxes = [];
    const list = S.regions.filter(r => r.label && byId.has(r.id));
    if (!list.length) return;
    const fs = S.rfont;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = `700 ${fs}px ${LABEL_FONT}`;
    for (const r of list) {
      const f = byId.get(r.id), a = proj(f.label);
      if (!a || a[0] < -300 || a[0] > W + 300 || a[1] < -300 || a[1] > H + 300 || outRect(a)) continue;
      ensureFont(`700 ${fs}px "Noto Serif KR"`, r.label);
      const off = r.off || [0, 0], cx = a[0] + off[0], cy = a[1] + off[1];
      const w = ctx.measureText(r.label).width;
      const box = [cx - w / 2 - 3, cy - fs / 2 - 3, cx + w / 2 + 3, cy + fs / 2 + 3];
      if (r.off && r.guide !== false && Math.hypot(off[0], off[1]) > fs * 0.9) {   // 가이드선: 나라 안쪽 기준점 → 라벨 모서리
        const nx = a[0] > cx ? box[2] - 2 : box[0] + 2, ny = a[1] < cy ? box[1] + 2 : box[3] - 2;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(nx, ny);
        ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = '#1a1a1a'; ctx.stroke();
      }
      ctx.lineWidth = Math.max(3.5, fs * 0.3); ctx.strokeStyle = '#fff'; ctx.strokeText(r.label, cx, cy);
      ctx.fillStyle = '#111'; ctx.fillText(r.label, cx, cy);
      rlabelBoxes.push({ r, box });
    }
    ctx.restore();
  }
  function rlabelAt(x, y) {
    for (let i = rlabelBoxes.length - 1; i >= 0; i--) {
      const { r, box } = rlabelBoxes[i];
      if (x >= box[0] - 3 && x <= box[2] + 3 && y >= box[1] - 3 && y <= box[3] + 3) return r;
    }
    return null;
  }
  function renderRstyle() { $('#rFont').value = S.rfont; $('#rFontOut').textContent = S.rfont; }
  $('#rFont').addEventListener('input', e => { S.rfont = +e.target.value; $('#rFontOut').textContent = S.rfont; requestDraw(); saveSoon(); });
  function renderRegions() {
    updateCounts();
    if (sideName !== 'regions') return;
    document.querySelectorAll('[data-rfill]').forEach(b => b.classList.toggle('sel', b.dataset.rfill === S.rfill));
    const list = $('#regionList');
    if ((list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') || dragRow) return;
    list.innerHTML = '';
    if (!S.regions.length) { list.innerHTML = '<div class="empty">아직 칠한 나라가 없어요.<br>나라를 칠하면 여기에 차례대로 나와요.</div>'; return; }
    for (const r of S.regions) {
      const f = byId.get(r.id); if (!f) continue;
      const row = document.createElement('div'); row.className = 'prow-item'; row.dataset.id = r.id;
      row.innerHTML = `<span class="grip" title="끌어서 순서 바꾸기">⋮⋮</span><span class="rsw" style="background:${S.colors.get(r.id)}"></span>`;
      const inp = document.createElement('input'); inp.value = r.label; inp.placeholder = '라벨 입력';
      inp.oninput = () => {
        regionsAction('라벨 수정', () => { const q = S.regions.find(x => x.id === r.id); if (q) q.label = inp.value; S.rfill = null; }, 'rl:' + r.id);
        document.querySelectorAll('[data-rfill]').forEach(b => b.classList.remove('sel'));
      };
      inp.onkeydown = e => { if (e.key === 'Enter') { const nx = row.nextElementSibling && row.nextElementSibling.querySelector('input'); nx ? nx.focus() : inp.blur(); } };
      const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = f.properties.ko;
      row.append(inp, meta);
      if (r.off) {
        const rs = document.createElement('button'); rs.className = 'reset'; rs.title = '라벨을 원래 자리로';
        rs.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
        rs.onclick = e => { e.stopPropagation(); regionsAction('라벨 위치 되돌림', () => { const q = S.regions.find(x => x.id === r.id); if (q) q.off = null; }); };
        const gd = document.createElement('button'); gd.className = 'guide' + (r.guide !== false ? ' on' : ''); gd.title = r.guide !== false ? '가이드선 끄기' : '가이드선 켜기';
        gd.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="5" cy="19" r="2.2"/><path d="M7 17 17 7"/><path d="M14 5h6v4"/></svg>';
        gd.onclick = e => { e.stopPropagation(); regionsAction(r.guide !== false ? '가이드선 끔' : '가이드선 켬', () => { const q = S.regions.find(x => x.id === r.id); if (q) q.guide = q.guide === false; }); };
        row.append(gd, rs);
      }
      const del = document.createElement('button'); del.className = 'del'; del.title = '이 나라 색 지우기';
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.onclick = e => { e.stopPropagation(); paintTo(f, null); };
      row.append(del);
      row.querySelector('.grip').addEventListener('pointerdown', e => startRowDrag(e, row, list, order => {
        if (order.join() !== S.regions.map(x => x.id).join()) regionsAction('순서 바꿈', () => { S.regions = order.map(id => S.regions.find(x => x.id === id)); relabelRegions(); });
        else renderRegions();
      }));
      list.appendChild(row);
    }
  }
  document.querySelectorAll('[data-rfill]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.rfill;
    if (!S.regions.length) return showToast('먼저 나라를 칠해 주세요');
    const names = { alpha: 'A B C', hangulp: '(가)(나)(다)', hangul: '가 나 다', name: '나라 이름', clear: '지우기' };
    regionsAction(`라벨 ${names[mode]}`, () => {
      if (SEQ.includes(mode)) { S.rfill = mode; relabelRegions(); }
      else if (mode === 'name') { S.rfill = null; S.regions.forEach(r => { const f = byId.get(r.id); r.label = f ? f.properties.ko : ''; }); }
      else { S.rfill = null; S.regions.forEach(r => { r.label = ''; }); }
    });
  }));

  // ───────── 오른쪽 패널 ─────────
  const side = $('#side');
  const cityByName = new Map(WM_PLACES.CITIES.map(c => [c.name, c]));
  let sideName = null;
  function openSide(name) {
    if (name === sideName) name = null;
    sideName = name;
    side.hidden = !name;
    side.querySelectorAll('section').forEach(sec => sec.classList.toggle('on', sec.dataset.panel === name));
    document.querySelectorAll('.pill.tp').forEach(b => b.classList.toggle('on', b.dataset.side === name));
    document.body.classList.toggle('side-open', !!name);
    pointMode = name === 'points';
    document.body.classList.toggle('label-mode', name === 'regions');
    if (!pointMode) selPoint = null;
    document.body.classList.toggle('point-mode', pointMode);
    $('#colorBtn').classList.toggle('on', !S.dockHidden && !pointMode);
    $('#pointBanner').hidden = !pointMode;
    canvas.style.cursor = '';
    if (typeof openLayers === 'function') openLayers(false);
    if (name === 'lakes') renderLakes();
    if (name === 'regions') { renderRstyle(); renderRegions(); }
    document.body.classList.remove('sheet-min');
    if (name === 'points') { setPtab('cities'); renderPstyle(); renderCities(); renderPoints(); }
    hoverId = null; hideTip();
    resize(); requestDraw();
  }
  function updateCounts() {
    $('#lakesCount').textContent = !S.show.lakes ? '' : S.lakes.all ? '전체' : (S.lakes.sel.length || '');
    $('#pointsCount').textContent = S.points.length || '';
    $('#colorCount').textContent = S.colors.size || '';
    $('#pointDot').style.background = S.pstyle.color;
    $('#regionsCount').textContent = S.regions.filter(r => r.label).length || '';
  }
  function setPtab(t) {
    if (t === 'style' && !isPhone()) t = 'cities';     // '점 모양' 탭은 폰에만 (PC는 위에 늘 보임)
    ptab = t;
    side.querySelector('[data-panel="points"]').classList.toggle('ptab-style', t === 'style');
    document.querySelectorAll('[data-ptab]').forEach(b => b.classList.toggle('sel', b.dataset.ptab === t));
    document.querySelectorAll('[data-pbody]').forEach(b => { b.hidden = b.dataset.pbody !== t; });
    if (t === 'cities') renderCities(); else if (t === 'list') renderPoints();
  }
  // 폰: 시트 접기/펴기 (접으면 제목과 탭만 남아 지도를 넓게 봐요)
  function setSheetMin(on) {
    document.body.classList.toggle('sheet-min', on);
    resize(); requestDraw();
  }
  document.querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => setSheetMin(!document.body.classList.contains('sheet-min'))));
  document.querySelectorAll('[data-ptab]').forEach(b => b.addEventListener('click', () => {
    if (document.body.classList.contains('sheet-min')) setSheetMin(false);   // 접힌 상태에서 탭을 누르면 펼침
    setPtab(b.dataset.ptab);
  }));

  // 호수
  function renderLakes() {
    const list = $('#lakeList'); list.innerHTML = '';
    for (const def of WM_PLACES.LAKES) {
      const lab = document.createElement('label'); lab.className = 'chk';
      lab.innerHTML = `<input type="checkbox"><span>${def.ko}</span>`;
      const cb = lab.querySelector('input'); cb.checked = S.lakes.sel.includes(def.ko); cb.disabled = S.lakes.all;
      cb.onchange = () => {
        S.lakes.sel = cb.checked ? [...S.lakes.sel, def.ko] : S.lakes.sel.filter(k => k !== def.ko);
        lakesChanged();
      };
      list.appendChild(lab);
    }
    list.style.opacity = S.lakes.all ? .45 : 1;
    $('#lakesAll').checked = S.lakes.all;
    const sum = $('#lakesSummary');
    sum.className = 'note' + (S.lakes.all || S.lakes.sel.length ? '' : ' muted');
    sum.textContent = !S.show.lakes ? '‘지도 요소’에서 호수가 꺼져 있어요. 고르면 다시 켜져요.'
      : S.lakes.all ? '전체 호수를 표시하고 있어요' : S.lakes.sel.length ? `✓ 주요 호수 ${S.lakes.sel.length}개 표시 중` : '표시 중인 호수가 없어요';
  }
  function lakesChanged() {
    if (!S.show.lakes) { S.show.lakes = true; syncLayers(); }
    renderLakes(); updateCounts(); requestDraw(); saveSoon();
  }
  $('#lakesAll').addEventListener('change', e => { S.lakes.all = e.target.checked; lakesChanged(); });
  $('#lakesNone').addEventListener('click', () => { S.lakes = { sel: [], all: false }; lakesChanged(); });
  $('#lakesDefault').addEventListener('click', () => { S.lakes = { sel: WM_PLACES.LAKES.filter(l => l.on).map(l => l.ko), all: false }; lakesChanged(); });

  // 도시 고르기 (고른 도시는 '찍은 점'에 들어가요)
  const closedGroups = new Set(WM_PLACES.CONTINENTS);   // 처음엔 대륙을 접어 둠
  function renderCities() {
    if (sideName !== 'points') return;
    const q = $('#citySearch').value.trim();
    const box = $('#cityGroups'); box.innerHTML = '';
    const chosen = new Set(S.points.filter(p => p.city).map(p => p.city));
    let shown = 0;
    for (const cont of WM_PLACES.CONTINENTS) {
      const all = WM_PLACES.CITIES.filter(c => c.c === cont);
      const items = all.filter(c => !q || c.name.includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      if (!items.length) continue;
      shown += items.length;
      const on = all.filter(c => chosen.has(c.name)).length;
      const g = document.createElement('div'); g.className = 'cgroup' + (closedGroups.has(cont) && !q ? ' closed' : '');
      g.innerHTML = `<div class="ghead"><button class="gtoggle"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>${cont} <small>${all.length}</small><em>${on ? '✓' + on : ''}</em></button><button class="gall">${on === all.length ? '모두 해제' : '모두 선택'}</button></div><div class="clist"></div>`;
      g.querySelector('.gtoggle').onclick = () => { closedGroups.has(cont) ? closedGroups.delete(cont) : closedGroups.add(cont); renderCities(); };
      g.querySelector('.gall').onclick = () => {
        if (on === all.length) {
          const names = new Set(all.map(c => c.name));
          pointsAction(`${cont} 도시 모두 해제`, () => { S.points = S.points.filter(p => !names.has(p.city)); relabel(); });
        } else {
          const add = all.filter(c => !chosen.has(c.name)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
          pointsAction(`${cont} 도시 ${add.length}개 추가`, () => { for (const c of add) S.points.push({ id: newId(), lon: c.lon, lat: c.lat, city: c.name, label: c.name, off: null }); relabel(); });
          showToast(`${cont} 도시 ${add.length}개를 더했어요`, true);
        }
      };
      const cl = g.querySelector('.clist');
      for (const c of items) {
        const lab = document.createElement('label'); lab.className = 'chk';
        lab.innerHTML = `<input type="checkbox"><span>${c.name}</span>`;
        const cb = lab.querySelector('input'); cb.checked = chosen.has(c.name);
        cb.onchange = () => toggleCity(c, cb.checked);
        cl.appendChild(lab);
      }
      box.appendChild(g);
    }
    // 직접 찍은 곳: 오세아니아 아래에 찍은 순서대로
    const free = S.points.filter(p => !p.city && (!q || (p.label || '').includes(q)));
    if (!q || free.length) {
      const g = document.createElement('div'); g.className = 'cgroup free' + (closedGroups.has('free') ? ' closed' : '');
      g.innerHTML = `<div class="ghead"><button class="gtoggle"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>직접 찍은 곳 <small>${S.points.filter(p => !p.city).length}</small></button></div><div class="clist"></div>`;
      g.querySelector('.gtoggle').onclick = () => { closedGroups.has('free') ? closedGroups.delete('free') : closedGroups.add('free'); renderCities(); };
      const cl = g.querySelector('.clist');
      if (!free.length) cl.innerHTML = '<div class="hint" style="padding:6px 22px">아직 없어요. 지도를 눌러 찍어 보세요.</div>';
      for (const pt of free) {
        const lab = document.createElement('label'); lab.className = 'chk';
        lab.innerHTML = `<input type="checkbox" checked><span></span><small>${fmtLL(pt.lon, pt.lat)}</small>`;
        lab.querySelector('span').textContent = pt.label || '(라벨 없음)';
        lab.querySelector('input').onchange = () => deletePoint(pt.id);
        cl.appendChild(lab);
      }
      box.appendChild(g); shown += free.length || 1;
    }
    if (!shown) box.innerHTML = `<div class="empty">‘${q.replace(/</g, '&lt;')}’ 도시가 목록에 없어요.<br>지도를 눌러 직접 찍을 수 있어요.</div>`;
  }
  $('#citySearch').addEventListener('input', renderCities);

  // 점 모양 (모든 점 공통)
  const shapeIcon = (sh, col) => { const c = document.createElement('canvas'); c.width = c.height = 32; drawSymbol(c.getContext('2d'), sh, 16, 16, 8, col, false); return c.toDataURL(); };
  function renderPstyle() {
    const st = S.pstyle;
    const pc = $('#pColors'); pc.innerHTML = '';
    let found = false;
    for (const c of PCOLORS) {
      const b = document.createElement('button'); b.style.background = c; b.title = c;
      if (c.toLowerCase() === st.color.toLowerCase()) { b.className = 'sel'; found = true; }
      b.onclick = () => setStyle({ color: c }); pc.appendChild(b);
    }
    const cl = document.createElement('label'); cl.title = '원하는 색 고르기'; if (!found) cl.className = 'sel';
    cl.innerHTML = `<input type="color" value="${st.color}">`;
    cl.querySelector('input').oninput = e => setStyle({ color: e.target.value.toUpperCase() });
    pc.appendChild(cl);
    $('#pSize').value = st.size; $('#pSizeOut').textContent = st.size;
    $('#pFont').value = st.font; $('#pFontOut').textContent = st.font;
    $('#styDot').style.background = st.color;
    $('#pOutline').checked = !!st.outline;
  }
  $('#pSize').addEventListener('input', e => { $('#pSizeOut').textContent = e.target.value; setStyle({ size: +e.target.value }); });
  $('#pOutline').addEventListener('change', e => setStyle({ outline: e.target.checked }));
  $('#pFont').addEventListener('input', e => { $('#pFontOut').textContent = e.target.value; setStyle({ font: +e.target.value }); });

  // 찍은 점 목록
  const fmtLL = (lon, lat) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  let symURL = '', symKey = '';
  function renderPoints() {
    updateCounts();
    $('#plistCount').textContent = S.points.length || '';
    if (sideName !== 'points') return;
    if (ptab === 'cities') return renderCities();
    document.querySelectorAll('[data-fill]').forEach(b => b.classList.toggle('sel', b.dataset.fill === S.fill));
    const list = $('#pointList');
    if ((list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') || dragRow) return;   // 라벨을 고치거나 끄는 중이면 다시 그리지 않음
    list.innerHTML = '';
    if (!S.points.length) { list.innerHTML = '<div class="empty">아직 찍은 점이 없어요.<br>‘도시 고르기’에서 고르거나 지도를 눌러 찍어요.</div>'; return; }
    const st = S.pstyle, key = st.shape + st.color + st.outline;
    if (key !== symKey) {
      const c = document.createElement('canvas'); c.width = c.height = 44; const g = c.getContext('2d'); g.scale(2, 2);
      drawSymbol(g, st.shape, 11, 11, 6, st.color, st.outline || st.color.toUpperCase() === '#FFFFFF'); symURL = c.toDataURL(); symKey = key;
    }
    for (const pt of S.points) {
      const row = document.createElement('div'); row.className = 'prow-item' + (pt.id === selPoint ? ' sel' : ''); row.dataset.id = pt.id;
      row.innerHTML = `<span class="grip" title="끌어서 순서 바꾸기">⋮⋮</span><img class="sym" src="${symURL}" alt="">`;
      const inp = document.createElement('input'); inp.value = pt.label; inp.placeholder = '라벨 입력';
      inp.onfocus = () => { selPoint = pt.id; requestDraw(); list.querySelectorAll('.prow-item').forEach(r => r.classList.toggle('sel', r === row)); };
      inp.oninput = () => {
        pointsAction(`라벨 수정`, () => { const p = S.points.find(q => q.id === pt.id); if (p) p.label = inp.value; S.fill = null; }, 'label:' + pt.id);
        document.querySelectorAll('[data-fill]').forEach(b => b.classList.remove('sel'));
      };
      inp.onkeydown = e => { if (e.key === 'Enter') { const nx = row.nextElementSibling && row.nextElementSibling.querySelector('input'); nx ? nx.focus() : inp.blur(); } };
      const meta = document.createElement('span'); meta.className = 'meta';
      meta.textContent = pt.city || fmtLL(pt.lon, pt.lat); meta.title = pt.city ? `${pt.city} (목록 도시)` : '직접 찍은 점';
      row.append(inp, meta);
      if (pt.off) {
        const rs = document.createElement('button'); rs.className = 'reset'; rs.title = '라벨을 원래 자리로';
        rs.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
        rs.onclick = e => { e.stopPropagation(); pointsAction('라벨 위치 되돌림', () => { const p = S.points.find(q => q.id === pt.id); if (p) p.off = null; }); };
        const gd = document.createElement('button'); gd.className = 'guide' + (pt.guide !== false ? ' on' : ''); gd.title = pt.guide !== false ? '가이드선 끄기' : '가이드선 켜기';
        gd.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="5" cy="19" r="2.2"/><path d="M7 17 17 7"/><path d="M14 5h6v4"/></svg>';
        gd.onclick = e => { e.stopPropagation(); pointsAction(pt.guide !== false ? '가이드선 끔' : '가이드선 켬', () => { const p = S.points.find(q => q.id === pt.id); if (p) p.guide = p.guide === false; }); };
        row.append(gd, rs);
      }
      const del = document.createElement('button'); del.className = 'del'; del.title = '삭제';
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.onclick = e => { e.stopPropagation(); deletePoint(pt.id); };
      row.append(del);
      row.onclick = e => { if (e.target === inp) return; selPoint = pt.id === selPoint ? null : pt.id; renderPoints(); requestDraw(); };
      row.querySelector('.grip').addEventListener('pointerdown', e => startRowDrag(e, row, list, order => {
        if (order.join() !== S.points.map(p => p.id).join()) pointsAction('순서 바꿈', () => { S.points = order.map(id => S.points.find(p => p.id === id)); relabel(); });
        else renderPoints();
      }));
      list.appendChild(row);
    }
  }
  // 줄 끌어서 순서 바꾸기 (마우스·손가락 모두) — 점 목록·색칠 라벨 목록 공용
  let dragRow = null;
  function startRowDrag(e, row, list, onDone) {
    e.preventDefault(); e.stopPropagation();
    const pid0 = e.pointerId;
    dragRow = row; row.classList.add('dragging');
    const move = ev => {
      if (ev.pointerId !== pid0) return;
      ev.preventDefault();
      const y = ev.clientY;
      const rows = [...list.querySelectorAll('.prow-item')].filter(r => r !== row);
      let before = null;
      for (const r of rows) { const b = r.getBoundingClientRect(); if (y < b.top + b.height / 2) { before = r; break; } }
      if (before !== row.nextElementSibling) list.insertBefore(row, before);
    };
    // 줄을 옮기면 끄는 손잡이도 같이 옮겨지므로, 창 전체에서 움직임을 받아요
    const up = ev => {
      if (ev.pointerId !== pid0) return;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      row.classList.remove('dragging'); dragRow = null;
      onDone([...list.querySelectorAll('.prow-item')].map(r => r.dataset.id));
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  document.querySelectorAll('[data-fill]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.fill;
    if (!S.points.length) return showToast('먼저 점을 찍거나 도시를 골라요');
    const names = { alpha: 'A B C', hangulp: '(가)(나)(다)', hangul: '가 나 다', city: '도시 이름', clear: '지우기' };
    pointsAction(`라벨 ${names[mode]}`, () => {
      if (SEQ.includes(mode)) { S.fill = mode; relabel(); }
      else if (mode === 'city') { S.fill = null; S.points.forEach(p => { if (p.city) p.label = p.city; }); }
      else { S.fill = null; S.points.forEach(p => { p.label = ''; }); }
    });
  }));
  $('#pointsClear').addEventListener('click', () => {
    const n = S.points.length; if (!n) return;
    pointsAction('점 모두 삭제', () => { S.points = []; });
    selPoint = null; showToast(`점 ${n}개를 지웠어요`, true);
  });

  function initPanels() {
    document.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openSide(b.dataset.side); }));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => openSide(null)));
    updateCounts();
  }

  // ───────── 이미지로 저장 ─────────
  const gray = c => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(c || ''); if (!m) return c;
    const v = Math.round(0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16));
    const h = v.toString(16).padStart(2, '0'); return '#' + h + h + h;
  };
  const EX = { range: 'full', style: 'exam', fmt: 'png', k: 3, tick: true, rect: null };   // PNG·인쇄용(3배) 고정
  // 시험지용 글자 크기: B4 2단(단 너비 약 11cm)에 지도를 약 9.5cm 폭으로 넣었을 때 9pt(약 3.2mm)가 되도록
  const EXAM_FONT = 0.0318;  // 지도 폭 10cm일 때 9pt(3.18mm) → 지도 폭의 3.18%
  function fullRect() { return { x: 0, y: 0, w: Math.round(W), h: Math.round(H) }; }
  async function renderExport(k) {
    const rect = EX.range === 'sel' && EX.rect ? EX.rect : fullRect();
    const exam = EX.style === 'exam';
    // 라벨 글꼴을 미리 불러옴
    if (document.fonts) {
      const texts = [...S.points.map(p => p.label), ...S.regions.map(r => r.label), '0°'].filter(Boolean).join('');
      try { await Promise.race([document.fonts.load(`700 20px "Noto Serif KR"`, texts || '가'), new Promise(r => setTimeout(r, 1500))]); } catch (_) { }
    }
    if (isEE() && !(ee.ready && ee.lon === S.eeLon)) buildEESync();
    const keep = { ctx, dpr, hoverId, fade, area: { ...area }, colors: S.colors, land: S.land, ocean: S.ocean, show: { ...S.show }, pcolor: S.pstyle.color, pfont: S.pstyle.font, rfont: S.rfont };
    const examFont = Math.max(8, Math.round(rect.w * EXAM_FONT));
    const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); return c; };
    let A, B, eqY = null;
    try {
      hoverId = null; fade = null;
      if (exam) {
        S.colors = new Map([...S.colors].map(([id, c]) => [id, gray(c)]));
        S.land = '#FFFFFF'; S.ocean = '#E3E3E3'; S.show.equator = false; S.show.grid = false; S.show.names = false; S.pstyle.color = gray(S.pstyle.color);
        S.pstyle.font = examFont; S.rfont = examFont;
      } else {
        area = { ...area, top: rect.y, bot: rect.y + rect.h, left: rect.x, right: W - (rect.x + rect.w), line: rect.y + rect.h - 10 };
      }
      dpr = k;
      A = mk(); ctx = A.getContext('2d'); EXP = { exam, phase: 'map', rect }; draw();
      B = mk(); ctx = B.getContext('2d'); EXP.phase = 'over'; draw();
      const e = proj([isEE() ? S.eeLon : lon0, 0]); if (e) eqY = e[1];
    } finally {
      ctx = keep.ctx; dpr = keep.dpr; hoverId = keep.hoverId; fade = keep.fade; area = keep.area;
      S.colors = keep.colors; S.land = keep.land; S.ocean = keep.ocean; S.show = keep.show; S.pstyle.color = keep.pcolor; S.pstyle.font = keep.pfont; S.rfont = keep.rfont;
      EXP = null; requestDraw();
    }
    const m = { l: 0, t: 0, r: 0, b: 0 };   // 선택한 사각형에 딱 맞게 (바깥 여백 없음)
    const out = document.createElement('canvas');
    out.width = Math.round((rect.w + m.l + m.r) * k); out.height = Math.round((rect.h + m.t + m.b) * k);
    const g = out.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
    const fx = m.l * k, fy = m.t * k, fw = rect.w * k, fh = rect.h * k;
    g.save(); g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
    g.drawImage(A, fx - rect.x * k, fy - rect.y * k); g.restore();
    if (exam) {
      const lw2 = Math.max(1.4, rect.w / 450) * k;
      g.lineWidth = lw2; g.strokeStyle = '#000'; g.strokeRect(fx + lw2 / 2, fy + lw2 / 2, fw - lw2, fh - lw2);   // 틀 (안쪽에)
      if (EX.tick && eqY != null && eqY > rect.y + examFont && eqY < rect.y + rect.h - examFont) {   // 적도 0° 눈금 (틀 안쪽 왼쪽)
        const y = (eqY - rect.y) * k, fs = examFont * k, tl = fs * 0.55;
        g.beginPath(); g.moveTo(fx, y); g.lineTo(fx + tl, y); g.lineWidth = lw2; g.stroke();
        g.font = `600 ${fs}px ${LABEL_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        g.lineWidth = fs * 0.28; g.strokeStyle = '#fff'; g.strokeText('0°', fx + tl + fs * 0.2, y);
        g.fillStyle = '#000'; g.fillText('0°', fx + tl + fs * 0.2, y);
      }
    }
    g.save(); g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
    g.drawImage(B, fx - rect.x * k, fy - rect.y * k); g.restore();   // 라벨·점
    return out;
  }
  const exportDlg = $('#exportDlg');
  let previewTimer = 0;
  function syncExportUI() {
    document.querySelectorAll('#exportDlg [data-ex]').forEach(b => b.classList.toggle('sel', String(EX[b.dataset.ex]) === b.dataset.v));
    $('#exSelAgain').hidden = EX.range !== 'sel';
    $('#exTickRow').hidden = EX.style !== 'exam';
    $('#exTick').checked = EX.tick;
    $('#exStyleHint').textContent = EX.style === 'exam' ? '시험지용: 흑백·회색 바다·사각형 틀, 경위선·나라 이름·축척 없음. B4 용지 2단 편집에서 지도를 약 10cm 폭으로 넣었을 때 글자가 9pt가 되도록 자동 조정해요.' : '지금 화면에 보이는 색·라벨·경위선 숫자·축척 그대로';
    const r = EX.range === 'sel' && EX.rect ? EX.rect : fullRect();
    const m = { l: 0, t: 0, r: 0, b: 0 };
    $('#exSize').textContent = `${Math.round((r.w + m.l + m.r) * EX.k)} × ${Math.round((r.h + m.t + m.b) * EX.k)} 픽셀`;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const c = await renderExport(Math.min(1.5, 900 / Math.max(r.w, r.h)) || 1);
      const img = $('#exPreview'); img.src = c.toDataURL('image/png');
    }, 60);
  }
  function openExport() {
    if (typeof openLayers === 'function') openLayers(false);
    exportDlg.hidden = false; syncExportUI();
  }
  function openExportFresh() { EX.range = 'full'; EX.rect = null; openExport(); }   // 다시 열면 '화면 전체'부터
  $('#saveBtn').addEventListener('click', openExportFresh);
  $('#exClose').addEventListener('click', () => { exportDlg.hidden = true; });
  exportDlg.addEventListener('click', e => { if (e.target === exportDlg) exportDlg.hidden = true; });
  document.querySelectorAll('#exportDlg [data-ex]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.ex, v = b.dataset.v;
    EX[key] = key === 'k' ? +v : v;
    if (key === 'range' && v === 'sel') return startSelect();
    syncExportUI();
  }));
  $('#exTick').addEventListener('change', e => { EX.tick = e.target.checked; syncExportUI(); });
  $('#exSelAgain').addEventListener('click', startSelect);
  const fileName = () => {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return `worldmap-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.${EX.fmt === 'jpg' ? 'jpg' : 'png'}`;
  };
  $('#exSave').addEventListener('click', async () => {
    const c = await renderExport(EX.k);
    const type = EX.fmt === 'jpg' ? 'image/jpeg' : 'image/png';
    c.toBlob(blob => {
      if (!blob) return showToast('이미지를 만들지 못했어요');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('저장했어요 · 안 받아지면 미리보기를 오른쪽 클릭(폰은 길게 눌러) 저장하세요', false, 4200);
    }, type, 0.92);
  });
  $('#exCopy').addEventListener('click', async () => {
    try {
      const c = await renderExport(EX.k);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('복사했어요 · 한글·PPT에 붙여 넣으세요');
    } catch (_) { showToast('이 환경에서는 복사가 안 돼요 · 미리보기를 오른쪽 클릭해 복사하세요', false, 3600); }
  });

  // 영역 선택: 지도 위에 사각형을 끌어서
  const selLayer = $('#selLayer'), selBox = $('#selBox');
  function startSelect() {
    exportDlg.hidden = true; selLayer.hidden = false; selBox.hidden = true; document.body.classList.add('selecting');
  }
  function endSelect(rect) {
    selLayer.hidden = true; document.body.classList.remove('selecting');
    if (rect) { EX.rect = rect; EX.range = 'sel'; } else if (!EX.rect) EX.range = 'full';
    openExport();
  }
  $('#selCancel').addEventListener('click', e => { e.stopPropagation(); endSelect(null); });
  {
    let st = null;
    const rel = e => { const b = stage.getBoundingClientRect(); return [Math.max(0, Math.min(W, e.clientX - b.left)), Math.max(0, Math.min(H, e.clientY - b.top))]; };
    const box = (a, b) => ({ x: Math.round(Math.min(a[0], b[0])), y: Math.round(Math.min(a[1], b[1])), w: Math.round(Math.abs(a[0] - b[0])), h: Math.round(Math.abs(a[1] - b[1])) });
    selLayer.addEventListener('pointerdown', e => {
      if (e.target.closest('.sel-banner')) return;
      e.preventDefault(); selLayer.setPointerCapture(e.pointerId); st = rel(e);
      Object.assign(selBox.style, { left: st[0] + 'px', top: st[1] + 'px', width: 0, height: 0 }); selBox.hidden = false;
    });
    selLayer.addEventListener('pointermove', e => {
      if (!st) return; const r = box(st, rel(e));
      Object.assign(selBox.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    });
    selLayer.addEventListener('pointerup', e => {
      if (!st) return; const r = box(st, rel(e)); st = null;
      if (r.w < 30 || r.h < 30) { selBox.hidden = true; return showToast('조금 더 크게 끌어 주세요'); }
      endSelect(r);
    });
  }

  // ───────── 자동 저장 ─────────
  let saveTimer;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  // 창을 닫거나 새로고침할 때 아직 저장 안 된 변경이 있으면 바로 저장
  window.addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); save(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) { clearTimeout(saveTimer); save(); } });
  function save() {
    saveTimer = 0;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        colors: [...S.colors], current: S.current, palette: S.palette, land: S.land, ocean: S.ocean,
        line: S.line, show: S.show, dockHidden: S.dockHidden, view: W && !isEE() ? currentView() : S.view, proj: S.proj, eeLon: +S.eeLon.toFixed(2),
        lakes: S.lakes, points: S.points.map(({ _lab, ...p }) => p), pstyle: S.pstyle, fill: S.fill,
        regions: S.regions.map(({ _lab, ...r }) => r), rfill: S.rfill, rfont: S.rfont, borderDash: S.borderDash,
      }));
    } catch (_) { /* 저장 공간을 쓸 수 없는 환경이면 조용히 넘어감 */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!d) return;
      S.colors = new Map(d.colors || []);
      Object.assign(S, { current: d.current || S.current, palette: d.palette || 0, land: d.land || S.land, ocean: d.ocean || S.ocean, line: d.line || S.line, view: d.view || null, proj: d.proj === 'ee' ? 'ee' : 'merc', eeLon: isFinite(d.eeLon) ? d.eeLon : EE_CENTER });
      Object.assign(S.show, d.show || {});
      S.dockHidden = !!d.dockHidden;
      if (d.lakes && Array.isArray(d.lakes.sel)) S.lakes = { sel: d.lakes.sel.filter(k => WM_PLACES.LAKES.some(l => l.ko === k)), all: !!d.lakes.all };
      if (Array.isArray(d.points)) S.points = d.points.filter(p => isFinite(p.lon) && isFinite(p.lat))
        .map(p => ({ id: p.id, lon: p.lon, lat: p.lat, city: p.city || null, label: p.label || '', off: Array.isArray(p.off) ? p.off : null, guide: p.guide !== false }));
      // 시안 5까지 따로 고르던 도시는 점으로 옮김
      if (Array.isArray(d.cities)) for (const n of d.cities) { const c = WM_PLACES.CITIES.find(x => x.name === n); if (c && !S.points.some(p => p.city === n)) S.points.push({ id: 'c' + n, lon: c.lon, lat: c.lat, city: n, label: n, off: null }); }
      if (d.pstyle) for (const k of ['color', 'size', 'outline', 'font']) if (k in d.pstyle) S.pstyle[k] = d.pstyle[k];
      S.pstyle.shape = 'circle';   // 점 모양은 동그라미 하나
      S.fill = d.fill === 'hangul' && S.points[0] && /^\(/.test(S.points[0].label) ? 'hangulp' : (['alpha', 'hangulp', 'hangul'].includes(d.fill) ? d.fill : null);
      if (Array.isArray(d.regions)) S.regions = d.regions.filter(r => r && typeof r.id === 'string').map(r => ({ id: r.id, label: r.label || '', off: Array.isArray(r.off) ? r.off : null, guide: r.guide !== false }));
      S.rfill = ['alpha', 'hangulp', 'hangul'].includes(d.rfill) ? d.rfill : null;
      if (isFinite(d.rfont)) S.rfont = d.rfont;
      if (typeof d.borderDash === 'boolean') S.borderDash = d.borderDash;
    } catch (_) { }
  }

  // ───────── 시작 ─────────
  const DEFAULTS = JSON.parse(JSON.stringify({ ...S, colors: [] }));
  load();
  renderTabs(); renderSwatches(); renderMiniSwatches(); syncLayers(); syncProjUI();
  initPanels();
  document.body.classList.toggle('dock-hidden', !!S.dockHidden);
  lineInput.value = S.line; lineOut.textContent = S.line.toFixed(1);
  window.addEventListener('resize', () => { resize(); requestDraw(); });
  resize();
  loadData().then(() => {
    $('#loading').remove();
    if (isEE()) eeStale();
    afterChange();
    if (S.colors.size) showToast(`지난번 작업을 불러왔어요 (${S.colors.size}개 나라)`);
    else if (isPhone()) showToast('PC에서 사용을 권합니다', false, 3000);
  }).catch(() => { $('#loading').textContent = '지도를 불러오지 못했어요. 새로고침해 주세요.'; });

  // 테스트용
  window.__map = { rlabelPos: id => { const o = rlabelBoxes.find(x => x.r.id === id); return o && [(o.box[0] + o.box[2]) / 2, (o.box[1] + o.box[3]) / 2]; }, S, hitTest, paint: id => paint(byId.get(id)), proj: () => proj, view: currentView, setProjection, openSide };
})();
