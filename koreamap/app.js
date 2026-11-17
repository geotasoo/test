/* 한반도 지도 색칠하고 도형찍기 — 세계지도 3.0의 틀을 옮겨 온 쌍둥이 앱 (메르카토르 고정)
 * (아래는 세계지도 앱에서 온 설명)
 * 도법 두 가지:
 *  - 메르카토르: 지도 한 장을 회전시켜 그려서 이음매가 없고, 좌우로 끝없이 돌릴 수 있어요.
 *  - 이퀄 어스: 넓이가 실제 비율대로 보이는 도법. 가운데 경선을 150°E로 고정한 태평양 중심 지도예요.
 */
(() => {
  'use strict';

  // ───────── 설정값 ─────────
  const STORE_KEY = 'koreamap.v1';
  const KBOX = [[124.55, 33.05], [131.95, 38.65]];  // 처음 화면: 남측이 꼭 들어오게 (백령도·독도·마라도 포함)
  const HOME_LON = (KBOX[0][0] + KBOX[1][0]) / 2, HOME_LAT = 35.95;
  const LAT_TOP = 84, LAT_BOT = -72;
  const MAX_ZOOM = 14;
  const RAD = Math.PI / 180;
  const EE_CENTER = 150;         // 이퀄 어스 지도의 처음 가운데 경선 (좌우로 끌면 바뀜)
  const PROJ_INFO = {
    merc: { name: '메르카토르 도법', note: '방향과 모양이 정확해 항해에 쓰여요. 극으로 갈수록 넓이가 크게 보여요.' },
    ee: { name: '이퀄 어스 도법', note: '나라의 넓이를 실제 비율대로 보여줘요. 2026년 UN 총회가 사용을 권고했어요.' },
  };

  // 기본(시험지 회색): 흰색 · 1 · 3 · 5 · 7 단계 회색 (+ 빗금)
  const PALETTES = [
    { name: '기본(시험지 회색)', colors: ['#FFFFFF', '#D9D9D9', '#A6A6A6', '#737373', '#404040'] },
    { name: '컬러', colors: ['#F94144', '#F8961E', '#F9C74F', '#90BE6D', '#43AA8B', '#4D96FF', '#7B61FF', '#E56BCF', '#9C6644', '#5C677D'] },
    { name: '파랑 단계', colors: ['#DCEBFA', '#A9CDF0', '#6AA6DE', '#2F78C2', '#164A8A'] },
    { name: '빨강 단계', colors: ['#FDE2D6', '#F9B193', '#F27A55', '#D9412B', '#A01B17'] },
    { name: '초록 단계', colors: ['#E3F2D9', '#B5DDA0', '#7CC16A', '#3F9441', '#1D5E28'] },
    { name: '노랑 단계', colors: ['#FFF3C4', '#FAD776', '#F2B134', '#C98320', '#8A5A12'] },
  ];
  const LAND_COLORS = ['#FFFFFF', '#F7F3EA', '#EEF1F4', '#E6E6E6'];
  const OCEAN_COLORS = ['#FFFFFF', '#E3E3E3', '#D6F1FF', '#B4DAF2'];   // 흰색 · 시험지 회색 · 하늘색(흑백 인쇄 시 시험지 회색) · 조금 진한 하늘색

  // ───────── 상태 ─────────
  const S = {
    colors: new Map(),      // 나라코드 → 색
    current: '#D9D9D9',     // 시험지 회색 1단계 (두 번째 칸)
    palette: 0,
    tool: 'paint',          // 'paint' | 'erase'
    land: '#FFFFFF',
    ocean: '#FFFFFF',       // 한반도: 시험지처럼 바다는 흰색 (바다 색 칸에서 바꿀 수 있어요)
    line: 1.0,
    borderDash: false,      // 시도·시군 경계: 실선(기본) / 점선
    show: { borders: true, kp: false, names: false, sgnames: false, nk: false, dmzDash: true, nb: false, tiny: false, grid: false, equator: false, lakes: false, scale: true, seas: false },
    unit: 'sd',             // 경계·색칠 단위: 'none' 남측 없음(북측만) · 'sk' 남측 전체 · 'sd' 시도 · 'sg' 시군
    era: 'after',           // 행정구역: 'after' 전남광주 통합 후 · 'before' 통합 전
    lineSd: 1.0, lineSg: 0.6,   // 시도·시군 경계 굵기 (S.line 은 나라 경계·해안선)
    bg: 'off',              // 배경 지도: 'off' | 'osm' | 'sat' | 'topo' (화면에서만)
    rivW: 1.0,              // 하천 굵기 (배수)
    rivNames: true,         // 강 이름
    rivers: 'off',          // 하천: 'off' 끄기 · 'major' 주요 강 · 'all' 하계망 (HydroRIVERS)
    kproj: 'merc',          // 도법: 'merc' 메르카토르(기본) · 'tm' 횡축 메르카토르(UTM-K처럼 127.5°E 가운데)
    lineLight: false,       // 경계선 색: false 검정 · true 흰색 (위성 배경에서 잘 보이게, 화면에서만)
    dockHidden: true,       // 처음엔 색칠하기 패널을 접어 둠
    seas: { sel: ['동해', '황해', '남해'] },   // 켜 둔 바다 이름
    lakes: { sel: null, all: false },   // (한반도 앱) 보일 시도: null 이면 전체
    points: [],             // 찍은 점 { id, lon, lat, city(목록 도시면 이름), label, off(라벨을 옮겼으면 [dx, dy]) }
    pstyle: { color: '#1A1A1A', shape: 'circle', size: 6, outline: false, font: 10 },   // 모든 점 공통 모양 (font: 라벨 글자 크기)
    fill: null,             // 'alpha' | 'hangulp' | 'hangul' 이면 순서대로 라벨 자동
    regions: [],            // 색칠한 나라 라벨 { id, label, off }
    rfill: null,            // 색칠 라벨 자동 순서
    rfont: 10,              // 색칠 라벨 글자 크기
    legend: {               // 범례: 칠한 색 묶음 + 점 모양 묶음
      show: false, pos: [0, 1], dir: 'v',             // pos: 보이는 지도 안에서의 위치 (0~1, 왼쪽 아래) · dir: 'v' 세로 / 'h' 가로
      fill: { mode: 'alpha', title: '', text: {}, off: [], order: [] },
      point: { mode: 'hangulp', title: '', text: {}, off: [], order: [] },
    },
    view: null,             // 메르카토르 { lon, lat, z } 저장용
    proj: 'merc',           // 'merc' | 'ee'
    eeLon: EE_CENTER,       // 이퀄 어스 가운데 경선
  };
  const undoStack = [], redoStack = [];
  // 빗금 칠: S.colors 에 'hatch' 로 저장
  // 단계 팔레트에서는 그 색 빗금: 'hatch:#색' (기본 'hatch' 는 검은 빗금)
  const HATCH = 'hatch';
  const isHatch = c => typeof c === 'string' && (c === HATCH || c.startsWith('hatch:'));
  const hatchColor = c => c === HATCH ? '#1a1a1a' : c.slice(6);
  const cssFill = c => isHatch(c) ? `repeating-linear-gradient(135deg, ${hatchColor(c)} 0 1.3px, #fff 1.3px 5px)` : c;
  const hatchTiles = new Map();
  // m: 지금 캔버스에서 그리는 단위 1이 장치 픽셀 몇 개인지 (빗금 간격을 화면 기준 6px로 고정)
  function fillFor(g, c, m, dd) {
    if (!isHatch(c)) return c;
    const d = dd || Math.max(1, Math.round(dpr * 2) / 2), T = Math.round(6 * d), hc = hatchColor(c);
    let tile = hatchTiles.get(T + hc);
    if (!tile) {
      tile = document.createElement('canvas'); tile.width = tile.height = T;
      const t = tile.getContext('2d'); t.fillStyle = '#fff'; t.fillRect(0, 0, T, T);
      t.strokeStyle = hc; t.lineWidth = 1.2 * d; t.lineCap = 'square';
      for (let i = -1; i <= 1; i++) { t.beginPath(); t.moveTo(i * T, T); t.lineTo(i * T + T, 0); t.stroke(); }
      hatchTiles.set(T + hc, tile);
    }
    const pat = g.createPattern(tile, 'repeat');
    pat.setTransform(new DOMMatrix().scale(1 / m));
    return pat;
  }
  // 라벨 글꼴: 시험지처럼 명조 계열 (웹 글꼴이 없으면 컴퓨터의 바탕·명조)
  const LABEL_FONT = '"Noto Serif KR", "Nanum Myeongjo", "Batang", "AppleMyungjo", "Times New Roman", serif';
  const SANS_FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "Nanum Gothic", sans-serif';   // 범례·축척은 고딕 (시험지처럼)
  const fontAsked = new Set();
  function ensureFont(font, text) {   // 캔버스는 웹 글꼴을 스스로 내려받지 않아서, 쓰는 글자를 미리 불러와요
    if (!document.fonts || !text) return;
    const k = font + '|' + text; if (fontAsked.has(k)) return; fontAsked.add(k);
    document.fonts.load(font, text).then(() => requestDraw()).catch(() => {});
  }
  const DOKDO = [131.8686, 37.2411];   // 한반도 지도 데이터에는 독도가 그려져 있어서 점은 쓰지 않아요

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
  // 횡축 메르카토르 (UTM-K처럼 동경 127.5°가 가운데). 기준 좌표 = 축척 1, 원점 0
  const tmBase = d3.geoTransverseMercator().rotate([-127.5, 0]).scale(1).translate([0, 0]).precision(0.0003);
  const projT = d3.geoTransverseMercator().rotate([-127.5, 0]).precision(0.3);
  const isTM = () => S.kproj === 'tm';
  // 기준 좌표 (축척 1): 메르카토르 [경도 라디안, -merc] · 횡축 메르카토르 [x, y]. lon0 은 가운데의 기준 x ÷ RAD
  const uv = (lon, lat) => isTM() ? tmBase([lon, lat]) : [lon * RAD, -merc(Math.max(-85, Math.min(85, lat)))];
  const uvInv = (x, y) => isTM() ? tmBase.invert([x, y]) : [x / RAD, Math.atan(Math.sinh(-y)) / RAD];
  function boxUV(b) {   // 경위도 상자 → 기준 좌표 상자 [w, h, 가운데 x, 가운데 y]
    const xs = [], ys = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const q = uv(b[0][0] + (b[1][0] - b[0][0]) * i / 4, b[0][1] + (b[1][1] - b[0][1]) * j / 4); xs.push(q[0]); ys.push(q[1]);
    }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return [x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2];
  }
  const isEE = () => S.proj === 'ee';
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2));
  const MERC_SPAN = merc(LAT_TOP) - merc(LAT_BOT);

  function applyProj() {
    if (isEE()) { proj = projE.rotate([-S.eeLon, 0]).scale(s).translate([ex, ey]); }
    else if (isTM()) { proj = projT.scale(s).translate([W / 2 - s * lon0 * RAD, cy]); }
    else { proj = projM.rotate([-lon0, 0]).scale(s).translate([W / 2, cy]); }
  }
  const MIN_ZOOM = 0.5;   // 꽉 찬 화면보다 더 축소 가능 (남극까지 한눈에)
  const minScale = () => sMin * MIN_ZOOM;
  function clampScale(v) { return Math.max(minScale(), Math.min(sMin * MAX_ZOOM, v)); }
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
      // 한반도 둘레(117~139°E, 29~47°N) 밖으로는 멀리 가지 않게
      lon0 = Math.max(uv(117, 38)[0] / RAD, Math.min(uv(139, 38)[0] / RAD, lon0));
      const yTop = H / 2 - s * uv(127.5, 47)[1], yBot = H / 2 - s * uv(127.5, 29)[1];   // 가운데가 이 위도 사이
      cy = Math.min(yTop, Math.max(yBot, cy));
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
    const q = uv(lon, lat), target = { lon: q[0] / RAD, s: ts, cy: H / 2 - ts * q[1] };
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
  function goHome() { setView(HOME_LON, HOME_LAT, 1, true); }
  function currentView() {
    const ll = uvInv(lon0 * RAD, (H / 2 - cy) / s);
    return { lon: +ll[0].toFixed(3), lat: +ll[1].toFixed(3), z: +(s / sMinM).toFixed(4) };
  }

  const isPhone = () => window.matchMedia('(max-width: 719px)').matches;
  function computeFits() {
    sMinM = 1;   // 아래에서 한반도가 꼭 맞게 다시 계산
    const st = stage.getBoundingClientRect();
    const hidden = document.body.classList.contains('dock-hidden');
    // 폰: 아래 시트 높이만큼 아래 여백 / PC: 왼쪽 팔레트 너비만큼 왼쪽 여백
    let dockH = 0, left = 0, right = 0;
    const sideOpen = !$('#side').hidden;
    if (isPhone()) {
      if (sideOpen) dockH = Math.max(0, st.bottom - $('#side').getBoundingClientRect().top);
      else if (!hidden) dockH = Math.max(0, st.bottom - $('#dock').getBoundingClientRect().top);
    } else {
      if (!hidden && !document.body.classList.contains('point-mode')) right = st.right - $('#dock').getBoundingClientRect().left;   // 색칠하기 패널도 오른쪽
      if (sideOpen) right = $('#side').offsetWidth;
      stage.style.setProperty('--frame-r', right + 'px');   // 도형찍기 빨간 테두리: 패널을 뺀 지도만 감싸요
    }
    stage.style.setProperty('--dock-h', dockH + 'px');
    const top = Math.max(0, $('#controls').getBoundingClientRect().bottom - st.top) + 8;
    const botPad = 30;     // 아래쪽 출처·축척 줄 (폰에서 접으면 팔레트 버튼 자리)
    const bot = H - dockH - botPad;
    const bw = EE_BOUNDS[1][0] - EE_BOUNDS[0][0], bh = EE_BOUNDS[1][1] - EE_BOUNDS[0][1];
    const fitW = W - left - 16 - (isPhone() ? 0 : 54);   // 오른쪽 확대 버튼 자리 (오른쪽 패널은 지도 위에 겹쳐 열림)
    sMinE = Math.min(fitW / bw, (bot - top) / bh);
    eeFit = { cx: left + 8 + fitW / 2, cy: (top + bot) / 2, h: bot - top };
    stage.style.setProperty('--frame-b', dockH + 'px');
    area = { top, bot, left, right, line: H - dockH - 10 };
    // 한반도(KBOX)가 지도 영역에 꼭 들어오는 축척 = 확대 1
    const [kw, kh] = boxUV(KBOX);
    sMinM = Math.min((W - left - 16 - (isPhone() ? 0 : 60)) / kw, (bot - top) / kh);
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
    else setView(HOME_LON, HOME_LAT, 1, false);
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
    else setView(HOME_LON, HOME_LAT, 1, false);
    syncProjUI();
    if (!quiet) showToast(`${PROJ_INFO[mode].name}: ${PROJ_INFO[mode].note}`, false, 4200);
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
  const GRID_STEPS = [2, 1, 0.5];   // 한반도: 1° 간격 (많이 확대하면 0.5°)
  const graticules = Object.fromEntries(GRID_STEPS.map(st => [st, d3.geoGraticule().step([st, st]).extentMajor([[110, 24], [150, 52]]).stepMajor([st, st]).precision(0.5)()]));
  const graticule = graticules[1];
  const gridStep = () => { const z = s / sMin; return z < 0.7 ? 2 : z < 3.5 ? 1 : 0.5; };
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
  // ───────── 한반도 데이터 ─────────
  // sg 시군(165) · sd 시도(16, 시군을 합친 것) · nk 북측 · nb 주변 나라 · sk 남측 전체(합친 것)
  let topoK = null, sgF = [], sdF = [], nkF = null, nbF = [], skF = null, sdMesh, sgMesh, nbBorderMesh, nbCoastMesh;
  const NB_LABEL = { 'nb:CHN': [122.6, 41.6], 'nb:JPN': [133.2, 34.9], 'nb:RUS': [132.2, 44.0] };
  // 보일 시도 (null = 전체)
  const sdOn = name => !S.lakes.sel || S.lakes.sel.includes(name);
  const UL = 'sg:경상북도:울릉', hideUL = () => false;   // (예전: 울릉군 통째로 빼기) 지금은 상자로 옮긴 섬만 바다색으로 덮어요
  const featOn = f => (f.kind === 'sg' || f.kind === 'sd') && S.unit === 'none' ? false
    : f.id === UL && hideUL() ? false
    : f.kind === 'sg' ? sdOn(f.properties.sd) : f.kind === 'sd' ? sdOn(f.properties.ko)
    : f.kind === 'nk' ? S.show.nk && !S.lakes.sel : f.kind === 'nb' ? S.show.nb && !S.lakes.sel : true;
  const selKey = () => S.era + ':' + (S.lakes.sel ? [...S.lakes.sel].sort().join('|') : 'all') + (hideUL() ? ':noUL' : '');
  const dataCache = {};
  async function loadData() {
    const era = S.era;
    const topo = dataCache[era] || (dataCache[era] = await fetch(`data/korea-${era}.json`).then(r => r.json()));
    if (era !== S.era) return;
    topoK = topo; byId.clear(); SH.merc = {};
    const O = topo.objects;
    sgF = topojson.feature(topo, O.sg).features; sdF = topojson.feature(topo, O.sd).features;
    nkF = topojson.feature(topo, O.nk).features[0]; nbF = topojson.feature(topo, O.nb).features;
    skF = { type: 'Feature', id: 'sk', properties: { ko: '남측 전체', lx: 127.9, ly: 36.4 }, geometry: topojson.merge(topo, O.sg.geometries) };
    sgF.forEach(f => f.kind = 'sg'); sdF.forEach(f => f.kind = 'sd'); nkF.kind = 'nk'; nbF.forEach(f => f.kind = 'nb'); skF.kind = 'sk';
    for (const f of nbF) { const c = NB_LABEL[f.id] || d3.geoCentroid(f); f.properties.lx = c[0]; f.properties.ly = c[1]; }
    countries = [...nbF, nkF, ...sdF, ...sgF];   // 그리는 순서
    for (const f of [...countries, skF]) {
      const b = d3.geoBounds(f);
      f.bb = b; f.wrap = false; f.area = d3.geoArea(f);
      f.label = [f.properties.lx, f.properties.ly];
      byId.set(f.id, f);
    }
    nbBorderMesh = topojson.mesh(topo, O.nb, (a, b) => a !== b);
    nbCoastMesh = topojson.mesh(topo, O.nb, (a, b) => a === b);
    coastMesh = { type: 'MultiLineString', coordinates: [] };
  }
  // 선 묶음에서 빼야 할 선(틈·휴전선)을 잘라 내요
  function splitArcs(ml, drop) {
    const lines = [];
    for (const line of ml.arcs) {
      let cur = [];
      for (const a of line) { if (drop.has(a < 0 ? ~a : a)) { if (cur.length) lines.push(cur); cur = []; } else cur.push(a); }
      if (cur.length) lines.push(cur);
    }
    return topojson.feature(topoK, { type: 'MultiLineString', arcs: lines });
  }
  // 보일 시도에 따라 선을 다시 골라요 (해안선·남측 둘레 / 시도 경계 / 시군 경계)
  function kMesh(kind, full) {
    const O = topoK.objects, on = g => sdOn(g.properties.sd || g.properties.ko) && !(hideUL() && g.id === UL);
    if (kind === 'outline') {   // 남측 둘레: 보이는 시군과 안 보이는 시군 사이 + 바깥
      const ml = topojson.meshArcs(topoK, O.sg, (a, b) => on(a) && (a === b || !on(b)) || (a !== b && on(b) && !on(a)));
      // 통합 후 광주 둘레의 틈(자료끼리 딱 안 맞는 곳)은 빼요 → 옛 광주광역시 선이 안 보이게
      const out = splitArcs(ml, new Set([...(topoK.gap || []), ...(topoK.dmz || [])]));
      // 광주 둘레 틈 안에 남은 아주 작은 고리(자료 찌꺼기)도 지워요
      const inGap = ([x, y]) => x > 126.55 && x < 127.15 && y > 34.9 && y < 35.35;
      out.geometry.coordinates = out.geometry.coordinates.filter(l => {
        if (!l.every(inGap)) return true;
        const xs = l.map(q => q[0]), ys = l.map(q => q[1]);
        return Math.max(...xs) - Math.min(...xs) > 0.01 || Math.max(...ys) - Math.min(...ys) > 0.01;
      });
      return out;
    }
    if (kind === 'nk') return splitArcs(topojson.meshArcs(topoK, O.nk), new Set(topoK.dmzN || []));   // 북측 둘레 (휴전선 빼고)
    if (kind === 'dmz') {   // 휴전선: 북측을 그릴 땐 전부, 아니면 보이는 시도에 붙은 부분만
      const dz = new Set(topoK.dmz || []), all = full || !S.lakes.sel;
      const ml = topojson.meshArcs(topoK, O.sg, (a, b) => a === b && (all || on(a)));
      return splitArcs({ arcs: ml.arcs.map(l => l.filter(x => dz.has(x < 0 ? ~x : x))).filter(l => l.length) }, new Set());
    }
    if (kind === 'land') {   // 바깥 테두리만 (틈 때문에 생긴 구멍은 메움)
      const g = topojson.merge(topoK, O.sg.geometries.filter(on));
      return { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: g.coordinates.map(pg => [pg[0]]) } };
    }
    if (kind === 'sd') return topojson.mesh(topoK, O.sd, (a, b) => a !== b && on(a) && on(b));
    if (kind === 'sg') return topojson.mesh(topoK, O.sg, (a, b) => a !== b && a.properties.sd === b.properties.sd && on(a));
  }

  // ───────── 배경 지도 (인터넷 지도 그림, 화면에서만) ─────────
  const BG = {
    osm: { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 19, credit: '배경: © OpenStreetMap 기여자' },
    sat: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, max: 18, credit: '배경: Esri, Maxar, Earthstar Geographics' },
    topo: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`, max: 18, credit: '배경: Esri, HERE, Garmin, © OpenStreetMap 기여자' },
    elev: { url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, max: 12, elev: true, credit: '고도: Terrain Tiles (AWS Open Data · SRTM, GMTED, ETOPO1)' },
  };
  const tileCache = new Map();
  function tileImg(src, elev) {
    let im = tileCache.get(src);
    if (!im) {
      im = new Image(); im.decoding = 'async'; im.crossOrigin = 'anonymous';   // 저장할 때 그림에 넣을 수 있게
      im.onload = () => { if (elev) { try { im.cv = elevColor(im, elev); } catch (_) { im.bad = true; } } requestDraw(); }; im.onerror = () => { im.bad = true; };
      im.src = src; tileCache.set(src, im);
      if (tileCache.size > 600) tileCache.delete(tileCache.keys().next().value);
    }
    return im;
  }
  // ───────── 고도 색칠 (지형 타일의 높이값 → 고도별 색 + 음영 기복) ─────────
  const ELEV_STOPS = [   // [높이 m, 색]
    [-8000, '#123F66'], [-4000, '#1E5E8C'], [-1000, '#3A86B4'], [-200, '#6FB3D2'], [-1, '#A9D8EA'],
    [0, '#6FA463'], [100, '#8DBA6E'], [300, '#C6CC86'], [600, '#E2C57E'], [1000, '#D79E5A'],
    [1500, '#B97A45'], [2000, '#9C6A4A'], [3000, '#A89488'], [4500, '#EDE8E4'], [6000, '#FFFFFF'],
  ];
  const ELEV_LUT = (() => {   // -8000~6000m, 10m 간격
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), lut = new Uint8ClampedArray(1401 * 3);
    for (let k = 0; k <= 1400; k++) {
      const e = -8000 + k * 10; let i = 0;
      while (i < ELEV_STOPS.length - 2 && e > ELEV_STOPS[i + 1][0]) i++;
      const [e0, c0] = ELEV_STOPS[i], [e1, c1] = ELEV_STOPS[i + 1], t = Math.max(0, Math.min(1, (e - e0) / (e1 - e0)));
      const a = hex(c0), b = hex(c1); for (let j = 0; j < 3; j++) lut[k * 3 + j] = a[j] + (b[j] - a[j]) * t;
    }
    return lut;
  })();
  function elevColor(im, { z, y }) {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, N, N), px = d.data, E = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) E[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;   // terrarium 높이값
    const n = 1 << z, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n)));
    const mpp = 40075016.686 * Math.cos(lat) / (N * n);                  // 한 칸의 실제 길이(m)
    const ex = z <= 3 ? 25 : z <= 5 ? 12 : z <= 7 ? 6 : z <= 9 ? 3 : 1.8;  // 작게 볼수록 기복을 과장해야 보여요
    const az = 315 * RAD, alt = 45 * RAD, sa = Math.sin(alt), ca = Math.cos(alt);
    const at = (x, yy) => E[Math.max(0, Math.min(N - 1, yy)) * N + Math.max(0, Math.min(N - 1, x))];
    for (let yy = 0; yy < N; yy++) for (let x = 0; x < N; x++) {
      const i = yy * N + x, e = E[i];
      const dx = (at(x + 1, yy) - at(x - 1, yy)) / (2 * mpp) * ex, dy = (at(x, yy + 1) - at(x, yy - 1)) / (2 * mpp) * ex;
      const slope = Math.atan(Math.hypot(dx, dy)), aspect = Math.atan2(dy, -dx);
      const sh = Math.max(0, sa * Math.cos(slope) + ca * Math.sin(slope) * Math.cos(az - Math.PI / 2 - aspect));
      const k = Math.max(0, Math.min(1400, Math.round((e + 8000) / 10))) * 3;
      const f = e >= 0 ? 0.42 + 0.72 * sh : 0.82 + 0.25 * sh;             // 땅은 음영을 진하게, 바다는 살짝
      px[i * 4] = ELEV_LUT[k] * f; px[i * 4 + 1] = ELEV_LUT[k + 1] * f; px[i * 4 + 2] = ELEV_LUT[k + 2] * f; px[i * 4 + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c;
  }
  // 고도 범례 (화면에서만, 왼쪽 아래)
  function drawElevLegend() {
    if (S.bg !== 'elev' || EXP) return;
    const marks = [0, 200, 500, 1000, 2000, 3000], w = 30, h = 9, x0 = 12, y0 = H - 66;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(x0 - 6, y0 - 18, marks.length * w + 12, h + 34);
    ctx.font = `600 10.5px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#333'; ctx.fillText('높이 (m)', x0, y0 - 6);
    marks.forEach((m, i) => {
      const k = Math.round((m + 8000) / 10) * 3; ctx.fillStyle = `rgb(${ELEV_LUT[k]},${ELEV_LUT[k + 1]},${ELEV_LUT[k + 2]})`;
      ctx.fillRect(x0 + i * w, y0, w, h); ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.fillText(String(m), x0 + i * w, y0 + h + 11);
    });
    ctx.restore();
  }
  function drawBackground() {
    const B = BG[S.bg]; if (!B || (EXP && EXP.exam) || isTM()) return false;   // '현재 화면대로' 저장에는 배경도 넣어요
    const worldPx = 2 * Math.PI * s;                               // 지도 한 바퀴의 화면 폭
    const z = Math.max(1, Math.min(B.max, Math.round(Math.log2(worldPx / 256))));
    const n = 1 << z, tile = worldPx / n;                          // 타일 한 장의 화면 크기
    const X0 = W / 2 - (lon0 * RAD + Math.PI) * s, Y0 = cy - Math.PI * s;   // 웹 메르카토르 왼쪽 위 (180°W, 85°N)
    const x0 = Math.floor(-X0 / tile), x1 = Math.floor((W - X0) / tile), y0 = Math.max(0, Math.floor(-Y0 / tile)), y1 = Math.min(n - 1, Math.floor((H - Y0) / tile));
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingQuality = 'high';
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n, im = tileImg(B.url(z, wx, ty), B.elev && { z, y: ty });
      const px = X0 + tx * tile, py = Y0 + ty * tile;
      const ok = o => o && (B.elev ? o.cv : o.complete && o.naturalWidth) ? (B.elev ? o.cv : o) : null;
      if (ok(im)) ctx.drawImage(ok(im), px, py, tile + 0.5, tile + 0.5);
      else {   // 아직 안 온 타일은 한 단계 위(큰) 타일을 늘려서 임시로
        const pz = z - 1, pim = ok(tileCache.get(B.url(pz, wx >> 1, ty >> 1)));
        if (pim) ctx.drawImage(pim, (wx & 1) * 128, (ty & 1) * 128, 128, 128, px, py, tile + 0.5, tile + 0.5);
      }
    }
    ctx.restore();
    return true;
  }
  // ───────── 하천 (HydroRIVERS, 처음 켤 때 불러와요) ─────────
  let rivTopo = null, rivLoading = false;
  function needRivers() {
    if (rivTopo || rivLoading || S.rivers === 'off') return;
    rivLoading = true;
    fetch('data/rivers.json?v=5').then(r => r.json()).then(t => { rivTopo = t; rivLabelPts = null; requestDraw(); })
      .catch(() => showToast('하천 자료를 불러오지 못했어요')).finally(() => { rivLoading = false; });
  }
  // 키: 단계(m 주요 · d 지류) + 구역(s 남측 · n 북측 · o 주변 나라) + 굵기(1~3, 지류 0)
  function drawRivers(px, southOn, nkOn, landShape) {
    if (S.rivers === 'off') return;
    if (!rivTopo) return needRivers();
    const exam = EXP && EXP.exam, sat = !exam && S.bg === 'sat' && !isTM();
    const col = exam ? '#333333' : sat ? '#8FD3FF' : '#2F86D3';
    const zones = [southOn && 's', nkOn && 'n', S.show.nb && !S.lakes.sel && 'o'].filter(Boolean);
    const W_ = { 0: 0.45, 1: 0.8, 2: 1.15, 3: 1.6 };
    ctx.save(); ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const z of zones) {
      if (z === 's' && S.lakes.sel && landShape) { ctx.save(); ctx.clip(landShape); }
      const keys = (S.rivers === 'all' ? ['d' + z + '0'] : []).concat(['m' + z + '1', 'm' + z + '2', 'm' + z + '3']);
      for (const k of keys) {
        if (!rivTopo.objects[k]) continue;
        ctx.lineWidth = W_[k[2]] * (exam ? 0.85 : 1) * (S.rivW || 1) * px;
        ctx.stroke(shared('riv:' + k, () => topojson.feature(rivTopo, rivTopo.objects[k])));
      }
      if (z === 's' && S.lakes.sel && landShape) ctx.restore();
    }
    ctx.restore();
  }
  function syncRivers() {
    document.querySelectorAll('#riverSeg [data-riv]').forEach(b => b.classList.toggle('sel', b.dataset.riv === S.rivers));
    const ri = $('#rivW'); if (ri) { ri.value = S.rivW; $('#rivWOut').textContent = (+S.rivW).toFixed(1); ri.closest('.row').classList.toggle('off', S.rivers === 'off'); }
    const rn = $('#rivNames'); if (rn) { rn.checked = !!S.rivNames; rn.closest('.row').classList.toggle('off', S.rivers === 'off'); }
    const c = $('#rivCredit'); if (c) c.textContent = S.rivers !== 'off' ? ' · 하천: HydroRIVERS (Lehner & Grill 2013) · 하구 일부: 국가하천 하천망도' : '';
    needRivers();
  }
  $('#rivNames').addEventListener('change', e => { S.rivNames = e.target.checked; requestDraw(); saveSoon(); });
  $('#rivW').addEventListener('input', e => { S.rivW = +e.target.value; $('#rivWOut').textContent = S.rivW.toFixed(1); requestDraw(); saveSoon(); });
  document.querySelectorAll('#riverSeg [data-riv]').forEach(b => b.addEventListener('click', () => { S.rivers = b.dataset.riv; syncRivers(); requestDraw(); saveSoon(); }));
  // 도법: 횡축 메르카토르 ↔ 메르카토르 (화면 가운데·확대 정도는 그대로)
  function setKProj(mode, quiet) {
    if (mode === S.kproj) return;
    const v = W ? currentView() : null;
    S.kproj = mode;
    SH.merc = {};
    for (const f of [...countries, skF].filter(Boolean)) { delete f.shape; delete f.outlineM; }
    if (isTM() && S.bg !== 'off') { S.bg = 'off'; if (!quiet) showToast('횡축 메르카토르에서는 배경 지도를 쓸 수 없어서 껐어요'); }
    hoverId = null; hideTip();
    if (W) { computeFits(); sMin = sMinM; if (v) setView(v.lon, v.lat, v.z, false); }
    syncBg(); syncKProj(); requestDraw(); saveSoon();
  }
  function syncKProj() {
    document.querySelectorAll('#kprojSeg [data-kproj]').forEach(b => b.classList.toggle('sel', b.dataset.kproj === S.kproj));
    const bs = $('#bgSeg'); bs.classList.toggle('locked', isTM());
    bs.title = isTM() ? '횡축 메르카토르에서는 배경 지도를 쓸 수 없어요 (도법을 메르카토르로 바꾸면 쓸 수 있어요)' : '인터넷 지도를 밑에 깔아요 (현재 화면대로 저장할 때만 들어가요)';
    document.querySelectorAll('#lcSeg [data-lc]').forEach(b => b.classList.toggle('sel', (b.dataset.lc === 'light') === !!S.lineLight));
    const pn = $('#projName'); if (pn) pn.textContent = isTM() ? '횡축 메르카토르 도법 (UTM-K 방식)' : '메르카토르 도법';
  }
  document.querySelectorAll('#kprojSeg [data-kproj]').forEach(b => b.addEventListener('click', () => setKProj(b.dataset.kproj)));
  function syncBg() {
    document.querySelectorAll('#bgSeg [data-bg]').forEach(b => b.classList.toggle('sel', b.dataset.bg === S.bg));
    const c = BG[S.bg]; $('#bgCredit').textContent = c ? ' · ' + c.credit : '';
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
    if (isTM()) { d3.geoPath(tmBase, p2)(geo); return p2; }   // 횡축 메르카토르: 곡선(경위선)도 매끈하게
    // 원본 데이터가 이미 180°에서 잘려 있으므로, 구면 자르기 없이 평면으로 바로 옮겨요.
    for (const dx of [0]) {   // 한반도는 지도를 돌리지 않아서 한 벌만
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

  function setWorldTransform(shift = 0) {
    if (isEE()) { ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ex, dpr * ey); return; }
    // 화면 왼쪽 끝의 기준 x가 [-π, π) 안에 오도록 지도 벌을 고름
    const tx = W / 2 - s * lon0 * RAD;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (tx + shift), dpr * cy);
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
    const bgOn = drawBackground();
    const sk = selKey();
    const southOn = S.unit !== 'none';
    const outlineShape = southOn ? shared('outline:' + sk, () => kMesh('outline')) : null;
    const landShape = southOn ? shared('land:' + sk, () => kMesh('land')) : null;   // 남측 땅 바탕: 칠할 때 지역 사이 가는 틈을 메워요
    const sdShape = S.unit === 'sd' || S.unit === 'sg' ? shared('sd:' + sk, () => kMesh('sd')) : null;
    const sgShape = S.unit === 'sg' ? shared('sg:' + sk, () => kMesh('sg')) : null;
    const nkShape = shared('nkline:' + S.era, () => kMesh('nk'));
    const step = gridStep();
    const gridShape = S.show.grid ? shared('grid' + step, () => graticules[step]) : null, equatorShape = shared('equator', () => equator);
    // 많이 축소하면 지도 한 바퀴가 화면보다 좁아져요 → 옆으로 이어 붙여 빈 곳 없이 (도형 하나에 두 바퀴가 들어 있음)
    const reps = 1;   // 한반도: 지도 한 벌만
    for (let rep = 0; rep < reps; rep++) {
      setWorldTransform(rep * 2 * TAU * s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (isEE()) {   // 지도 바깥 테두리(타원) 안을 바다색으로
        const sp = shared('sphere', () => SPHERE);
        ctx.save(); if (!EXP) { ctx.shadowColor = 'rgba(20,40,70,.10)'; ctx.shadowBlur = 18; }
        ctx.fillStyle = S.ocean; ctx.fill(sp); ctx.restore();
      }

      // 1) 지역 채우기: 시도 바탕(남측 전체 색) → 칠한 시군을 위에. 배경 지도를 켜면 칠한 곳만 반투명으로
      if (bgOn) ctx.globalAlpha = 0.6;
      if (landShape && (!bgOn || S.colors.get('sk'))) { ctx.fillStyle = fillFor(ctx, S.colors.get('sk') || S.land, dpr * s); ctx.fill(landShape); }
      for (const f of countries) {
        if (!featOn(f)) continue;
        let c = S.colors.get(f.id);
        if (f.kind === 'sd') c = c || S.colors.get('sk');
        if (!c && (f.kind === 'sg' || bgOn)) continue;
        ctx.fillStyle = fillFor(ctx, c || S.land, dpr * s);
        ctx.fill(f.id === 'sd:경상북도' && hideUL() ? shared('gbNoUL:' + S.era, () => ({ type: 'MultiPolygon',
          coordinates: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).filter(pg => d3.geoCentroid({ type: 'Polygon', coordinates: pg })[0] < 130.5) })) : shapeOf(f));
      }
      ctx.globalAlpha = 1;
      const lightL = bgOn && S.bg === 'sat', LC = lightL ? '#FFFFFF' : '#1a1a1a', LC2 = lightL ? 'rgba(255,255,255,.8)' : '#8c8c8c', LG = lightL ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.22)';
      // 3) 경위선·적도
      if (S.show.grid) {
        ctx.lineWidth = 0.6 * px; ctx.strokeStyle = LG;   /* 경위선은 가는 실선 (국경 점선과 구별) */
        ctx.stroke(gridShape); ctx.setLineDash([]);
      }

      // 4) 해안선·둘레, 시도·시군 경계
      ctx.lineWidth = lw * px; ctx.strokeStyle = LC;
      if (S.show.nb && !S.lakes.sel) {
        ctx.stroke(shared('nbcoast', () => nbCoastMesh));
        ctx.lineWidth = lw * 0.9 * px; ctx.setLineDash([3.2 * px * Math.max(1, lw), 2.2 * px * Math.max(1, lw)]);
        ctx.stroke(shared('nbborder', () => nbBorderMesh)); ctx.setLineDash([]);
        ctx.lineWidth = lw * px;
      }
      const nkOn = S.show.nk && !S.lakes.sel;
      if (nkOn) ctx.stroke(nkShape);
      if (outlineShape) ctx.stroke(outlineShape);
      // 휴전선: 남측이나 북측을 그릴 때 (기본 점선)
      const dmzOn = nkOn || southOn;
      if (dmzOn) {
        if (S.show.dmzDash) ctx.setLineDash([4 * px * Math.max(1, lw), 2.6 * px * Math.max(1, lw)]);
        ctx.stroke(nkOn ? shared('dmz:' + S.era, () => kMesh('dmz', true)) : shared('dmz:' + sk, () => kMesh('dmz'))); ctx.setLineDash([]);
      }
      if (sdShape || sgShape) {
        if (sgShape) {   // 시군 경계: 회색으로 흐리게
          ctx.strokeStyle = LC2;
          const w = S.lineSg; ctx.lineWidth = w * px;
          if (S.borderDash) ctx.setLineDash([2.6 * px * Math.max(1, w), 1.9 * px * Math.max(1, w)]);
          ctx.stroke(sgShape); ctx.setLineDash([]);
        }
        ctx.strokeStyle = LC;
        const w = S.lineSd; ctx.lineWidth = w * px;
        if (S.borderDash) ctx.setLineDash([3.2 * px * Math.max(1, w), 2.2 * px * Math.max(1, w)]);   // 시험지처럼 점선
        if (sdShape) ctx.stroke(sdShape);
        ctx.setLineDash([]);
      }
      drawRivers(px, southOn, S.show.nk && !S.lakes.sel, landShape);   // 하천: 경계선 위에 (강을 따라가는 경계에 가려 하구까지 안 이어져 보이지 않게)
      if (isEE()) { ctx.lineWidth = 1.2 * px; ctx.strokeStyle = EXP ? '#1a1a1a' : '#7d8a99'; ctx.stroke(shared('sphere', () => SPHERE)); }
      // 저장: 상자로 옮긴 섬(울릉도·독도)은 본 지도에서 바다색으로 덮어요
      if (EXP && EXP.isl && EXP.isl.length && byId.get(UL)) {
        ctx.fillStyle = S.ocean; ctx.strokeStyle = S.ocean; ctx.lineWidth = Math.max(4, lw * 3) * px; ctx.lineJoin = 'round';
        for (const nm of EXP.isl) { const sh = shared('isl:' + nm + ':' + S.era, () => islandGeo(nm)); ctx.fill(sh); ctx.stroke(sh); }
      }
      // 6) 마우스를 올린 나라 강조
      if (hoverId && byId.has(hoverId) && !isEE()) {
        const f = byId.get(hoverId);
        const key = isEE() ? 'outlineE' : 'outlineM';
        if (!f[key]) {
          const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
          // 시도는 바깥 테두리만, 자료 틈에서 생긴 아주 작은 조각(옛 광주 둘레 흔적)은 빼요
          const rings = f.kind === 'sd' || f.kind === 'sk' ? polys.filter(pg => pg[0].length > 4 || d3.geoArea({ type: 'Polygon', coordinates: pg }) > 3e-9).map(pg => pg[0]) : polys.flat();   // 시도는 바깥 테두리만 (자료 틈 구멍 무시)
          f[key] = (isEE() ? makeShapeEE : makeShape)(dropAntimeridian({ coordinates: rings }));
        }
        ctx.lineWidth = Math.max(1.6, lw * 2.2) * px; ctx.strokeStyle = '#1d2733'; ctx.stroke(f[key]);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlays();
  }

  // 라벨·점·경위선 숫자·축척
  // ───────── 바다 이름 ─────────
  // r: 1 대양 · 2 큰 바다 · 3 작은 바다 (글자 크기만 다름, 표시는 '바다 이름 고르기'에서)
  const SEAS = [
    { n: '동해', p: [130.6, 38.4], r: 2 }, { n: '황해', p: [124.35, 36.4], r: 2 }, { n: '남해', p: [127.75, 33.95], r: 2 },
    { n: '대한 해협', p: [128.85, 34.55], r: 3 }, { n: '동중국해', p: [125.4, 31.9], r: 3 }, { n: '제주 해협', p: [126.6, 33.85], r: 3 },
  ];
  function drawSeaNames() {
    const z = s / sMin, R = EXP && EXP.rect;
    const exam = EXP && EXP.exam;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const sea of SEAS) {
      if (!S.seas.sel.includes(sea.n)) continue;
      const p = proj(sea.p); if (!p || !isFinite(p[0])) continue;
      if (isEE()) { const back = proj.invert(p); if (!back) continue; }
      const fs = exam ? Math.round(EXP.font * (sea.r === 3 ? 0.8 : 0.9)) : (sea.r === 3 ? 12 : 14);
      const text = sea.n.replace(/ /g, '').split('').join(' ');   // 시험지처럼 글자 사이를 띄움
      ctx.font = `600 ${fs}px ${LABEL_FONT}`;
      const w = ctx.measureText(text).width, h = fs;
      let x = p[0], y = p[1];
      if (R) {   // 저장할 때: 기준점이 범위 안일 때만, 글자가 틀 안으로 들어오게
        if (outRect(p)) continue;
        const pd = h * 0.6 + 4;
        x = Math.max(R.x + w / 2 + pd, Math.min(R.x + R.w - w / 2 - pd, x));
        y = Math.max(R.y + h / 2 + pd, Math.min(R.y + R.h - h / 2 - pd, y));
      } else if (x < -w || x > W + w || y < -h || y > H + h) continue;
      ensureFont(`600 ${fs}px "Noto Serif KR"`, text);
      // 명조 글꼴엔 기울임꼴이 없어 브라우저마다 다르게 나와요 → 바른 명조를 직접 기울여 그림
      ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -0.21, 1, 0, 0);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(text, 0, 0);
      ctx.fillStyle = exam ? '#333' : '#2c5d8a'; ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // 강 이름: 대략 자리를 주면 가장 가까운 강줄기에 붙여요 (z: s 남측 · n 북측 · r: 1 늘 · 2 확대하면)
  const RIV_LABELS = [
    { n: '한강', p: [126.95, 37.53], z: 's', r: 1 }, { n: '북한강', p: [127.62, 37.80], z: 's', r: 2 }, { n: '남한강', p: [127.72, 37.27], z: 's', r: 2 },
    { n: '임진강', p: [126.93, 37.97], z: 's', r: 2 }, { n: '낙동강', p: [128.42, 36.15], z: 's', r: 1 }, { n: '남강', p: [128.28, 35.22], z: 's', r: 2 },
    { n: '금강', p: [127.08, 36.47], z: 's', r: 1 }, { n: '영산강', p: [126.70, 35.00], z: 's', r: 1 }, { n: '섬진강', p: [127.50, 35.22], z: 's', r: 1 },
    { n: '만경강', p: [127.00, 35.90], z: 's', r: 2 }, { n: '동진강', p: [126.85, 35.72], z: 's', r: 2 }, { n: '삽교천', p: [126.85, 36.70], z: 's', r: 2 },
    { n: '안성천', p: [127.05, 36.98], z: 's', r: 2 }, { n: '형산강', p: [129.25, 35.95], z: 's', r: 2 }, { n: '태화강', p: [129.20, 35.56], z: 's', r: 2 },
    { n: '대동강', p: [125.85, 39.05], z: 'n', r: 1 }, { n: '청천강', p: [125.65, 39.72], z: 'n', r: 1 }, { n: '압록강', p: [125.40, 40.45], z: 'n', r: 1 },
    { n: '두만강', p: [129.75, 42.55], z: 'n', r: 1 }, { n: '예성강', p: [126.25, 38.25], z: 'n', r: 2 },
  ];
  let rivLabelPts = null;
  function riverLabelPts() {   // 강줄기에 붙인 자리·방향 (처음 한 번)
    if (rivLabelPts || !rivTopo) return rivLabelPts;
    const lines = [];
    for (const k of Object.keys(rivTopo.objects)) if (k[0] === 'm') for (const l of topojson.feature(rivTopo, rivTopo.objects[k]).geometry.coordinates) lines.push(l);
    rivLabelPts = [];
    for (const L of RIV_LABELS) {
      let best = null, bd = 0.15 * 0.15;
      for (const l of lines) for (let i = 1; i < l.length - 1; i++) {
        const dx = (l[i][0] - L.p[0]) * Math.cos(L.p[1] * RAD), dy = l[i][1] - L.p[1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { p: l[i], a: l[Math.max(0, i - 2)], b: l[Math.min(l.length - 1, i + 2)] }; }
      }
      if (best) rivLabelPts.push({ ...L, ...best });
    }
    return rivLabelPts;
  }
  function drawRiverNames() {
    const pts = riverLabelPts(); if (!pts) return;
    const z = s / sMin, exam = EXP && EXP.exam, R = EXP && EXP.rect;
    const nkOn = S.show.nk && !S.lakes.sel;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const L of pts) {
      if (L.r > (z >= 1.5 ? 2 : 1)) continue;
      if (L.z === 'n' ? !nkOn : S.unit === 'none') continue;
      const p = proj(L.p), a = proj(L.a), b = proj(L.b); if (!p || !a || !b) continue;
      if (R ? outRect(p) : (p[0] < -50 || p[0] > W + 50 || p[1] < -20 || p[1] > H + 20)) continue;
      const fs = exam ? Math.round(EXP.font * 0.85) : (L.r === 1 ? 12.5 : 11.5);
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;   // 글자가 거꾸로 서지 않게
      ang = Math.max(-1.1, Math.min(1.1, ang));                                       // 너무 세로로 서지 않게
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.translate(0, -fs * 0.8);
      ctx.font = `600 ${fs}px ${LABEL_FONT}`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(L.n, 0, 0);
      ctx.fillStyle = exam ? '#333' : '#1F5F9E'; ctx.fillText(L.n, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  function drawTextLayer() {
    if (S.show.seas) drawSeaNames();
    if (S.rivers !== 'off' && S.rivNames) drawRiverNames();
    drawRegionLabels();
    drawPoints();
    if (S.show.grid && !(EXP && EXP.exam)) drawGridLabels();
    if (S.show.scale && !EXP) drawScale();
    if (!EXP) drawScreenLegend();
    drawElevLegend();
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
    for (const [c, fs] of groups) { ctx.beginPath(); for (const f of fs) g(f); ctx.fillStyle = fillFor(ctx, c, dpr); ctx.fill(); }
    if (S.show.lakes) { ctx.beginPath(); g(src.lakes); ctx.fillStyle = S.ocean; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#333'; ctx.stroke(); }
    if (S.show.grid) { ctx.beginPath(); g(graticules[gridStep()]); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.stroke(); ctx.setLineDash([]); }
    if (S.show.equator) { ctx.beginPath(); g(equator); ctx.lineWidth = 1.3; ctx.strokeStyle = '#D62828'; ctx.stroke(); }
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
      const k = isEE() || isTM() ? 1 : 1 / Math.cos(f.label[1] * RAD);   // 메르카토르는 고위도일수록 커 보임
      if (Math.sqrt(f.area) * s * k > 6) continue;
      const r = Math.max(2.6, Math.min(4.5, 2.2 + z * 0.15));
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
      ctx.fillStyle = fillFor(ctx, S.colors.get(f.id) || S.land, dpr); ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = '#1a1a1a'; ctx.stroke();
    }

    // 독도: 대한민국과 같은 색의 작은 점 (확대해도 점으로)
    {
      const p = dokdoVisible() && proj(DOKDO);
      if (p && p[0] > -10 && p[0] < W + 10 && p[1] > -10 && p[1] < H + 10) {
        ctx.beginPath(); ctx.arc(p[0], p[1], dokdoR(), 0, 2 * Math.PI);
        ctx.fillStyle = fillFor(ctx, S.colors.get('KOR') || S.land, dpr); ctx.fill();
        ctx.lineWidth = Math.min(0.9, dokdoR() * 0.5); ctx.strokeStyle = '#4b5663'; ctx.stroke();
      }
    }

    // 7) 나라 이름
    if (S.show.names || S.show.sgnames) drawLabels(z);
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
  // 횡축 메르카토르: 위선 lat 이 화면 x 와 만나는 y / 경선 lon 이 화면 y 와 만나는 x (반으로 나눠 찾기)
  function yAtX(lat, x) {
    let a = 60, b = 200;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (proj([m, lat])[0] < x) a = m; else b = m; }
    return proj([(a + b) / 2, lat])[1];
  }
  function xAtY(lon, y) {
    let a = -10, b = 80;   // 위도: 아래로 갈수록 y 가 커져요
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (proj([lon, m])[1] > y) a = m; else b = m; }
    const p = proj([lon, (a + b) / 2]); return Math.abs(p[1] - y) < 2 ? p[0] : null;
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
      } else if (isTM()) {
        const xl = area.left + 6, xr = W - (area.right || 0) - 6;
        L = [xl, yAtX(lat, xl), 'left']; R = [xr, yAtX(lat, xr), 'right'];
      } else {
        const y = proj([lon0, lat])[1];
        L = [area.left + 6, y, 'left']; R = [W - (area.right || 0) - 6, y, 'right'];
      }
      if (L[1] < top || L[1] > bot) continue;
      haloText(fmtLat(lat), L[0], L[1], L[2], col);
      if (!isEE() || Math.abs(R[0] - L[0]) > 80) haloText(fmtLat(lat), R[0], R[1], R[2], col);
    }
    // 경도: 적도를 따라 (적도가 화면 밖이면 화면 가장자리에)
    const eq = proj([isEE() ? S.eeLon : isTM() ? 127.5 : lon0, 0]);
    const y = Math.max(top + 4, Math.min(bot - 4, eq[1] + 11));
    let lastX = -1e9;
    const lons = [];
    for (let lon = -180; lon < 180; lon += step) lons.push(lon);
    const pts = lons.map(lon => {
      if (isEE() && Math.abs(normLon(lon - S.eeLon)) > 179) return null;
      if (isTM()) { if (lon < 90 || lon > 170) return null; const x = xAtY(lon, y); return x != null && x > 14 && x < W - 14 ? [lon, x] : null; }
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
  // 화면 한 지점에서 1px이 실제 몇 m인지
  function metersPerPx(cx, cy) {
    const a = proj.invert([cx - 50, cy]), b = proj.invert([cx + 50, cy]), ref = proj.invert([cx, cy]);
    const bad = q => !q || !isFinite(q[0]) || !isFinite(q[1]) || Math.abs(q[1]) > 85;
    if (bad(a) || bad(b) || bad(ref)) return null;
    if (isEE() && Math.hypot(...proj(a).map((v, i) => v - [cx - 50, cy][i])) > 1) return null;
    return { mpp: d3.geoDistance(a, b) * 6371000 / 100, lat: ref[1] };
  }
  // 축척 막대 값: 100, 200, 300, 500, 1000, 2000, 3000, 5000 … km 중 target 길이보다 짧은 가장 큰 값
  function niceKm(maxKm) {
    const e = Math.pow(10, Math.floor(Math.log10(maxKm)));
    for (const m of [5, 3, 2, 1]) if (m * e <= maxKm) return m * e;
    return e;
  }
  // 시험지 모양 축척 막대: 가는 선, 양 끝 짧은 눈금, 위에 '0'과 'NNNkm'. (x, y)는 상자 왼쪽 위
  function scaleBarSize(g, len, fs, km) {
    g.font = `500 ${fs}px ${SANS_FONT}`;
    const w0 = g.measureText('0').width, wl = g.measureText(km + 'km').width;
    return { w: w0 / 2 + len + wl / 2, h: fs * 1.15 + fs * 0.45, w0, wl };
  }
  function drawScaleBar(g, x, y, len, fs, km, lw, color = '#000') {
    ensureFont(`500 ${fs}px "Noto Sans KR"`, '0123456789km');
    const z = scaleBarSize(g, len, fs, km), x0 = x + z.w0 / 2, yb = y + z.h, th = fs * 0.4;
    g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = lw; g.lineCap = 'butt'; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(x0, yb - th); g.lineTo(x0, yb); g.lineTo(x0 + len, yb); g.lineTo(x0 + len, yb - th); g.stroke();
    g.font = `500 ${fs}px ${SANS_FONT}`; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    g.lineJoin = 'round'; g.lineWidth = fs * 0.25; g.strokeStyle = 'rgba(255,255,255,.9)';
    const ty = yb - th - fs * 0.25;
    g.strokeText('0', x0, ty); g.fillText('0', x0, ty);
    g.strokeText(km + 'km', x0 + len, ty); g.fillText(km + 'km', x0 + len, ty);
    g.restore();
    return z;
  }
  function drawScale() {
    const cx = (area.left + W - (area.right || 0)) / 2, cyM = (area.top + area.bot) / 2;
    const m = metersPerPx(cx, cyM); if (!m) return;
    const raw = m.mpp / (0.0254 / 96);
    const e = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
    const denom = Math.round(raw / e) * e;                       // 앞 두 자리만 남김
    const text = `1 : ${denom.toLocaleString('ko-KR')}`;
    const lat = Math.round(m.lat);
    const capt = `화면 가운데(${lat === 0 ? '적도' : fmtLat(lat)}) 기준`;
    const km = niceKm(m.mpp * 120 / 1000), len = km * 1000 / m.mpp;
    const x = W - (area.right || 0) - 12, y = area.line;
    ctx.save();
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    ctx.font = `700 13px ${FONT}`;
    const wT = ctx.measureText(text).width;
    ctx.font = `500 10px ${FONT}`;
    const wC = ctx.measureText(capt).width;
    const bar = scaleBarSize(ctx, len, 12, km);
    const bw = Math.max(wT, wC, bar.w);
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    roundRect(x - bw - 10, y - 32 - bar.h - 6, bw + 20, 38 + bar.h + 6, 8); ctx.fill();
    drawScaleBar(ctx, x - bar.w, y - 32 - bar.h, len, 12, km, 1.2, '#1d2733');
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1d2733'; ctx.font = `700 13px ${FONT}`; ctx.fillText(text, x, y - 14);
    ctx.fillStyle = '#5b6776'; ctx.font = `500 10px ${FONT}`; ctx.fillText(capt, x, y - 1);
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 시도 이름 · 시군 이름 (겹치면 뒤의 것은 생략)
  function drawLabels(z) {
    const boxes = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const put = (f, text, fs, weight, color) => {
      const p = proj(f.label);
      if (!p || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return;
      ctx.font = `${weight} ${fs}px ${FONT}`;
      const w = ctx.measureText(text).width, h = fs + 2;
      const box = [p[0] - w / 2 - 2, p[1] - h / 2, p[0] + w / 2 + 2, p[1] + h / 2];
      if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
      boxes.push(box);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(text, p[0], p[1]);
      ctx.fillStyle = color; ctx.fillText(text, p[0], p[1]);
    };
    if (S.show.names) for (const f of sdF) if (featOn(f)) put(f, z < 1.6 ? f.properties.s : f.properties.ko, 13, 700, '#1d2733');
    if (S.show.names && S.show.nb && !S.lakes.sel) for (const f of nbF) put(f, f.properties.ko, 13, 700, '#5b6776');
    if (S.show.sgnames) for (const f of sgF) if (featOn(f)) put(f, f.properties.ko, 11, 500, '#33404d');
  }

  // ───────── 나라 찾기 (클릭 위치) ─────────
  const inBox = (f, lon, lat) => lat >= f.bb[0][1] && lat <= f.bb[1][1] &&
    (f.wrap ? (lon >= f.bb[0][0] || lon <= f.bb[1][0]) : (lon >= f.bb[0][0] && lon <= f.bb[1][0]));

  let hitDokdo = false;
  // 독도: 울릉도(지름 약 10km)의 1/4 크기 → 반지름 약 1.25km. 축소하면 사라지지 않게 가장 작은 점으로
  const pxPerKm = () => s / (6371 * (isEE() || isTM() ? 1 : Math.cos(DOKDO[1] * RAD)));
  const dokdoVisible = () => false;     // 한반도 지도에는 독도가 그려져 있어요
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
    // 시군을 찾은 뒤, 지금 단위(남측·시도·시군)로 바꿔요. 남측이 아니면 북측·주변 나라
    if (S.unit !== 'none') for (const f of sgF) if (featOn(f) && inBox(f, lon, lat) && d3.geoContains(f, ll)) {
      return S.unit === 'sg' ? f : S.unit === 'sd' ? byId.get('sd:' + f.properties.sd) : skF;
    }
    for (const f of [nkF, ...nbF]) if (featOn(f) && inBox(f, lon, lat) && d3.geoContains(f, ll)) return f;
    // 바로 그 자리에 없으면 둘레(작은 시군·섬)를 살펴요
    if (tolerance && S.unit !== 'none' && !hitTest.inner) {
      hitTest.inner = true;
      try {
        for (const r of [tolerance * 0.5, tolerance]) for (let a = 0; a < 8; a++) {
          const f = hitTest(px + r * Math.cos(a * Math.PI / 4), py + r * Math.sin(a * Math.PI / 4), 0);
          if (f && f.kind !== 'nb') return f;
        }
      } finally { hitTest.inner = false; }
    }
    return null;
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
    $('#count').textContent = `칠한 지역 ${S.colors.size}개`;
    if (typeof renderLegendPanel === 'function') renderLegendPanel();
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
  // 받침에 맞는 조사 (숫자는 읽는 소리로: 1 일, 3 삼 …)
  function josa(word, withB, noB, ro) {
    const ch = String(word).trim().slice(-1), DIG = { 0: 21, 1: 8, 2: 0, 3: 16, 4: 0, 5: 0, 6: 1, 7: 8, 8: 8, 9: 0 };
    let jong = 0;
    if (ch in DIG) jong = DIG[ch];
    else { const c = ch.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return noB; jong = c % 28; }
    if (!jong) return noB;
    return ro && jong === 8 ? noB : withB;   // ㄹ 받침 + 로
  }
  function colorName(c) {
    const i = PALETTES[0].colors.map(x => x.toLowerCase()).indexOf(String(c).toLowerCase());
    if (isHatch(c)) return '빗금';
    return i === 0 ? '흰색' : i > 0 ? `회색 ${[0, 1, 3, 5, 7][i]}` : '고른 색';
  }
  function paint(f) {
    const id = f.id, before = S.colors.get(id) || null;
    const name = f.properties.ko;
    let after;
    if (S.tool === 'erase') after = null;
    else after = (before && before.toLowerCase() === S.current.toLowerCase()) ? null : S.current;
    if (before === after) { showToast(`${name}: 칠해진 색이 없어요`); return; }
    commit([[id, before, after]], name);
    if (after && S.dockHidden && !firstPaintTold) {   // 색칠하기 패널을 안 열고 처음 칠했을 때: 무슨 색인지 알려 줘요
      firstPaintTold = true;
      const cn = colorName(after);
      showToast(`${name}${josa(name, '을', '를')} ${cn}${josa(cn, '으로', '로', true)} 칠했어요 · 다른 색은 [색칠하기]에서 골라요`, true, 4200);
      $('#colorBtn').classList.add('nudge'); setTimeout(() => $('#colorBtn').classList.remove('nudge'), 2400);
      return;
    }
    showToast(after ? `${name} 칠함` : `${name} 지움`, true);
  }

  // ───────── 입력: 마우스·터치 ─────────
  const pointers = new Map();
  let tap = null, pinch = null, lastTip = 0, longTimer = 0, missCount = 0, zoomHinted = false, firstPaintTold = false;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 1) {
      tap = { id: e.pointerId, x, y, t: performance.now(), moved: false, type: e.pointerType };
      // B-2 폰: 누르고 있으면 칠할 곳 이름을 먼저 보여 줘요 (그대로 떼면 칠하고, 밀면 취소)
      clearTimeout(longTimer);
      if (e.pointerType !== 'mouse' && !pointMode) {
        const t0 = tap;
        longTimer = setTimeout(() => {
          if (tap !== t0 || tap.moved || pointers.size !== 1) return;
          const f = hitTest(t0.x, t0.y, 16); if (!f) return;
          t0.long = true; showTip(f, t0.x, t0.y - 46);
        }, 400);
      }
      // 점찍기 중에 찍어 둔 점을 누르면: 끌어서 옮기기
      // 라벨은 언제든 끌어 옮길 수 있어요 (점 라벨이 위에 그려지므로 먼저 확인)
      const lp = labelAt(x, y), rl = !lp && rlabelAt(x, y);
      if (legendHit(x, y)) tap.legend = { x0: legendBox.x, y0: legendBox.y, box: { ...legendBox } };
      else if (lp) tap.label = { pt: lp, base: lp.off ? [...lp.off] : defaultOff(), from: lp.off ? [...lp.off] : null };
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
      if (tap && !tap.moved && Math.hypot(x - tap.x, y - tap.y) > (tap.long ? 12 : 6)) { tap.moved = true; canvas.classList.add('dragging'); clearTimeout(longTimer); if (tap.long) { hideTip(); tap.long = false; } }
      if (tap && tap.legend && tap.moved) {         // 범례 상자 옮기기
        const b = tap.legend.box, nx = tap.legend.x0 + x - tap.x, ny = tap.legend.y0 + y - tap.y;
        S.legend.pos = [Math.max(0, Math.min(1, (nx - b.x0) / Math.max(1, b.x1 - b.x0 - b.w))), Math.max(0, Math.min(1, (ny - b.y0) / Math.max(1, b.y1 - b.y0 - b.h)))];
        requestDraw();
      } else if (tap && tap.rlabel && tap.moved) {         // 색칠 라벨 끌기
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
    clearTimeout(longTimer); if (tap && tap.long) hideTip();
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (tap && tap.legend) {
      saveSoon(); openLabels('legend');
    } else if (tap && tap.rlabel && tap.moved) {
      const { r, from } = tap.rlabel;
      let to = r.off; if (to && Math.hypot(to[0], to[1]) < 10) to = null;
      r.off = from;
      regionsAction(to ? '라벨 옮김' : '라벨 원래 자리', () => { const q = S.regions.find(x => x.id === r.id); if (q) q.off = to; });
      openLabels('regions');      // 라벨을 옮기면 그 라벨 탭을 열어요
    } else if (tap && tap.label && tap.moved) {          // 라벨 옮기기 끝 (원래 자리 가까이 놓으면 가이드선 없앰)
      const { pt, from } = tap.label, d0 = defaultOff();
      let to = pt.off; if (to && Math.hypot(to[0] - d0[0], to[1] - d0[1]) < 12) to = null;
      pt.off = from;
      pointsAction(to ? '라벨 옮김' : '라벨 원래 자리', () => { const p = S.points.find(q => q.id === pt.id); if (p) p.off = to; });
      selPoint = pt.id; openLabels('points'); renderPoints();
    } else if (tap && tap.point && tap.moved) {          // 점 옮기기 끝 (목록 도시를 옮기면 직접 찍은 점이 돼요)
      const { pt, from } = tap.point, to = [pt.lon, pt.lat];
      pt.lon = from[0]; pt.lat = from[1];
      pointsAction(`${pt.label || '도형'} 옮김`, () => { const p = S.points.find(q => q.id === pt.id); if (p) { p.lon = to[0]; p.lat = to[1]; if (p.city) p.city = null; } });
    } else if (tap && tap.id === e.pointerId && !tap.moved && (tap.long || performance.now() - tap.t < 700) && e.type === 'pointerup') {
      if (pointMode) {
        const hitP = tap.point ? tap.point.pt : tap.label ? tap.label.pt : null;
        if (hitP) selectPoint(hitP.id, true);
        else addPoint(tap.x, tap.y);
      } else {
        const f = hitTest(tap.x, tap.y, tap.type === 'mouse' ? 7 : 16);
        if (f) { missCount = 0; paint(f); }
        else if (++missCount >= 2 && !zoomHinted && s / sMin < 2) { zoomHinted = true; showToast('작은 지역은 확대하면 누르기 쉬워요 (마우스 휠·두 손가락)', false, 3200); }
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
    if (!pointMode && (legendHit(x, y) || labelAt(x, y) || rlabelAt(x, y))) { canvas.style.cursor = 'grab'; if (hoverId) { hoverId = null; requestDraw(); } return hideTip(); }
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
    tip.innerHTML = `${f.properties.ko}<small>${f.kind === 'sg' ? f.properties.sd : f.kind === 'sd' ? '시도' : f.kind === 'nb' ? '주변 나라' : ''}</small>`;
    tip.style.display = 'block';
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(W - tw - 8, x + 16) + 'px';
    tip.style.top = (y + 18) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }
  function showTip(f, x, y) {   // 폰에서 누르고 있을 때: 손가락 위에 이름
    tip.innerHTML = `${f.properties.ko}<small>${f.kind === 'sg' ? f.properties.sd : f.kind === 'sd' ? '시도' : ''} · 떼면 칠해요</small>`;
    tip.style.display = 'block';
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(W - tw - 8, x - tw / 2)) + 'px'; tip.style.top = Math.max(8, y - 20) + 'px';
  }

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
    const pal = PALETTES[S.palette].colors, hatch = S.palette >= 2 ? 'hatch:' + pal[pal.length - 1] : HATCH;   // 단계 팔레트: 가장 진한 색 빗금
    [...pal, hatch].forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = cssFill(c); b.dataset.c = c; b.title = isHatch(c) ? '빗금' : c;
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
      const on = S.tool === 'paint' && b.dataset.c.toLowerCase() === S.current.toLowerCase();
      b.classList.toggle('sel', on); found = found || on;
    });
    $('.custom').classList.toggle('sel', S.tool === 'paint' && !found);
    $('.custom').style.setProperty('--c', S.current);
    $('#eraser').classList.toggle('sel', S.tool === 'erase');
    const dot = $('#colorBtn .dot'); if (dot) dot.style.background = S.tool === 'erase' ? '#fff' : cssFill(S.current);
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
    // (한반도 앱: 선 굵기 세 줄은 늘 켜져 있어요)
    document.querySelectorAll('#dashSeg button').forEach(b => b.classList.toggle('sel', (b.dataset.dash === '1') === !!S.borderDash));
  }
  document.querySelectorAll('#dashSeg button').forEach(b => b.addEventListener('click', () => {
    S.borderDash = b.dataset.dash === '1'; syncLayers(); requestDraw(); saveSoon();
  }));
  // 경계·색칠 단위
  function syncUnit() { document.querySelectorAll('#unitSeg [data-unit]').forEach(b => b.classList.toggle('sel', b.dataset.unit === S.unit)); }
  // 칠하는 단위는 하나만: 단위를 바꾸면 다른 단위로 칠한 색은 지워요 (되돌리기로 되살릴 수 있어요)
  const unitOf = id => id === 'sk' ? 'sk' : id.startsWith('sd:') ? 'sd' : id.startsWith('sg:') ? 'sg' : null;
  document.querySelectorAll('#unitSeg [data-unit]').forEach(b => b.addEventListener('click', () => {
    const u = b.dataset.unit; if (u === S.unit) return;
    const before = fullSnap(), gone = [...S.colors.keys()].filter(id => unitOf(id) && unitOf(id) !== u);
    S.unit = u; hoverId = null;
    for (const id of gone) S.colors.delete(id);
    const after = fullSnap();
    commitAction({ label: '칠하는 단위 바꿈', undo: () => applySnap(before), redo: () => applySnap(after) });
    syncUnit(); afterChange(); requestDraw(); saveSoon();
    const name = { none: '남측을 그리지 않아요', sk: '남측 전체를 한 번에 칠해요', sd: '시도 단위로 칠해요', sg: '시군 단위로 칠해요' }[u];
    showToast(gone.length ? `${name} · 다른 단위로 칠한 ${gone.length}곳은 지웠어요` : name, gone.length > 0, gone.length ? 3600 : 0);
  }));
  function syncEra() { document.querySelectorAll('#eraSeg [data-era]').forEach(b => b.classList.toggle('sel', b.dataset.era === S.era)); }
  document.querySelectorAll('#eraSeg [data-era]').forEach(b => b.addEventListener('click', () => setEra(b.dataset.era)));
  $('#kbarBtn').addEventListener('click', () => { document.body.classList.toggle('kbar-open'); computeFits && computeFits(); requestDraw(); });
  async function setEra(era, quiet, noUndo) {
    if (era === S.era) return;
    const prevEra = S.era, before = fullSnap();
    S.era = era; syncEra(); hoverId = null;
    await loadData();
    // 이 지도에 없는 지역의 색은 정리 (예: 통합 전 광주광역시 ↔ 통합 후 광주의 구)
    const gone = [...S.colors.keys()].filter(id => !byId.has(id));
    for (const id of gone) S.colors.delete(id);
    if (S.lakes.sel) {   // 고른 시도 이어 주기: 전남광주통합특별시 ↔ 광주광역시·전라남도
      const JN = '전남광주통합특별시', OLD = ['광주광역시', '전라남도'];
      let sel = S.lakes.sel;
      if (era === 'before' && sel.includes(JN)) sel = [...sel.filter(n => n !== JN), ...OLD];
      if (era === 'after' && OLD.some(n => sel.includes(n))) sel = [...sel.filter(n => !OLD.includes(n)), JN];
      S.lakes.sel = sel.filter(n => sdF.some(f => f.properties.ko === n));
    }
    if (S.lakes.sel && !S.lakes.sel.length) S.lakes.sel = null;
    afterChange(); requestDraw(); saveSoon();
    if (!noUndo) {   // 통합 전·후 바꾸기도 되돌리기로 (지워진 색까지 함께)
      const after = fullSnap();
      commitAction({ label: '행정구역 바꿈', undo: () => setEra(prevEra, true, true).then(() => applySnap(before)), redo: () => setEra(era, true, true).then(() => applySnap(after)) });
    }
    if (sideName === 'lakes') renderLakes();   // '보일 시도' 패널이 열려 있으면 바로 바꿔요
    if (sideName === 'points') renderCities();
    updateCounts();
    const msg = era === 'before' ? '전남·광주 통합 전 지도 (광주광역시·전라남도)' : '전남광주통합특별시 지도 (광주권의 구 표시)';
    if (!quiet) showToast(msg + (gone.length ? ` · 이 지도에 없는 ${gone.length}곳의 색은 지웠어요` : ''), gone.length > 0, 3600);
  }
  document.querySelectorAll('#bgSeg [data-bg]').forEach(b => b.addEventListener('click', () => {
    if (isTM()) return showToast('횡축 메르카토르에서는 배경 지도를 쓸 수 없어요 · 도법을 메르카토르로 바꿔 주세요');
    S.bg = b.dataset.bg; syncBg(); requestDraw(); saveSoon();
    if (S.bg !== 'off') showToast('배경 지도는 \'현재 화면대로\' 저장할 때만 들어가요 (시험지용에는 안 들어가요)');
  }));
  const layersBtn = $('#layersBtn'), layersPanel = $('#layersPanel');
  function openLayers(open) {
    layersPanel.hidden = !open; layersBtn.setAttribute('aria-expanded', String(open));
    if (open) {   // 메뉴가 두 줄이면 아랫줄을 가리지 않게 그 아래에서 열어요
      const st = stage.getBoundingClientRect(), cb = $('#controls').getBoundingClientRect();
      layersPanel.style.top = (cb.bottom - st.top + 8) + 'px';
      layersPanel.style.maxHeight = `calc(100% - ${cb.bottom - st.top + 20}px)`;
    }
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
  for (const key of ['lineSd', 'lineSg']) {
    const inp = $('#' + key), out = $('#' + key + 'Out');
    inp.value = S[key]; out.textContent = S[key].toFixed(1);
    inp.addEventListener('input', () => { S[key] = +inp.value; out.textContent = S[key].toFixed(1); requestDraw(); saveSoon(); });
  }
  function syncLines() { for (const k of ['lineSd', 'lineSg']) { $('#' + k).value = S[k]; $('#' + k + 'Out').textContent = S[k].toFixed(1); } }
  const lineInput = $('#lineWidth'), lineOut = $('#lineWidthOut');
  lineInput.addEventListener('input', () => { S.line = +lineInput.value; lineOut.textContent = S.line.toFixed(1); requestDraw(); saveSoon(); });

  // ───────── 초기화 (되돌리기로 되살릴 수 있게 전체 상태를 기억) ─────────
  const KEEP = ['current', 'palette', 'land', 'ocean', 'line', 'borderDash', 'show', 'seas', 'lakes', 'unit', 'kproj', 'bg', 'lineLight', 'rivers', 'rivW', 'rivNames', 'lineSd', 'lineSg', 'points', 'pstyle', 'fill', 'regions', 'rfill', 'rfont', 'legend'];
  const fullSnap = () => JSON.parse(JSON.stringify({ ...Object.fromEntries(KEEP.map(k => [k, S[k]])), colors: [...S.colors] }));
  function applySnap(sn) {
    const proj0 = S.proj, kp0 = S.kproj;
    for (const k of KEEP) if (sn[k] !== undefined) S[k] = JSON.parse(JSON.stringify(sn[k]));
    if (S.kproj !== kp0) { const to = S.kproj; S.kproj = kp0; setKProj(to, true); }
    S.colors = new Map(sn.colors);
    if (S.proj !== proj0) { const to = S.proj; S.proj = proj0; setProjection(to, true); }
    renderTabs(); renderSwatches(); renderMiniSwatches(); syncLayers(); syncProjUI(); syncUnit(); syncBg(); syncLines(); syncKProj(); syncRivers();
    lineInput.value = S.line; lineOut.textContent = S.line.toFixed(1);
    selPoint = null;
    if (sideName === 'points') { renderPstyle(); renderCities(); }
    if (sideName === 'labels') setLtab(ltab);
    if (sideName === 'lakes') renderLakes();
    if (sideName === 'seas') renderSeas();
  }
  function resetAll() {
    const before = fullSnap();
    const def = JSON.parse(JSON.stringify(DEFAULTS));
    applySnap({ ...Object.fromEntries(KEEP.map(k => [k, def[k]])), colors: [] });
    const after = fullSnap();
    commitAction({ label: '초기화', undo: () => applySnap(before), redo: () => applySnap(after) });
    // 화면도 처음 연 것처럼: 오른쪽 패널·지도 설정 닫고, 색칠하기 패널은 처음처럼
    if (sideName) openSide(null);
    openLayers(false);
    ltab = 'regions'; ptab = 'cities'; selPoint = null; S.tool = 'paint';
    document.body.classList.remove('sheet-min');
    S.dockHidden = DEFAULTS.dockHidden; syncDock(); syncSelection();
    if (S.era !== DEFAULTS.era) setEra(DEFAULTS.era, true, true);
    goHome();
    showToast('처음 상태로 돌렸어요 · 되돌리기로 되살릴 수 있어요', true);
  }
  const askReset = () => resetAll();   // 확인 창 없이 바로 초기화 (되돌리기로 되살릴 수 있어요)
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
    document.body.classList.toggle('side-open', !!sideName || !S.dockHidden);   // 오른쪽 패널 자리 (확대 버튼 등을 비켜요)
    if (!S.dockHidden) openLayers(false);
    $('#colorBtn .dot').style.background = S.tool === 'erase' ? '#fff' : cssFill(S.current);
    $('#colorBtn').classList.toggle('on', !S.dockHidden && !pointMode);
    resize(); requestDraw();
  }
  $('#dockHide').addEventListener('click', () => { S.dockHidden = true; syncDock(); saveSoon(); });
  $('#colorBtn').addEventListener('click', e => {
    e.stopPropagation();
    if (sideName) { openSide(null); S.dockHidden = false; }      // 다른 오른쪽 패널이 열려 있으면 색칠하기로 바꿈
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
    showToast(`${changes.length}개 지역의 색을 지웠어요`, true);
  });
  // 확대 비율 (처음 화면 = 100%)
  const ZREF = 1000 / (2 * Math.PI);
  const zoomPct = $('#zoomPct');
  let lastPct = '';
  function updateZoomPct() {
    const v = String(Math.round(s / sMin * 100));   // 처음 화면(한반도가 꼭 들어오는 크기) = 100
    if (v !== lastPct && document.activeElement !== zoomPct) { zoomPct.value = v; lastPct = v; }
  }
  function zoomToPct(pct) {
    const target = Math.max(minScale(), Math.min(sMin * MAX_ZOOM, pct / 100 * sMin));
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
    // (한반도 앱은 도법이 하나라 P 키를 쓰지 않아요)
    else if (!mod && e.key.toLowerCase() === 'p') { setKProj(isTM() ? 'merc' : 'tm'); }
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
  // 점 모양 6가지: 모두 가로·세로 2r 인 같은 크기 상자 안에 그려요
  const SHAPES = [['circle', '●'], ['triangle', '▲'], ['square', '■'], ['circle-o', '○'], ['triangle-o', '△'], ['square-o', '□']];
  const SHAPE_IDS = SHAPES.map(x => x[0]);
  function drawSymbol(g, shape, x, y, r, fill, outline) {
    const hollow = /-o$/.test(shape), base = shape.replace(/-o$/, '');
    const lw = Math.max(1.3, r * 0.32);
    const ri = hollow ? r - lw / 2 : r;            // 빈 도형은 선 바깥이 상자에 맞게
    g.beginPath();
    if (base === 'square') g.rect(x - ri, y - ri, 2 * ri, 2 * ri);
    else if (base === 'triangle') { g.moveTo(x, y - ri); g.lineTo(x + ri, y + ri); g.lineTo(x - ri, y + ri); g.closePath(); }
    else g.arc(x, y, ri, 0, 2 * Math.PI);
    g.lineJoin = 'miter';
    if (hollow) { g.fillStyle = '#fff'; g.fill(); g.lineWidth = lw; g.strokeStyle = fill.toUpperCase() === '#FFFFFF' ? '#1a1a1a' : fill; g.stroke(); return; }
    g.fillStyle = fill; g.fill();
    if (outline) { g.lineWidth = 1.2; g.strokeStyle = '#1d2733'; g.stroke(); }
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
      const pc = ptColor(pt); drawSymbol(ctx, pt.shape || 'circle', p[0], p[1], r, pc, st.outline || pc.toUpperCase() === '#FFFFFF');
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
  const PCOLORS = ['#1A1A1A', '#7F7F7F', '#FFFFFF', '#E63946', '#F4A261', '#F9C74F'];   // 6색 + 원하는 색 = 한 줄
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
    if (!ll) return showToast('지도 바깥에는 도형을 찍을 수 없어요');
    let pt;
    pointsAction('도형 찍음', () => { pt = { id: newId(), lon: ll[0], lat: ll[1], city: null, label: '', off: null, shape: S.pstyle.shape, color: S.pstyle.color }; S.points.push(pt); relabel(); });
    selPoint = pt.id; renderCities(); renderPoints();
    showToast(`도형 찍음${pt.label ? ' (' + pt.label + ')' : ''} · 라벨은 ‘라벨·범례’에서 넣어요`, true);
  }
  function deletePoint(id) {
    const pt = S.points.find(p => p.id === id); if (!pt) return;
    const name = pt.label || pt.city || '도형';
    pointsAction(`${name} 삭제`, () => { S.points = S.points.filter(p => p.id !== id); relabel(); });
    if (selPoint === id) selPoint = null;
    showToast(`${name} 삭제`, true);
  }
  function toggleCity(c, on) {
    if (on) pointsAction(`${c.name} 추가`, () => { S.points.push({ id: newId(), lon: c.lon, lat: c.lat, city: c.name, label: c.name, off: null, shape: S.pstyle.shape, color: S.pstyle.color }); relabel(); });
    else pointsAction(`${c.name} 뺌`, () => { S.points = S.points.filter(p => p.city !== c.name); relabel(); });
  }
  function selectPoint(id, scroll) {
    selPoint = id;
    if (id && sideName !== 'points') openLabels('points');
    renderPoints(); requestDraw();
    if (id && scroll) { const row = $(`#pointList [data-id="${id}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); }
  }
  // 도형마다 찍을 때의 색을 기억해요 (시험지용 저장은 흑백)
  const ptColor = pt => { const c = pt.color || S.pstyle.color; return EXP && EXP.exam ? gray(c) : c; };
  const legendKeyOf = pt => (pt.shape || 'circle') + '|' + (pt.color || S.pstyle.color).toUpperCase();
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
    if (!(sideName === 'labels' && ltab === 'regions')) return;
    document.querySelectorAll('[data-rfill]').forEach(b => b.classList.toggle('sel', b.dataset.rfill === S.rfill));
    const list = $('#regionList');
    if ((list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') || dragRow) return;
    list.innerHTML = '';
    if (!S.regions.length) { list.innerHTML = '<div class="empty">아직 칠한 지역이 없어요.<br>지역을 칠하면 여기에 차례대로 나와요.</div>'; return; }
    for (const r of S.regions) {
      const f = byId.get(r.id); if (!f) continue;
      const row = document.createElement('div'); row.className = 'prow-item'; row.dataset.id = r.id;
      row.innerHTML = `<span class="grip" title="끌어서 순서 바꾸기">⋮⋮</span><span class="rsw" style="background:${cssFill(S.colors.get(r.id))}"></span>`;
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
      const del = document.createElement('button'); del.className = 'del'; del.title = '이 지역 색 지우기';
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
    if (!S.regions.length) return showToast('먼저 지역을 칠해 주세요');
    const names = { alpha: 'A B C', hangulp: '(가)(나)(다)', hangul: '가 나 다', name: '지역 이름', clear: '지우기' };
    regionsAction(`라벨 ${names[mode]}`, () => {
      if (SEQ.includes(mode)) { S.rfill = mode; relabelRegions(); }
      else if (mode === 'name') { S.rfill = null; S.regions.forEach(r => { const f = byId.get(r.id); r.label = f ? f.properties.ko : ''; }); }
      else { S.rfill = null; S.regions.forEach(r => { r.label = ''; }); }
    });
  }));

  // ───────── 범례 ─────────
  const lum = c => isHatch(c) ? -1 : parseInt(gray(c).slice(1, 3), 16);
  // 지금 지도에 쓰인 항목 (사용자가 정한 순서 → 새 항목은 기본 순서로 뒤에)
  function legendKeys(kind) {
    const L = S.legend[kind];
    let used;
    if (kind === 'fill') used = [...new Set(S.colors.values())].sort((a, b) => lum(b) - lum(a));   // 밝은 색 → 진한 색, 빗금은 끝
    else { const ks = [...new Set(S.points.map(legendKeyOf))]; used = SHAPE_IDS.flatMap(sh => ks.filter(k => k.split('|')[0] === sh)); }   // 모양·색 조합마다 한 줄
    const set = new Set(used);
    const ord = L.order.filter(k => set.has(k));
    return [...ord, ...used.filter(k => !ord.includes(k))];
  }
  function legendItems(kind) {
    const L = S.legend[kind];
    const keys = legendKeys(kind);
    return keys.map((k, i) => ({ key: k, on: !L.off.includes(k), text: SEQ.includes(L.mode) ? seqLabel(L.mode, i) : (L.text[k] || '') }));
  }
  function legendModel(exam) {
    const fills = legendItems('fill').filter(x => x.on), points = legendItems('point').filter(x => x.on);
    const groups = [];
    if (fills.length) groups.push({ kind: 'fill', title: S.legend.fill.title.trim(), items: fills });
    if (points.length) groups.push({ kind: 'point', title: S.legend.point.title.trim(), items: points });
    return groups;
  }
  // 범례 상자 크기 재기·그리기 (화면·저장 공용). fs: 글자 크기, exam: 흑백
  // 세로: 묶음마다 제목 + 한 줄씩, 묶음 사이 간격 / 가로: 묶음마다 한 줄 (칠 한 줄, 도형 다음 줄)
  function legendLayout(g, groups, fs) {
    const pad = fs * 0.55, rowH = fs * 1.45, sw = fs * 1.35, gap = fs * 0.5;
    const ggap = fs * 0.6, igap = fs * 1.1, horiz = S.legend.dir === 'h';
    const cells = [];   // { t:'title'|'item', gr, it, x, y(줄 가운데) }  (상자 왼쪽 위 기준)
    let w = 0, y = pad;
    groups.forEach((gr, gi) => {
      if (gi) y += ggap;
      if (horiz) {
        let x = pad; const my = y + rowH / 2;
        if (gr.title) { g.font = `500 ${fs}px ${SANS_FONT}`; cells.push({ t: 'title', gr, x, y: my }); x += g.measureText(gr.title).width + igap * 0.8; }
        g.font = `400 ${fs}px ${SANS_FONT}`;
        gr.items.forEach((it, ii) => { if (ii) x += igap; cells.push({ t: 'item', gr, it, x, y: my }); x += sw + gap + g.measureText(it.text || ' ').width; });
        w = Math.max(w, x - pad); y += rowH;
      } else {
        if (gr.title) { g.font = `500 ${fs}px ${SANS_FONT}`; w = Math.max(w, g.measureText(gr.title).width); cells.push({ t: 'title', gr, x: pad, y: y + rowH / 2 }); y += rowH; }
        g.font = `400 ${fs}px ${SANS_FONT}`;
        for (const it of gr.items) { w = Math.max(w, sw + gap + g.measureText(it.text || ' ').width); cells.push({ t: 'item', gr, it, x: pad, y: y + rowH / 2 }); y += rowH; }
      }
    });
    return { w: w + pad * 2, h: y + pad - (rowH - fs) * 0.3, pad, rowH, sw, gap, cells };
  }
  function drawLegendBox(g, x, y, groups, fs, exam, lw) {
    const Lo = legendLayout(g, groups, fs);
    for (const gr of groups) ensureFont(`400 ${fs}px "Noto Sans KR"`, (gr.title || '') + gr.items.map(it => it.text).join(''));
    for (const gr of groups) if (gr.title) ensureFont(`500 ${fs}px "Noto Sans KR"`, gr.title);
    g.save();
    g.fillStyle = '#fff'; g.fillRect(x, y, Lo.w, Lo.h);
    g.lineWidth = lw; g.strokeStyle = '#1a1a1a'; g.strokeRect(x + lw / 2, y + lw / 2, Lo.w - lw, Lo.h - lw);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    for (const c of Lo.cells) {
      const sx = x + c.x, my = y + c.y;
      g.fillStyle = '#111';
      if (c.t === 'title') { g.font = `500 ${fs}px ${SANS_FONT}`; g.fillText(c.gr.title, sx, my); continue; }
      g.font = `400 ${fs}px ${SANS_FONT}`;
      if (c.gr.kind === 'fill') {
        const col = exam ? gray(c.it.key) : c.it.key, hh = fs * 0.85;
        g.fillStyle = g === ctx ? fillFor(g, col, dpr) : fillFor(g, col, 1, lw / 1.4); g.fillRect(sx, my - hh / 2, Lo.sw, hh);
        g.lineWidth = Math.max(1, lw * 0.8); g.strokeStyle = '#1a1a1a'; g.strokeRect(sx, my - hh / 2, Lo.sw, hh);
      } else {
        const [sh, kc] = c.it.key.split('|'), pcol = exam ? gray(kc || S.pstyle.color) : (kc || S.pstyle.color);
        drawSymbol(g, sh, sx + Lo.sw / 2, my, fs * 0.38, pcol, S.pstyle.outline || pcol.toUpperCase() === '#FFFFFF');
      }
      g.fillStyle = '#111'; g.fillText(c.it.text, sx + Lo.sw + Lo.gap, my);
    }
    g.restore();
    return Lo;
  }
  // 화면 범례 (보이는 지도 안에서 pos 비율 위치)
  let legendBox = null;
  function drawScreenLegend() {
    legendBox = null;
    if (!S.legend.show) return;
    const groups = legendModel(false); if (!groups.length) return;
    const fs = 13, Lo = legendLayout(ctx, groups, fs);
    const x0 = 10, x1 = W - (area.right || 0) - 64, y0 = area.top + 4, y1 = area.line - 64;   // 색칠하기 패널이 열려 있어도 지도 전체에서 옮길 수 있게
    const x = x0 + Math.max(0, x1 - x0 - Lo.w) * S.legend.pos[0], y = y0 + Math.max(0, y1 - y0 - Lo.h) * S.legend.pos[1];
    drawLegendBox(ctx, x, y, groups, fs, false, 1);
    legendBox = { x, y, w: Lo.w, h: Lo.h, x0, x1, y0, y1 };
  }
  const legendHit = (x, y) => legendBox && x >= legendBox.x && x <= legendBox.x + legendBox.w && y >= legendBox.y && y <= legendBox.y + legendBox.h;

  // 범례 패널
  function renderLegendPanel() {
    if (!(sideName === 'labels' && ltab === 'legend')) return;
    $('#lgShow').checked = S.legend.show;
    document.querySelectorAll('#lgDir [data-dir]').forEach(b => b.classList.toggle('sel', b.dataset.dir === (S.legend.dir || 'v')));
    for (const kind of ['fill', 'point']) {
      const L = S.legend[kind], box = $(`#lg-${kind}`), items = legendItems(kind);
      box.querySelector('.lg-title').value = L.title;
      box.querySelectorAll('[data-lfill]').forEach(b => b.classList.toggle('sel', b.dataset.lfill === L.mode));
      const list = box.querySelector('.plist');
      if (list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' || dragRow) continue;
      list.innerHTML = '';
      if (!items.length) { list.innerHTML = `<div class="empty">${kind === 'fill' ? '칠한 지역이 없어요.<br>색칠하면 쓴 색마다 한 줄씩 생겨요.' : '찍은 도형이 없어요.<br>도형을 찍으면 쓴 모양마다 한 줄씩 생겨요.'}</div>`; continue; }
      for (const it of items) {
        const row = document.createElement('div'); row.className = 'prow-item' + (it.on ? '' : ' off'); row.dataset.id = it.key;
        const sym = kind === 'fill' ? `<span class="rsw" style="background:${cssFill(it.key)}"></span>`
          : `<img class="sym" src="${symbolURL(it.key.split('|')[0], it.key.split('|')[1] || S.pstyle.color, S.pstyle.outline || (it.key.split('|')[1] || '') === '#FFFFFF')}" alt="">`;
        row.innerHTML = `<span class="grip" title="끌어서 순서 바꾸기">⋮⋮</span>${sym}`;
        const inp = document.createElement('input'); inp.value = it.text; inp.placeholder = kind === 'fill' ? '설명 (예: 10% 미만)' : '설명 (예: 수도)';
        inp.oninput = () => {
          if (SEQ.includes(L.mode)) { legendItems(kind).forEach(x => { L.text[x.key] = x.text; }); L.mode = null; box.querySelectorAll('[data-lfill]').forEach(b => b.classList.remove('sel')); }
          L.text[it.key] = inp.value; requestDraw(); saveSoon();
        };
        inp.onkeydown = e => { if (e.key === 'Enter') { const nx = row.nextElementSibling && row.nextElementSibling.querySelector('input'); nx ? nx.focus() : inp.blur(); } };
        const tg = document.createElement('label'); tg.className = 'sw small'; tg.title = '범례에 넣기/빼기';
        tg.innerHTML = `<input type="checkbox" ${it.on ? 'checked' : ''}><span></span>`;
        tg.querySelector('input').onchange = e => { L.off = e.target.checked ? L.off.filter(k => k !== it.key) : [...L.off, it.key]; row.classList.toggle('off', !e.target.checked); requestDraw(); saveSoon(); };
        row.append(inp, tg);
        row.querySelector('.grip').addEventListener('pointerdown', e => startRowDrag(e, row, list, order => { L.order = order; renderLegendPanel(); requestDraw(); saveSoon(); }));
        list.appendChild(row);
      }
    }
  }
  $('#lgShow').addEventListener('change', e => { S.legend.show = e.target.checked; requestDraw(); saveSoon(); });
  document.querySelectorAll('#lgDir [data-dir]').forEach(b => b.addEventListener('click', () => { S.legend.dir = b.dataset.dir; renderLegendPanel(); requestDraw(); saveSoon(); }));
  for (const kind of ['fill', 'point']) {
    const box = $(`#lg-${kind}`), L = () => S.legend[kind];
    box.querySelector('.lg-title').addEventListener('input', e => { L().title = e.target.value; requestDraw(); saveSoon(); });
    box.querySelectorAll('[data-lfill]').forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.lfill;
      if (m === 'clear') { L().mode = null; L().text = {}; } else L().mode = m;
      renderLegendPanel(); requestDraw(); saveSoon();
    }));
  }

  // ───────── 오른쪽 패널 ─────────
  const side = $('#side');
  const cityByName = new Map(WM_PLACES.CITIES.map(c => [c.name, c]));
  let sideName = null;
  function openSide(name) {
    if (name === sideName) name = null;
    sideName = name;
    if (name && !S.dockHidden) { S.dockHidden = true; document.body.classList.add('dock-hidden'); }   // 오른쪽 패널은 하나만
    side.hidden = !name;
    side.querySelectorAll('section').forEach(sec => sec.classList.toggle('on', sec.dataset.panel === name));
    document.querySelectorAll('.pill.tp, #legendBtn').forEach(b => b.classList.toggle('on', b.dataset.side === name));
    document.body.classList.toggle('side-open', !!name || !S.dockHidden);
    pointMode = name === 'points';
    document.body.classList.toggle('label-mode', name === 'labels');
    if (!pointMode) selPoint = null;
    document.body.classList.toggle('point-mode', pointMode);
    $('#colorBtn').classList.toggle('on', !S.dockHidden && !pointMode);
    $('#pointBanner').hidden = !pointMode;
    canvas.style.cursor = '';
    if (typeof openLayers === 'function') openLayers(false);
    if (name === 'lakes') renderLakes();
    if (name === 'seas') renderSeas();
    if (name === 'labels') setLtab(ltab);
    document.body.classList.remove('sheet-min');
    if (name === 'points') { setPtab('cities'); renderPstyle(); renderCities(); }
    hoverId = null; hideTip();
    resize(); requestDraw();
  }
  function setShapeDot(el) { if (el) el.style.background = `center / contain no-repeat url(${symbolURL(S.pstyle.shape, S.pstyle.color, S.pstyle.outline || S.pstyle.color.toUpperCase() === '#FFFFFF', true)})`; }
  function updateCounts() {
    $('#lakesCount').textContent = S.lakes.sel ? S.lakes.sel.length : '전체';
    document.querySelector('.kpick').classList.toggle('partial', !!S.lakes.sel);
    $('#pointsCount').textContent = S.points.length || '';
    $('#colorCount').textContent = S.colors.size || '';
    setShapeDot($('#pointDot'));
    $('#regionsCount').textContent = S.colors.size || '';
    $('#plistCount').textContent = S.points.length || '';
    $('#seasCount').textContent = !S.show.seas ? '' : (S.seas.sel.length || '');
  }
  // 라벨·범례 패널: [나라 라벨] [도형 라벨] [범례]
  let ltab = 'regions';
  function setLtab(t) {
    ltab = t;
    document.querySelectorAll('[data-ltab]').forEach(b => b.classList.toggle('sel', b.dataset.ltab === t));
    document.querySelectorAll('[data-lbody]').forEach(b => { b.hidden = b.dataset.lbody !== t; });
    if (t === 'regions') { renderRstyle(); renderRegions(); }
    else if (t === 'points') renderPoints();
    else renderLegendPanel();
  }
  function openLabels(t) {
    if (sideName !== 'labels') openSide('labels');
    if (ltab !== t) setLtab(t);
  }
  document.querySelectorAll('[data-ltab]').forEach(b => b.addEventListener('click', () => {
    if (document.body.classList.contains('sheet-min')) setSheetMin(false);
    setLtab(b.dataset.ltab);
  }));
  function setPtab(t) {
    if (t !== 'cities' && t !== 'style' || t === 'style' && !isPhone()) t = 'cities';     // '도형 모양' 탭은 폰에만 (PC는 위에 늘 보임)
    ptab = t;
    side.querySelector('[data-panel="points"]').classList.toggle('ptab-style', t === 'style');
    document.querySelectorAll('[data-ptab]').forEach(b => b.classList.toggle('sel', b.dataset.ptab === t));
    document.querySelectorAll('[data-pbody]').forEach(b => { b.hidden = b.dataset.pbody !== t; });
    if (t === 'cities') renderCities();
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
  // 보일 시도 고르기 (예전 앱의 '시도 선택')
  // 권역별로 묶어서 보여 줘요 (권역 이름을 누르면 그 권역만 한꺼번에 켜고 꺼요)
  const REGIONS = [
    ['수도권', ['서울특별시', '인천광역시', '경기도']],
    ['강원권', ['강원특별자치도']],
    ['충청권', ['대전광역시', '세종특별자치시', '충청북도', '충청남도']],
    ['호남권', ['광주광역시', '전북특별자치도', '전라남도', '전남광주통합특별시']],
    ['영남권', ['대구광역시', '경상북도', '부산광역시', '울산광역시', '경상남도']],
    ['제주권', ['제주특별자치도']],
  ];
  function renderLakes() {
    const list = $('#lakeList'); list.innerHTML = '';
    const all = sdF.map(x => x.properties.ko), setSel = names => { S.lakes.sel = names; lakesChanged(); };
    const groups = REGIONS.map(([g, ns]) => [g, ns.filter(n => all.includes(n))]);
    const rest = all.filter(n => !groups.some(([, ns]) => ns.includes(n)));
    if (rest.length) groups.push(['그 밖', rest]);
    for (const [g, names] of groups) {
      if (!names.length) continue;
      const on = names.filter(sdOn).length;
      const head = document.createElement('label'); head.className = 'chk rgroup';
      head.innerHTML = `<input type="checkbox"><span><b>${g}</b></span>`;
      const hc = head.querySelector('input'); hc.checked = on === names.length; hc.indeterminate = on > 0 && on < names.length;
      hc.onchange = () => {
        const cur = S.lakes.sel || all;
        setSel(hc.checked ? [...new Set([...cur, ...names])] : cur.filter(k => !names.includes(k)));
      };
      list.appendChild(head);
      for (const name of names) {
        const lab = document.createElement('label'); lab.className = 'chk rsub';
        lab.innerHTML = `<input type="checkbox"><span>${name}</span>`;
        const cb = lab.querySelector('input'); cb.checked = sdOn(name);
        cb.onchange = () => {
          const cur = S.lakes.sel || all;
          setSel(cb.checked ? [...cur, name] : cur.filter(k => k !== name));
        };
        list.appendChild(lab);
      }
    }
    const n = S.lakes.sel ? S.lakes.sel.length : sdF.length, sum = $('#lakesSummary');
    sum.className = 'note' + (n ? '' : ' muted');
    sum.textContent = !S.lakes.sel ? `✓ 시도 ${sdF.length}개 모두 표시 중` : n ? `✓ 시도 ${n}개만 표시 중 (북측·주변 나라는 숨겨요)` : '표시 중인 시도가 없어요';
  }
  function lakesChanged() {
    if (S.lakes.sel && S.lakes.sel.length === sdF.length) S.lakes.sel = null;
    clearTimeout(lakesChanged.t);
    lakesChanged.t = setTimeout(() => { if (S.lakes.sel && S.lakes.sel.length) showToast('고른 시도만 보여요 · 북측·주변 나라는 잠시 숨겨요 ([전체 선택]으로 되돌려요)', false, 3200); }, 500);
    renderLakes(); updateCounts(); requestDraw(); saveSoon();
    fitSelection();
  }
  // 고른 시도에 맞게 지도를 맞춰요
  function fitSelection() {
    const fs = S.lakes.sel ? sdF.filter(f => sdOn(f.properties.ko)) : null;
    if (!fs || !fs.length) return goHome();
    const b = d3.geoBounds({ type: 'FeatureCollection', features: fs });
    const [kw, kh, ux, uy] = boxUV(b);
    const L = area.left + 10, R = W - (area.right || 0) - (isPhone() ? 10 : 64);   // 왼쪽 팔레트·오른쪽 패널을 피해서
    const fitS = Math.min(Math.min((R - L) / kw, (area.bot - area.top - 20) / kh) * 0.92, sMinM * MAX_ZOOM);
    const fx = (L + R) / 2;
    const target = { lon: ux / RAD - (fx - W / 2) / fitS / RAD, s: fitS, cy: (area.top + area.bot) / 2 - fitS * uy };
    animateTo(target);
  }
  $('#lakesNone').addEventListener('click', () => { S.lakes.sel = []; lakesChanged(); });
  $('#lakesDefault').addEventListener('click', () => { S.lakes.sel = null; lakesChanged(); });

  // 바다 이름 고르기
  const SEAS_DEFAULT = ['동해', '황해', '남해'];
  function renderSeas() {
    for (const [id, f] of [['#seaList1', x => x.r === 2], ['#seaList2', x => x.r !== 2]]) {
      const list = $(id); list.innerHTML = '';
      for (const sea of SEAS.filter(f)) {
        const lab = document.createElement('label'); lab.className = 'chk';
        lab.innerHTML = `<input type="checkbox"><span>${sea.n}</span>`;
        const cb = lab.querySelector('input'); cb.checked = S.seas.sel.includes(sea.n);
        cb.onchange = () => { S.seas.sel = cb.checked ? [...S.seas.sel, sea.n] : S.seas.sel.filter(k => k !== sea.n); seasChanged(); };
        list.appendChild(lab);
      }
    }
    const sum = $('#seasSummary');
    sum.className = 'note' + (S.seas.sel.length ? '' : ' muted');
    sum.textContent = !S.show.seas ? '‘지도 설정’에서 바다 이름이 꺼져 있어요. 고르면 다시 켜져요.'
      : S.seas.sel.length ? `✓ 바다 이름 ${S.seas.sel.length}개 표시 중` : '표시 중인 바다 이름이 없어요';
  }
  function seasChanged() {
    if (!S.show.seas) { S.show.seas = true; syncLayers(); }
    renderSeas(); updateCounts(); requestDraw(); saveSoon();
  }
  $('#seasNone').addEventListener('click', () => { S.seas = { sel: [] }; seasChanged(); });
  $('#seasDefault').addEventListener('click', () => { S.seas = { sel: [...SEAS_DEFAULT] }; seasChanged(); });

  // 도시 고르기 (고른 도시는 '찍은 점'에 들어가요)
  const closedGroups = new Set(WM_PLACES.CONTINENTS);   // 처음엔 대륙을 접어 둠
  function renderCities() {
    if (sideName !== 'points') return;
    const q = $('#citySearch').value.trim();
    const box = $('#cityGroups'); box.innerHTML = '';
    const chosen = new Set(S.points.filter(p => p.city).map(p => p.city));
    let shown = 0;
    for (const cont of WM_PLACES.CONTINENTS) {
      const all = WM_PLACES.CITIES.filter(c => c.c === cont && (!c.era || c.era === S.era));   // 통합 전·후에 맞는 청사만
      const items = all.filter(c => !q || c.name.includes(q)).sort((a, b) => (WM_PLACES.KEEP_ORDER || []).includes(cont) ? 0 : a.name.localeCompare(b.name, 'ko'));   // 시청·도청은 권역 순서 그대로
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
          pointsAction(`${cont} 도시 ${add.length}개 추가`, () => { for (const c of add) S.points.push({ id: newId(), lon: c.lon, lat: c.lat, city: c.name, label: c.name, off: null, shape: S.pstyle.shape, color: S.pstyle.color }); relabel(); });
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
  const symCache = new Map();
  function symbolURL(sh, col, outline, icon) {   // 목록·버튼용 작은 그림
    const k = [sh, col, outline, icon].join('|');
    if (!symCache.has(k)) {
      const c = document.createElement('canvas'); c.width = c.height = 44; const g = c.getContext('2d'); g.scale(2, 2);
      drawSymbol(g, sh, 11, 11, icon ? 8 : 6.5, col, outline); symCache.set(k, c.toDataURL());
    }
    return symCache.get(k);
  }
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
    const ps = $('#pShapes'); ps.innerHTML = '';
    for (const [sh, ch] of SHAPES) {   // 앞으로 찍을 도형의 모양 (이미 찍은 도형은 그대로)
      const b = document.createElement('button'); b.className = sh === st.shape ? 'sel' : ''; b.title = '다음에 찍을 도형: ' + ch;
      b.innerHTML = `<img src="${symbolURL(sh, sh === st.shape ? '#ffffff' : '#1d2733', false, true)}" width="16" height="16" alt="${ch}">`;
      b.onclick = () => setStyle({ shape: sh });
      ps.appendChild(b);
    }
    $('#pSize').value = st.size; $('#pSizeOut').textContent = st.size;
        setShapeDot($('#styDot'));
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
    if (sideName === 'points') { renderPstyle(); return renderCities(); }
    $('#plistCount').textContent = S.points.length || '';
    if (!(sideName === 'labels' && ltab === 'points')) return;
    $('#pFont').value = S.pstyle.font; $('#pFontOut').textContent = S.pstyle.font;
    document.querySelectorAll('[data-fill]').forEach(b => b.classList.toggle('sel', b.dataset.fill === S.fill));
    const list = $('#pointList');
    if ((list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') || dragRow) return;   // 라벨을 고치거나 끄는 중이면 다시 그리지 않음
    list.innerHTML = '';
    if (!S.points.length) { list.innerHTML = '<div class="empty">아직 찍은 도형이 없어요.<br>[도형찍기]에서 도시를 고르거나 지도를 눌러 찍어요.</div>'; return; }
    const st = S.pstyle, key = st.shape + st.color + st.outline;
    if (key !== symKey) {
      const c = document.createElement('canvas'); c.width = c.height = 44; const g = c.getContext('2d'); g.scale(2, 2);
      drawSymbol(g, st.shape, 11, 11, 6, st.color, st.outline || st.color.toUpperCase() === '#FFFFFF'); symURL = c.toDataURL(); symKey = key;
    }
    for (const pt of S.points) {
      const row = document.createElement('div'); row.className = 'prow-item' + (pt.id === selPoint ? ' sel' : ''); row.dataset.id = pt.id;
      row.innerHTML = `<span class="grip" title="끌어서 순서 바꾸기">⋮⋮</span><button class="symb" title="눌러서 모양 바꾸기"><img class="sym" src="${symbolURL(pt.shape || 'circle', pt.color || st.color, st.outline || (pt.color || st.color).toUpperCase() === '#FFFFFF')}" alt=""></button>`;
      row.querySelector('.symb').onclick = e => {
        e.stopPropagation();
        const nx = SHAPE_IDS[(SHAPE_IDS.indexOf(pt.shape || 'circle') + 1) % SHAPE_IDS.length];
        pointsAction('도형 모양 바꿈', () => { const q = S.points.find(x => x.id === pt.id); if (q) q.shape = nx; });
      };
      const inp = document.createElement('input'); inp.value = pt.label; inp.placeholder = '라벨 입력';
      inp.onfocus = () => { selPoint = pt.id; requestDraw(); list.querySelectorAll('.prow-item').forEach(r => r.classList.toggle('sel', r === row)); };
      inp.oninput = () => {
        pointsAction(`라벨 수정`, () => { const p = S.points.find(q => q.id === pt.id); if (p) p.label = inp.value; S.fill = null; }, 'label:' + pt.id);
        document.querySelectorAll('[data-fill]').forEach(b => b.classList.remove('sel'));
      };
      inp.onkeydown = e => { if (e.key === 'Enter') { const nx = row.nextElementSibling && row.nextElementSibling.querySelector('input'); nx ? nx.focus() : inp.blur(); } };
      const meta = document.createElement('span'); meta.className = 'meta';
      meta.textContent = pt.city || fmtLL(pt.lon, pt.lat); meta.title = pt.city ? `${pt.city} (목록 도시)` : '직접 찍은 곳';
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
    if (!S.points.length) return showToast('먼저 도형을 찍거나 도시를 골라요');
    const names = { alpha: 'A B C', hangulp: '(가)(나)(다)', hangul: '가 나 다', city: '도시 이름', clear: '지우기' };
    pointsAction(`라벨 ${names[mode]}`, () => {
      if (SEQ.includes(mode)) { S.fill = mode; relabel(); }
      else if (mode === 'city') { S.fill = null; S.points.forEach(p => { if (p.city) p.label = p.city; }); }
      else { S.fill = null; S.points.forEach(p => { p.label = ''; }); }
    });
  }));
  $('#pointsClear').addEventListener('click', () => {
    const n = S.points.length; if (!n) return;
    pointsAction('도형 모두 삭제', () => { S.points = []; });
    selPoint = null; showToast(`도형 ${n}개를 지웠어요`, true);
  });

  function initPanels() {
    document.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openSide(b.dataset.side); }));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => openSide(null)));
    updateCounts();
  }

  // ───────── 이미지로 저장 ─────────
  const gray = c => {
    if (typeof c === 'string' && c.startsWith('hatch:')) return 'hatch:' + gray(c.slice(6));   // 색 빗금 → 회색 빗금
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(c || ''); if (!m) return c;
    const v = Math.round(0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16));
    const h = v.toString(16).padStart(2, '0'); return '#' + h + h + h;
  };
  // 저장 설정: PNG·인쇄용(3배) 고정
  const EX = { range: 'full', style: 'exam', k: 3, tick: true, rect: null, sea: 'white', scale: true, legend: true,
               lplace: 'in', lout: { side: 'right', t: 1 },   // 범례: 지도 안 / 지도 밖(틀 둘레 side, 그 변을 따라 t 0~1)
               spos: [1, 1], lpos: [0, 1], insetU: false, insetD: false };   // inset: 울릉도·독도 따로 상자 (위치 ipos)   // 축척·범례 위치 (틀 안에서 0~1 비율, 미리보기에서 끌어 정함)
  // 시험지용 글자 크기: B4 2단 편집에서 지도를 약 10cm 폭으로 넣었을 때 9pt(3.18mm) → 지도 폭의 3.18%
  const EXAM_FONT = 0.0318;
  function fullRect() { return { x: 0, y: 0, w: Math.round(W), h: Math.round(H) }; }
  // 1단계: 지도(A)와 글자·점(B)을 그림 (오래 걸려서 미리보기에서는 다시 쓰기)
  async function renderLayers(k) {
    const rect = EX.range === 'sel' && EX.rect ? EX.rect : fullRect();
    const exam = EX.style === 'exam';
    if (document.fonts) {
      const texts = [...S.points.map(p => p.label), ...S.regions.map(r => r.label), '0°km', ...SEAS.map(x => x.n),
        ...legendItems('fill').map(x => x.text), ...legendItems('point').map(x => x.text), S.legend.fill.title, S.legend.point.title].filter(Boolean).join('');
      try { await Promise.race([Promise.all([document.fonts.load(`700 20px "Noto Serif KR"`, texts || '가'), document.fonts.load(`600 20px "Noto Serif KR"`, texts || '가'), document.fonts.load(`500 20px "Noto Sans KR"`, texts || '가'), document.fonts.load(`400 20px "Noto Sans KR"`, texts || '가')]), new Promise(r => setTimeout(r, 1500))]); } catch (_) { }
    }
    if (isEE() && !(ee.ready && ee.lon === S.eeLon)) buildEESync();
    const keep = { ctx, dpr, hoverId, fade, area: { ...area }, colors: S.colors, land: S.land, ocean: S.ocean, show: { ...S.show }, pcolor: S.pstyle.color, pfont: S.pstyle.font, rfont: S.rfont, psize: S.pstyle.size };
    const examFont = Math.max(4, Math.round(rect.w * EXAM_FONT));
    const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); return c; };
    let A, B, eqY = null, mp = null;
    try {
      hoverId = null; fade = null;
      S.show.scale = false;                 // 축척은 아래에서 막대로 따로
      if (exam) {
        S.colors = new Map([...S.colors].map(([id, c]) => [id, gray(c)]));
        S.land = '#FFFFFF'; S.ocean = EX.sea === 'white' ? '#FFFFFF' : '#E3E3E3';
        S.show.equator = false; S.show.grid = false; S.show.names = false; S.pstyle.color = gray(S.pstyle.color);
        S.pstyle.font = examFont; S.rfont = examFont;
        S.pstyle.size = Math.max(2, Math.round(examFont * S.pstyle.size / 16 * 0.9));   // 점도 글자와 같은 비율로 키움
      } else {
        area = { ...area, top: rect.y, bot: rect.y + rect.h, left: rect.x, right: W - (rect.x + rect.w), line: rect.y + rect.h - 10 };
      }
      dpr = k;
      A = mk(); ctx = A.getContext('2d'); EXP = { exam, phase: 'map', rect, font: examFont, isl: byId.get(UL) ? [EX.insetU && '울릉도', EX.insetD && '독도'].filter(Boolean) : [] }; draw();
      B = mk(); ctx = B.getContext('2d'); EXP.phase = 'over'; draw();
      const e = proj([isEE() ? S.eeLon : isTM() ? 127.5 : lon0, 0]); if (e) eqY = e[1];
      mp = metersPerPx(rect.x + rect.w / 2, rect.y + rect.h / 2);
    } finally {
      ctx = keep.ctx; dpr = keep.dpr; hoverId = keep.hoverId; fade = keep.fade; area = keep.area;
      S.colors = keep.colors; S.land = keep.land; S.ocean = keep.ocean; S.show = keep.show; S.pstyle.color = keep.pcolor; S.pstyle.font = keep.pfont; S.rfont = keep.rfont; S.pstyle.size = keep.psize;
      EXP = null; requestDraw();
    }
    return { A, B, rect, exam, examFont, eqY, mp, k, view: { s, lon0, cy } };
  }
  function islandGeo(nm) {   // 울릉군을 울릉도 / 독도로 나눠요
    const f = byId.get(UL), polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    return { type: 'MultiPolygon', coordinates: polys.filter(p => (d3.geoCentroid({ type: 'Polygon', coordinates: p })[0] < 131.6) === (nm === '울릉도')) };
  }
  // 울릉도·독도 상자: 본 지도와 같은 축척, 같은 위도에 맞춰 틀 오른쪽 바깥에 따로따로 붙여요 (시험지처럼)
  function insetBoxes(Ly, fw, fh, fs, lw2) {
    if (!byId.get(UL) || !Ly.view) return [];
    const k = Ly.k, sc = Ly.view.s * k, pr = isTM() ? d3.geoTransverseMercator().rotate([-127.5, 0]).scale(sc).translate([-sc * Ly.view.lon0 * RAD, Ly.view.cy * k])
      : d3.geoMercator().rotate([-Ly.view.lon0, 0]).scale(sc).translate([0, Ly.view.cy * k]);
    const pad = Math.max(fs * 0.45, 6 * k), out = [];
    for (const name of [EX.insetU && '울릉도', EX.insetD && '독도'].filter(Boolean)) {
      const geo = islandGeo(name); if (!geo.coordinates.length) continue;
      const b = d3.geoPath(pr).bounds(geo);
      const w = Math.max(b[1][0] - b[0][0], 2 * k) + 2 * pad, h = Math.max(b[1][1] - b[0][1], 2 * k) + 2 * pad;
      out.push({ name, geo, pr, b, w, h, y: (b[0][1] - Ly.rect.y * k) - pad, pad });   // 본 지도와 같은 위도
    }
    if (!out.length) return out;
    // 시험지 비율: 울릉도 상자는 섬보다 넉넉히(가로:세로 ≈ 6:5), 독도 상자는 울릉도 상자의 가로 약 1/2, 세로 약 3/5
    const ub = d3.geoPath(pr).bounds(islandGeo('울릉도')), uw = Math.max(ub[1][0] - ub[0][0], ub[1][1] - ub[0][1]) * 3.6 + 2 * lw2;
    const size = { 울릉도: [uw, uw * 0.84], 독도: [uw * 0.48, uw * 0.48] };
    for (const o of out) [o.w, o.h] = size[o.name];
    const H = out.reduce((t, o) => t + o.h, 0) - lw2 * (out.length - 1);
    let y = Math.min(Math.max(out[0].y + out[0].pad - (out[0].h - (out[0].b[1][1] - out[0].b[0][1])) / 2, 0), fh - H);
    for (const o of out) { o.y = y; o.x = fw - o.w; y += o.h - lw2; }   // 틀 오른쪽 안쪽에 붙이고 위아래로 딱 붙여요
    return out;
  }
  function drawInsets(g, boxes, x0, oy, lw2, exam) {
    const c = S.colors.get(UL) || S.colors.get('sd:경상북도') || S.colors.get('sk');
    for (const o of boxes) {
      const x = x0 + o.x, y = oy + o.y;   // 틀 오른쪽 안쪽 (틀 선을 함께 씀)
      g.save();
      g.beginPath(); g.rect(x, y, o.w, o.h); g.fillStyle = exam ? (EX.sea === 'white' ? '#FFFFFF' : '#E3E3E3') : S.ocean; g.fill(); g.clip();
      g.translate(x + (o.w - (o.b[1][0] - o.b[0][0])) / 2 - o.b[0][0], y + (o.h - (o.b[1][1] - o.b[0][1])) / 2 - o.b[0][1]);   // 섬을 상자 가운데에
      g.beginPath(); d3.geoPath(o.pr, g)(o.geo);
      g.fillStyle = fillFor(g, c ? (exam ? gray(c) : c) : (exam ? '#FFFFFF' : S.land), 1, lw2 / 1.4); g.fill();
      g.lineWidth = Math.max(1, lw2 * 0.6); g.strokeStyle = '#1a1a1a'; g.lineJoin = 'round'; g.stroke();
      g.restore();
      g.lineWidth = lw2; g.strokeStyle = '#000'; g.strokeRect(x + lw2 / 2, y + lw2 / 2, o.w - lw2, o.h - lw2);
    }
  }
  // 2단계: 사각형에 맞춰 잘라 붙이고, 틀·0°·축척·범례를 그림 (빨라서 끌 때마다 다시 해도 돼요)
  function compose(Ly) {
    const { A, B, rect, exam, examFont, eqY, mp, k } = Ly;
    const out = document.createElement('canvas');
    out.width = Math.round(rect.w * k); out.height = Math.round(rect.h * k);
    const g = out.getContext('2d'), fw = out.width, fh = out.height;
    g.fillStyle = '#fff'; g.fillRect(0, 0, fw, fh);
    g.drawImage(A, -rect.x * k, -rect.y * k);
    g.drawImage(B, -rect.x * k, -rect.y * k);
    const fs = (exam ? examFont : 13) * k, lw2 = (exam ? Math.max(1.4, rect.w / 450) : 1.2) * k, pad = fs * 0.6;
    Ly.boxes = {};
    // 틀 안에서 비율 위치 → 실제 위치
    const place = (pos, w, h) => [lw2 + pad + (fw - 2 * (lw2 + pad) - w) * pos[0], lw2 + pad + (fh - 2 * (lw2 + pad) - h) * pos[1]];
    if (exam && EX.tick && eqY != null && eqY > rect.y + examFont && eqY < rect.y + rect.h - examFont) {   // 적도 0° (틀 안쪽 왼쪽)
      const y = (eqY - rect.y) * k, tl = fs * 0.55;
      g.strokeStyle = '#000'; g.beginPath(); g.moveTo(0, y); g.lineTo(tl, y); g.lineWidth = lw2; g.stroke();
      g.font = `600 ${fs}px ${LABEL_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = fs * 0.28; g.strokeStyle = '#fff'; g.strokeText('0°', tl + fs * 0.2, y);
      g.fillStyle = '#000'; g.fillText('0°', tl + fs * 0.2, y);
    }
    if (EX.scale && mp) {   // 축척 막대: 지도 폭의 약 1/5
      const km = niceKm(mp.mpp * rect.w * 0.22 / 1000), len = km * 1000 / mp.mpp * k;
      const z = scaleBarSize(g, len, fs * 0.95, km);
      const [x, y] = place(EX.spos, z.w, z.h);
      drawScaleBar(g, x, y, len, fs * 0.95, km, Math.max(k, lw2 * 0.8));
      Ly.boxes.scale = [x, y, z.w, z.h];
    }
    const groups = legendModel(exam);
    const hasL = EX.legend && S.legend.show && groups.length, outside = hasL && EX.lplace === 'out';
    Ly.map = { ox: 0, oy: 0, fw, fh };
    if (hasL && !outside) {
      const Lo = legendLayout(g, groups, fs);
      const x = (fw - Lo.w) * EX.lpos[0], y = (fh - Lo.h) * EX.lpos[1];   // 범례는 틀에 딱 붙일 수 있어요
      drawLegendBox(g, x, y, groups, fs, exam, Math.max(k, lw2 * 0.7));
      Ly.boxes.legend = [x, y, Lo.w, Lo.h];
    }
    if (exam) { g.lineWidth = lw2; g.strokeStyle = '#000'; g.strokeRect(lw2 / 2, lw2 / 2, fw - lw2, fh - lw2); }   // 틀 (안쪽에)
    drawInsets(g, insetBoxes(Ly, fw, fh, fs, lw2), 0, 0, lw2, exam);
    const insW = 0;
    if (!outside) return out;
    // 지도 밖 범례: 틀 바깥 한 변(side)에 붙이고, 그 변을 따라 t 위치. 그림 크기를 범례만큼 넓혀요
    const Lo = legendLayout(g, groups, fs), gap = fs * 0.6, { side, t } = EX.lout, vert = side === 'left' || side === 'right';
    const along = vert ? Math.max(0, fh - Lo.h) * t : Math.max(0, fw - Lo.w) * t;
    const W2 = Math.ceil(vert ? fw + insW + gap + Lo.w : Math.max(fw + insW, Lo.w)), H2 = Math.ceil(vert ? Math.max(fh, Lo.h) : fh + gap + Lo.h);
    const ox = side === 'left' ? Lo.w + gap : 0, oy = side === 'top' ? Lo.h + gap : 0;
    const lx = side === 'left' ? 0 : side === 'right' ? fw + insW + gap : along, ly = side === 'top' ? 0 : side === 'bottom' ? fh + gap : along;
    const fin = document.createElement('canvas'); fin.width = W2; fin.height = H2;
    const f = fin.getContext('2d'); f.fillStyle = '#fff'; f.fillRect(0, 0, W2, H2);
    f.drawImage(out, ox, oy);
    drawLegendBox(f, lx, ly, groups, fs, exam, Math.max(k, lw2 * 0.7));
    if (Ly.boxes.scale) { Ly.boxes.scale[0] += ox; Ly.boxes.scale[1] += oy; }
    Ly.boxes.legend = [lx, ly, Lo.w, Lo.h];
    Ly.map = { ox, oy, fw, fh };
    return fin;
  }
  async function renderExport(k) { return compose(await renderLayers(k)); }

  const exportDlg = $('#exportDlg');
  let previewTimer = 0, preview = null;
  function showPreview() {
    if (!preview) return;
    const c = compose(preview);
    $('#exPreview').src = c.toDataURL('image/png');
    preview.outW = c.width;
    $('#exSize').textContent = `${Math.round(c.width / preview.k * EX.k)} × ${Math.round(c.height / preview.k * EX.k)} 픽셀 · PNG 인쇄용`;   // 지도 밖 범례까지 포함한 크기
  }
  function syncExportUI(relayer = true) {
    document.querySelectorAll('#exportDlg [data-ex]').forEach(b => b.classList.toggle('sel', String(EX[b.dataset.ex]) === b.dataset.v));
    $('#exSelAgain').hidden = EX.range !== 'sel';
    const exam = EX.style === 'exam';
    $('#exTickRow').hidden = true; $('#exSeaRow').hidden = !exam;
    $('#exTick').checked = EX.tick; $('#exScale').checked = EX.scale; $('#exLegend').checked = EX.legend; $('#exInsetU').checked = EX.insetU; $('#exInsetD').checked = EX.insetD;
    const hasLegend = S.legend.show && legendModel(exam).length > 0;
    $('#exLegendWrap').hidden = !hasLegend; $('#exLplace').hidden = false;   // 범례를 끄면 흐리게만 (자리 그대로)
    $('#exStyleHint').textContent = exam ? '시험지용: 흑백·사각형 틀, 경위선·지역 이름 없음. B4 용지 2단 편집에서 지도를 약 10cm 폭으로 넣었을 때 글자가 9pt가 되도록 자동 조정해요.' : '지금 화면에 보이는 색·라벨·경위선 숫자 그대로';
    const r = EX.range === 'sel' && EX.rect ? EX.rect : fullRect();
    $('#exSize').textContent = `${Math.round(r.w * EX.k)} × ${Math.round(r.h * EX.k)} 픽셀 · PNG 인쇄용`;
    if (!relayer && preview) return showPreview();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      preview = await renderLayers(Math.min(1.5, 900 / Math.max(r.w, r.h)) || 1);
      showPreview();
    }, 60);
  }
  // ───────── 처음 쓰는 사람 안내 (한 번 보고 나면 다시 안 나와요) ─────────
  const GUIDE_KEY = STORE_KEY + '.guide';
  const guideSeen = k => { try { return (JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}'))[k]; } catch (_) { return false; } };
  function guideDone(k) {
    try { const g = JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}'); g[k] = 1; localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); } catch (_) { /* 저장 못 해도 괜찮아요 */ }
    if (k === 'drag') { const h = $('#exDragHint'); if (h) h.hidden = true; }
    if (k === 'welcome') { const w = $('#welcome'); if (w) w.hidden = true; }
  }
  if (!guideSeen('drag')) { const h = $('#exDragHint'); if (h) h.hidden = false; }
  // 미리보기에서 축척·범례를 끌어 위치 정하기
  {
    const img = $('#exPreview');
    let drag = null;
    const toOut = e => { const b = img.getBoundingClientRect(), sc = (preview && preview.outW || img.naturalWidth) / b.width; return [(e.clientX - b.left) * sc, (e.clientY - b.top) * sc]; };
    img.addEventListener('pointerdown', e => {
      if (!preview || !preview.boxes) return;
      const [x, y] = toOut(e);
      for (const key of ['legend', 'scale']) {
        const bx = preview.boxes[key];
        if (bx && x >= bx[0] - 6 && x <= bx[0] + bx[2] + 6 && y >= bx[1] - 6 && y <= bx[1] + bx[3] + 6) {
          drag = { key, start: [x, y], box: [...bx], map: { ...preview.map } }; img.setPointerCapture(e.pointerId); e.preventDefault(); img.classList.add('dragging'); guideDone('drag'); return;
        }
      }
    });
    img.addEventListener('pointermove', e => {
      if (!preview || !preview.boxes) return;
      const [x, y] = toOut(e);
      if (!drag) { const hit = ['legend', 'scale'].some(k2 => { const bx = preview.boxes[k2]; return bx && x >= bx[0] && x <= bx[0] + bx[2] && y >= bx[1] && y <= bx[1] + bx[3]; }); img.style.cursor = hit ? 'grab' : ''; return; }
      if (drag.rebase) { drag.rebase = false; drag.start = [x, y]; drag.box = [...preview.boxes[drag.key]]; drag.map = { ...preview.map }; }
      const { key, start, box, map: M } = drag, fw = M.fw, fh = M.fh;
      const fs = (preview.exam ? preview.examFont : 13) * preview.k, lw2 = (preview.exam ? Math.max(1.4, preview.rect.w / 450) : 1.2) * preview.k, m = key === 'legend' || key === 'inset' ? 0 : lw2 + fs * 0.6;
      const nx = box[0] + x - start[0] - M.ox, ny = box[1] + y - start[1] - M.oy;   // 지도 틀 기준 위치
      if (key === 'legend' && EX.lplace === 'out') {   // 지도 밖: 가장 많이 벗어난 쪽 변에 붙어요 (지도 안으로는 못 들어와요)
        const cx = nx + box[2] / 2, cy = ny + box[3] / 2;
        const over = { right: cx - fw, left: -cx, bottom: cy - fh, top: -cy };
        const side = Object.keys(over).reduce((a, b2) => over[b2] > over[a] ? b2 : a);
        const t = side === 'left' || side === 'right' ? Math.max(0, Math.min(1, ny / Math.max(1, fh - box[3]))) : Math.max(0, Math.min(1, nx / Math.max(1, fw - box[2])));
        if (side !== EX.lout.side) drag.rebase = true;
        EX.lout = { side, t };
        if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) drag.raf = 0; showPreview(); });
        return;
      }
      const pos = [Math.max(0, Math.min(1, (nx - m) / Math.max(1, fw - 2 * m - box[2]))), Math.max(0, Math.min(1, (ny - m) / Math.max(1, fh - 2 * m - box[3])))];
      if (key === 'legend') EX.lpos = pos; else if (key === 'inset') EX.ipos = pos; else EX.spos = pos;
      if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) drag.raf = 0; showPreview(); });
    });
    const end = () => { if (drag) { drag = null; img.classList.remove('dragging'); showPreview(); } };
    img.addEventListener('pointerup', end); img.addEventListener('pointercancel', end);
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
    syncExportUI(key !== 'spos' && key !== 'lplace');
  }));
  $('#exTick').addEventListener('change', e => { EX.tick = e.target.checked; syncExportUI(false); });
  $('#exScale').addEventListener('change', e => { EX.scale = e.target.checked; syncExportUI(false); });
  $('#exLegend').addEventListener('change', e => { EX.legend = e.target.checked; syncExportUI(false); });
  $('#exInsetU').addEventListener('change', e => { EX.insetU = e.target.checked; syncExportUI(true); });   // 본 지도에서 섬을 덮어야 해서 다시 그려요
  $('#exInsetD').addEventListener('change', e => { EX.insetD = e.target.checked; syncExportUI(true); });   // 본 지도에서 울릉도를 빼야 해서 다시 그려요
  $('#exSelAgain').addEventListener('click', startSelect);
  const fileName = () => {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return `koreamap-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.${EX.fmt === 'jpg' ? 'jpg' : 'png'}`;
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
        lakes: S.lakes, seas: S.seas, unit: S.unit, bg: S.bg, rivers: S.rivers, rivW: S.rivW, rivNames: S.rivNames, kproj: S.kproj, lineLight: S.lineLight, era: S.era, lineSd: S.lineSd, lineSg: S.lineSg, points: S.points.map(({ _lab, ...p }) => p), pstyle: S.pstyle, fill: S.fill,
        regions: S.regions.map(({ _lab, ...r }) => r), rfill: S.rfill, legend: S.legend, rfont: S.rfont, borderDash: S.borderDash,
      }));
    } catch (_) { /* 저장 공간을 쓸 수 없는 환경이면 조용히 넘어감 */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!d) return;
      S.colors = new Map(d.colors || []);
      Object.assign(S, { current: d.current || S.current, palette: d.palette || 0, land: d.land || S.land, ocean: d.ocean || S.ocean, line: d.line || S.line, view: d.view || null, proj: 'merc', eeLon: isFinite(d.eeLon) ? d.eeLon : EE_CENTER });
      Object.assign(S.show, d.show || {});
      S.dockHidden = !!d.dockHidden;
      if (d.seas && Array.isArray(d.seas.sel)) S.seas = { sel: d.seas.sel.filter(n => SEAS.some(x => x.n === n)) };
      if (d.lakes) S.lakes = { sel: Array.isArray(d.lakes.sel) ? d.lakes.sel : null, all: false };   // 보일 시도
      if (['none', 'sk', 'sd', 'sg'].includes(d.unit)) S.unit = d.unit;
      if (d.era === 'before') S.era = 'before';
      if (isFinite(d.lineSd)) S.lineSd = d.lineSd; if (isFinite(d.lineSg)) S.lineSg = d.lineSg;
      if (d.bg && (d.bg === 'off' || BG[d.bg])) S.bg = d.bg;
      if (d.kproj === 'tm' || d.kproj === 'merc') S.kproj = d.kproj;
      if (['off', 'major', 'all'].includes(d.rivers)) S.rivers = d.rivers;
      if (isFinite(d.rivW)) S.rivW = Math.max(0.3, Math.min(4, +d.rivW));
      if (typeof d.rivNames === 'boolean') S.rivNames = d.rivNames;
      if (typeof d.lineLight === 'boolean') S.lineLight = d.lineLight;
      if (S.kproj === 'tm') S.bg = 'off';
      if (Array.isArray(d.points)) S.points = d.points.filter(p => isFinite(p.lon) && isFinite(p.lat))
        .map(p => ({ id: p.id, lon: p.lon, lat: p.lat, city: p.city || null, label: p.label || '', off: Array.isArray(p.off) ? p.off : null, guide: p.guide !== false, shape: SHAPE_IDS.includes(p.shape) ? p.shape : 'circle', color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : (d.pstyle && d.pstyle.color) || '#1A1A1A' }));
      // 시안 5까지 따로 고르던 도시는 점으로 옮김
      if (Array.isArray(d.cities)) for (const n of d.cities) { const c = WM_PLACES.CITIES.find(x => x.name === n); if (c && !S.points.some(p => p.city === n)) S.points.push({ id: 'c' + n, lon: c.lon, lat: c.lat, city: n, label: n, off: null }); }
      if (d.pstyle) for (const k of ['color', 'size', 'outline', 'font']) if (k in d.pstyle) S.pstyle[k] = d.pstyle[k];
      if (!SHAPE_IDS.includes(S.pstyle.shape)) S.pstyle.shape = 'circle';
      S.fill = d.fill === 'hangul' && S.points[0] && /^\(/.test(S.points[0].label) ? 'hangulp' : (['alpha', 'hangulp', 'hangul'].includes(d.fill) ? d.fill : null);
      if (Array.isArray(d.regions)) S.regions = d.regions.filter(r => r && typeof r.id === 'string').map(r => ({ id: r.id, label: r.label || '', off: Array.isArray(r.off) ? r.off : null, guide: r.guide !== false }));
      S.rfill = ['alpha', 'hangulp', 'hangul'].includes(d.rfill) ? d.rfill : null;
      if (isFinite(d.rfont)) S.rfont = d.rfont;
      if (d.legend && d.legend.fill && d.legend.point) {
        const lg = d.legend, okL = L => ({ mode: SEQ.includes(L.mode) ? L.mode : null, title: L.title || '', text: L.text || {}, off: L.off || [], order: L.order || [] });
        S.legend = { show: !!lg.show, pos: Array.isArray(lg.pos) ? lg.pos : [0, 1], dir: lg.dir === 'h' ? 'h' : 'v', fill: okL(lg.fill), point: okL(lg.point) };
      }
      if (typeof d.borderDash === 'boolean') S.borderDash = d.borderDash;
    } catch (_) { }
  }

  // ───────── 시작 ─────────
  const DEFAULTS = JSON.parse(JSON.stringify({ ...S, colors: [] }));
  load();
  renderTabs(); renderSwatches(); renderMiniSwatches(); syncLayers(); syncProjUI(); syncUnit(); syncBg(); syncEra(); syncLines(); syncKProj(); syncRivers();
  initPanels();
  document.body.classList.toggle('dock-hidden', !!S.dockHidden);
  document.body.classList.toggle('side-open', !S.dockHidden);
  lineInput.value = S.line; lineOut.textContent = S.line.toFixed(1);
  window.addEventListener('resize', () => { resize(); requestDraw(); });
  resize();
  loadData().then(() => {
    $('#loading').remove();
    afterChange();
    if (S.lakes.sel) setTimeout(fitSelection, 50);
    if (S.colors.size) showToast(`지난번 작업을 불러왔어요 (${S.colors.size}개 지역)`);
    else if (isPhone()) showToast('PC에서 사용을 권합니다', false, 3000);
  }).catch(() => { $('#loading').textContent = '지도를 불러오지 못했어요. 새로고침해 주세요.'; });

  // 테스트용
  window.__map = { byId, rlabelPos: id => { const o = rlabelBoxes.find(x => x.r.id === id); return o && [(o.box[0] + o.box[2]) / 2, (o.box[1] + o.box[3]) / 2]; }, S, hitTest, paint: id => paint(byId.get(id)), proj: () => proj, view: currentView, setProjection, openSide };
})();
