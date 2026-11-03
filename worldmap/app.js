/* 세계지도 색칠하기 — 시안 2
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
  const EE_CENTER = 150;         // 이퀄 어스 지도의 가운데 경선
  const PROJ_INFO = {
    merc: { name: '메르카토르 도법', note: '방향과 모양이 정확해 항해에 쓰여요. 극으로 갈수록 넓이가 크게 보여요.' },
    ee: { name: '이퀄 어스 도법', note: '나라의 넓이를 실제 비율대로 보여줘요. 2026년 UN 총회가 사용을 권고했어요.' },
  };

  const PALETTES = [
    { name: '기본', colors: ['#F94144', '#F8961E', '#F9C74F', '#90BE6D', '#43AA8B', '#4D96FF', '#7B61FF', '#E56BCF', '#9C6644', '#5C677D'] },
    { name: '파랑 단계', colors: ['#DCEBFA', '#A9CDF0', '#6AA6DE', '#2F78C2', '#164A8A'] },
    { name: '빨강 단계', colors: ['#FDE2D6', '#F9B193', '#F27A55', '#D9412B', '#A01B17'] },
    { name: '초록 단계', colors: ['#E3F2D9', '#B5DDA0', '#7CC16A', '#3F9441', '#1D5E28'] },
    { name: '노랑-갈색', colors: ['#FFF3C4', '#FAD776', '#F2B134', '#C98320', '#8A5A12'] },
    { name: '회색', colors: ['#F1F3F5', '#CED4DA', '#ADB5BD', '#6C757D', '#343A40'] },
  ];
  const LAND_COLORS = ['#FFFFFF', '#F7F3EA', '#EEF1F4', '#E6E6E6'];
  const OCEAN_COLORS = ['#DDEEFB', '#C9E4F7', '#FFFFFF', '#EEF3F7'];

  // ───────── 상태 ─────────
  const S = {
    colors: new Map(),      // 나라코드 → 색
    current: '#F9C74F',
    palette: 0,
    tool: 'paint',          // 'paint' | 'erase'
    land: '#FFFFFF',
    ocean: '#DDEEFB',
    line: 0.6,
    show: { borders: true, names: false, grid: false, equator: true, lakes: true },
    view: null,             // 메르카토르 { lon, lat, z } 저장용
    proj: 'merc',           // 'merc' | 'ee'
  };
  const undoStack = [], redoStack = [];

  // ───────── DOM ─────────
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), canvas = $('#map'), ctx = canvas.getContext('2d');
  const tip = $('#tip'), toast = $('#toast');

  // ───────── 지도 투영 ─────────
  let W = 0, H = 0, dpr = 1;
  let sMin = 1;                              // 현재 도법의 최소 축척
  let lon0 = HOME_LON, s = 1, cy = 0;       // 메르카토르: 가운데 경도, 축척, 적도의 화면 y
  let ex = 0, ey = 0;                        // 이퀄 어스: 지도 원점의 화면 위치 (축척은 s 공용)
  let sMinM = 1, sMinE = 1, eeFit = null;
  const projM = d3.geoMercator().precision(0);
  const projE = d3.geoEqualEarth().rotate([-EE_CENTER, 0]).precision(0.5);
  const eeBase = d3.geoEqualEarth().rotate([-EE_CENTER, 0]).scale(1).translate([0, 0]).precision(0.0002);
  const EE_BOUNDS = d3.geoPath(eeBase).bounds({ type: 'Sphere' });
  let proj = projM;
  const isEE = () => S.proj === 'ee';
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2));
  const MERC_SPAN = merc(LAT_TOP) - merc(LAT_BOT);

  function applyProj() {
    if (isEE()) { proj = projE.scale(s).translate([ex, ey]); }
    else { proj = projM.rotate([-lon0, 0]).scale(s).translate([W / 2, cy]); }
  }
  function clampScale(v) { return Math.max(sMin, Math.min(sMin * MAX_ZOOM, v)); }
  function clampView() {
    s = clampScale(s);
    if (isEE()) {
      // 지도 가장자리가 화면 가운데를 넘어가지 않게
      const [[x0, y0], [x1, y1]] = EE_BOUNDS;
      ex = Math.min(W / 2 - s * x0, Math.max(W / 2 - s * x1, ex));
      ey = Math.min(H / 2 - s * y0, Math.max(H / 2 - s * y1, ey));
    } else {
      const hi = s * merc(LAT_TOP);          // 위쪽 끝이 화면 위로 넘치지 않게
      const lo = H + s * merc(LAT_BOT);      // 아래쪽 끝이 화면 아래로 넘치지 않게
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
  function panBy(dx, dy) {
    if (isEE()) { ex += dx; ey += dy; }
    else { lon0 -= dx / s / RAD; cy += dy; }
    clampView(); requestDraw();
  }
  function animateTo(target, dur = 450) {
    // target: 메르카토르 { lon, s, cy } / 이퀄 어스 { s, ex, ey }
    const ee = isEE(), from = ee ? { s, ex, ey } : { lon: lon0, s, cy }, t0 = performance.now();
    const dl = ee ? 0 : ((target.lon - from.lon + 540) % 360) - 180;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      s = from.s * Math.pow(target.s / from.s, e);
      if (ee) { ex = from.ex + (target.ex - from.ex) * e; ey = from.ey + (target.ey - from.ey) * e; }
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
    const hs = Math.min(sMinE * 2.4, Math.max(sMinE, eeFit.h * 0.82 / (EE_BOUNDS[1][1] - EE_BOUNDS[0][1])));
    const target = { s: hs, ex: eeFit.cx - hs * (EE_BOUNDS[0][0] + EE_BOUNDS[1][0]) / 2, ey: eeFit.cy - hs * (EE_BOUNDS[0][1] + EE_BOUNDS[1][1]) / 2 };
    if (animate) return animateTo(target);
    s = target.s; ex = target.ex; ey = target.ey; clampView(); requestDraw();
  }
  function goHome() { isEE() ? homeEE(true) : setView(HOME_LON, 18, 1, true); }
  function currentView() {
    return { lon: +lon0.toFixed(3), lat: +((Math.atan(Math.sinh((cy - H / 2) / s)) / RAD)).toFixed(3), z: +(s / sMinM).toFixed(4) };
  }

  function computeFits() {
    sMinM = Math.max(W / (2 * Math.PI), H / MERC_SPAN);
    // 이퀄 어스는 지도 전체가 위쪽 칩과 아래쪽 도구 사이에 들어오게
    const st = stage.getBoundingClientRect();
    const top = Math.max(0, $('#layers').getBoundingClientRect().bottom - st.top) + 6;
    const bot = Math.max(0, st.bottom - $('.dock').getBoundingClientRect().top) + 6;
    const bw = EE_BOUNDS[1][0] - EE_BOUNDS[0][0], bh = EE_BOUNDS[1][1] - EE_BOUNDS[0][1];
    sMinE = Math.min((W - 16) / bw, (H - top - bot) / bh);
    eeFit = { cx: W / 2, cy: top + (H - top - bot) / 2, h: H - top - bot };
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
      else homeEE(false);
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
    if (isEE()) homeEE(false);
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
    $('#projName').textContent = PROJ_INFO[S.proj].name;
  }

  // ───────── 데이터 ─────────
  let countries = [], lakes = [], borderMesh, coastMesh, byId = new Map(), tiny = [];
  const graticule = d3.geoGraticule().step([30, 30]).extentMajor([[-180, -80], [180, 80.001]]).stepMajor([30, 30])();
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

  async function loadData() {
    const topo = await fetch('data/world.json').then(r => r.json());
    countries = topojson.feature(topo, topo.objects.countries).features;
    lakes = topojson.feature(topo, topo.objects.lakes).features;
    borderMesh = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
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
    d3.geoPath(eeBase, p2)(geo);
    return p2;
  }
  const shapeOf = o => isEE() ? (o.shapeE || (o.shapeE = makeShapeEE(o))) : (o.shape || (o.shape = makeShape(o)));
  const SH = { merc: {}, ee: {} };
  function shared(name, geo) {
    const box = SH[S.proj];
    return box[name] || (box[name] = (isEE() ? makeShapeEE : makeShape)(geo()));
  }
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
    ctx.fillStyle = isEE() ? '#EEF1F5' : S.ocean; ctx.fillRect(0, 0, W, H);
    if (!countries.length) return;
    const lw = S.line, px = 1 / s;   // 화면 1픽셀 = 기준 좌표 px
    const lakeShape = shared('lakes', () => ({ type: 'FeatureCollection', features: lakes }));
    const coastShape = shared('coast', () => coastMesh), borderShape = shared('border', () => borderMesh);
    const gridShape = shared('grid', () => graticule), equatorShape = shared('equator', () => equator);
    setWorldTransform();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (isEE()) {   // 지도 바깥 테두리(타원) 안을 바다색으로
      const sp = shared('sphere', () => SPHERE);
      ctx.save(); ctx.shadowColor = 'rgba(20,40,70,.10)'; ctx.shadowBlur = 18;
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
      ctx.lineWidth = lw * 0.8 * px; ctx.strokeStyle = '#7d8a99'; ctx.stroke(lakeShape);
    }
    // 3) 경위선·적도
    if (S.show.grid) {
      ctx.setLineDash([4 * px, 4 * px]); ctx.lineWidth = 0.8 * px; ctx.strokeStyle = 'rgba(60,120,190,.55)';
      ctx.stroke(gridShape); ctx.setLineDash([]);
    }
    if (S.show.equator) { ctx.lineWidth = 1.1 * px; ctx.strokeStyle = 'rgba(220,60,60,.75)'; ctx.stroke(equatorShape); }
    // 4) 해안선·국경선
    ctx.lineWidth = lw * px; ctx.strokeStyle = '#4b5663';
    ctx.stroke(coastShape);
    if (S.show.borders) ctx.stroke(borderShape);
    if (isEE()) { ctx.lineWidth = 1.2 * px; ctx.strokeStyle = '#7d8a99'; ctx.stroke(shared('sphere', () => SPHERE)); }
    // 6) 마우스를 올린 나라 강조
    if (hoverId && byId.has(hoverId)) {
      const f = byId.get(hoverId);
      const key = isEE() ? 'outlineE' : 'outlineM';
      if (!f[key]) {
        const g = f.geometry, rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
        f[key] = (isEE() ? makeShapeEE : makeShape)(dropAntimeridian({ coordinates: rings }));
      }
      ctx.lineWidth = Math.max(1.6, lw * 2.2) * px; ctx.strokeStyle = '#1d2733'; ctx.stroke(f[key]);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 5) 아주 작은 나라 동그라미 (화면에서 7px보다 작게 보일 때만)
    const z = s / sMin;
    for (const f of tiny) {
      const p = proj(f.label); if (!p || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
      const k = isEE() ? 1 : 1 / Math.cos(f.label[1] * RAD);   // 메르카토르는 고위도일수록 커 보임
      if (Math.sqrt(f.area) * s * k > 6) continue;
      const r = Math.max(2.6, Math.min(4.5, 2.2 + z * 0.15));
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
      ctx.fillStyle = S.colors.get(f.id) || S.land; ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = '#4b5663'; ctx.stroke();
    }

    // 7) 나라 이름
    if (S.show.names) drawLabels(z);

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

  function hitTest(px, py, tolerance) {
    let ll = proj.invert([px, py]);
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return null;
    if (isEE()) {   // 지도 바깥(타원 밖)을 누른 경우
      const back = proj(ll);
      if (!back || Math.hypot(back[0] - px, back[1] - py) > 1 || Math.abs(ll[1]) > 90) return near(px, py, tolerance);
    }
    ll = [((ll[0] + 540) % 360) - 180, ll[1]];
    const [lon, lat] = ll;
    if (S.show.lakes && lakes.some(l => inBox(l, lon, lat) && d3.geoContains(l, ll))) return null;
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
  function undo() {
    const a = undoStack.pop(); if (!a) return;
    for (const [id, before] of a.changes) before ? S.colors.set(id, before) : S.colors.delete(id);
    redoStack.push(a); afterChange(); showToast(`되돌렸어요: ${a.label}`);
  }
  function redo() {
    const a = redoStack.pop(); if (!a) return;
    for (const [id, , after] of a.changes) after ? S.colors.set(id, after) : S.colors.delete(id);
    undoStack.push(a); afterChange(); showToast(`다시 했어요: ${a.label}`);
  }
  function afterChange() {
    $('#undo').disabled = !undoStack.length;
    $('#redo').disabled = !redoStack.length;
    $('#count').textContent = `칠한 나라 ${S.colors.size}개`;
    requestDraw(); saveSoon();
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
    if (pointers.size === 1) tap = { id: e.pointerId, x, y, t: performance.now(), moved: false, type: e.pointerType };
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
      if (!tap || tap.moved) panBy(dx, dy);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { panBy(mx - pinch.mx, my - pinch.my); zoomAt(mx, my, d / pinch.d); }
      pinch = { mx, my, d };
    }
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (tap && tap.id === e.pointerId && !tap.moved && performance.now() - tap.t < 700 && e.type === 'pointerup') {
      const f = hitTest(tap.x, tap.y, tap.type === 'mouse' ? 10 : 22);
      if (f) paint(f);
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
    const f = hitTest(x, y, 10);
    const id = f ? f.id : null;
    if (id !== hoverId) { hoverId = id; requestDraw(); }
    if (!f) return hideTip();
    tip.innerHTML = `${f.properties.ko}<small>${f.properties.en}</small>`;
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
    canvas.style.cursor = S.tool === 'erase' ? 'cell' : '';
  }
  $('#customColor').addEventListener('input', e => selectColor(e.target.value.toUpperCase()));
  $('#eraser').addEventListener('click', () => { S.tool = S.tool === 'erase' ? 'paint' : 'erase'; syncSelection(); });

  // ───────── 레이어·설정 ─────────
  document.querySelectorAll('[data-layer]').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.layer; S.show[k] = !S.show[k];
      b.classList.toggle('on', S.show[k]); requestDraw(); saveSoon();
    });
  });
  function syncLayers() { document.querySelectorAll('[data-layer]').forEach(b => b.classList.toggle('on', !!S.show[b.dataset.layer])); }

  const settingsBtn = $('#settingsBtn'), settings = $('#settings');
  settingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    settings.hidden = !settings.hidden;
    settingsBtn.setAttribute('aria-expanded', String(!settings.hidden));
  });
  document.addEventListener('pointerdown', e => {
    if (!settings.hidden && !settings.contains(e.target) && !settingsBtn.contains(e.target)) {
      settings.hidden = true; settingsBtn.setAttribute('aria-expanded', 'false');
    }
  });
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

  // ───────── 상단 버튼·확대 ─────────
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#clear').addEventListener('click', () => {
    if (!S.colors.size) return showToast('지울 색이 없어요');
    const changes = [...S.colors].map(([id, c]) => [id, c, null]);
    commit(changes, '모두 지우기');
    showToast(`${changes.length}개 나라의 색을 지웠어요`, true);
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
    else if (!mod && e.key.toLowerCase() === 'p') { setProjection(isEE() ? 'merc' : 'ee'); }
    else if (!mod && e.key.toLowerCase() === 'e') { S.tool = S.tool === 'erase' ? 'paint' : 'erase'; syncSelection(); }
    else if (!mod && /^[1-9]$/.test(e.key)) {
      const c = PALETTES[S.palette].colors[+e.key - 1]; if (c) selectColor(c);
    }
    else if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.4);
    else if (e.key === '-') zoomAt(W / 2, H / 2, 1 / 1.4);
    else if (e.key.startsWith('Arrow')) {
      const d = 60; panBy(e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0);
    }
  });

  // ───────── 자동 저장 ─────────
  let saveTimer;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        colors: [...S.colors], current: S.current, palette: S.palette, land: S.land, ocean: S.ocean,
        line: S.line, show: S.show, view: W && !isEE() ? currentView() : S.view, proj: S.proj,
      }));
    } catch (_) { /* 저장 공간을 쓸 수 없는 환경이면 조용히 넘어감 */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!d) return;
      S.colors = new Map(d.colors || []);
      Object.assign(S, { current: d.current || S.current, palette: d.palette || 0, land: d.land || S.land, ocean: d.ocean || S.ocean, line: d.line || S.line, view: d.view || null, proj: d.proj === 'ee' ? 'ee' : 'merc' });
      Object.assign(S.show, d.show || {});
    } catch (_) { }
  }

  // ───────── 시작 ─────────
  load();
  renderTabs(); renderSwatches(); renderMiniSwatches(); syncLayers(); syncProjUI();
  lineInput.value = S.line; lineOut.textContent = S.line.toFixed(1);
  window.addEventListener('resize', () => { resize(); requestDraw(); });
  resize();
  loadData().then(() => {
    $('#loading').remove();
    afterChange();
    if (S.colors.size) showToast(`지난번 작업을 불러왔어요 (${S.colors.size}개 나라)`);
  }).catch(() => { $('#loading').textContent = '지도를 불러오지 못했어요. 새로고침해 주세요.'; });

  // 테스트용
  window.__map = { S, hitTest, paint: id => paint(byId.get(id)), proj: () => proj, view: currentView, setProjection };
})();
