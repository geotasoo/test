/* 한반도 지역 찾기 v1.0 — 시도·시군 경계 지도 기반 독립 게임 */
(() => {
  'use strict';
  const D = window.WG_DATA;
  const $ = s => document.querySelector(s);
  const RAD = Math.PI / 180, TAU = 2 * Math.PI;
  const HOME_LON = 127.8, LAT_TOP = 44, LAT_BOT = 30, MAX_ZOOM = 40, MIN_ZOOM = 0.5;
  const GAME_SEC = 60, MAX_WRONG = 3, PASSES = 3;
  const CONTS = ['아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  const COL = { target: '#FFD84D', land: '#FFFFFF', ocean: '#D6F1FF', ok: '#86d3a2', ng: '#f19a93', ps: '#f8c983', flash: '#e8615a', hover: '#f3f6f9' };
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * RAD / 2));
  const MERC_SPAN = merc(LAT_TOP) - merc(LAT_BOT);
  const STORE = 'koreagame.v1';

  // ───────── 지도 ─────────
  const canvas = $('#map'), ctx = canvas.getContext('2d'), stage = $('#stage');
  let W = 0, H = 0, dpr = 1, s = 1, sMin = 1, lon0 = HOME_LON, cy = 0;
  const projM = d3.geoMercator().precision(0);
  let proj = projM;
  let sdBorderShape = null, countries = [], byId = new Map(), tiny = [], borderShape = null, coastShape = null, gridShape = null, eqShape = null;

  function applyProj() { proj = projM.rotate([-lon0, 0]).scale(s).translate([W / 2, cy]); }
  const clampScale = v => Math.max(sMin * MIN_ZOOM, Math.min(sMin * MAX_ZOOM, v));
  function clampView() {
    s = clampScale(s);
    const hi = s * merc(LAT_TOP), lo = H + s * merc(-85);
    cy = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, cy));
    lon0 = ((lon0 % 360) + 540) % 360 - 180;
    applyProj();
  }
  function zoomAt(px, py, f) {
    const ns = clampScale(s * f), lonP = lon0 + (px - W / 2) / s / RAD, m = (cy - py) / s;
    s = ns; lon0 = lonP - (px - W / 2) / s / RAD; cy = py + m * s;
    clampView(); requestDraw();
  }
  function panBy(dx, dy) { lon0 -= dx / s / RAD; cy += dy; clampView(); requestDraw(); }
  function animateTo(t, dur = 450) {
    const f = { lon: lon0, s, cy }, t0 = performance.now(), dl = ((t.lon - f.lon + 540) % 360) - 180;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      s = f.s * Math.pow(t.s / f.s, e); lon0 = f.lon + dl * e; cy = f.cy + (t.cy - f.cy) * e;
      clampView(); requestDraw();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // (lon, lat)이 화면의 (fx, fy)에 오도록 (기본: 가운데)
  function viewTarget(lon, lat, z, fx = W / 2, fy = H / 2) { const ts = clampScale(sMin * z); return { lon: lon - (fx - W / 2) / ts / RAD, s: ts, cy: fy + ts * merc(lat) }; }
  function goHome(animate = true) {
    const t = viewTarget(HOME_LON, 36.5, 1.8);
    if (animate) return animateTo(t);
    lon0 = t.lon; s = t.s; cy = t.cy; clampView(); requestDraw();
  }
  // 결과에서 지역 고르기: 확대하지 않고, 결과 창에 가려졌거나 화면 밖이면 보이는 곳으로 옮긴 뒤 깜빡이기
  let pulse = null;
  function showCountry(f) {
    const p = proj(f.label), r = $('#result').getBoundingClientRect(), st = stage.getBoundingClientRect();
    const box = { l: r.left - st.left - 10, r: r.right - st.left + 10, t: r.top - st.top - 10, b: r.bottom - st.top + 10 };
    const hidden = !p || p[0] < 30 || p[0] > W - 30 || p[1] < 20 || p[1] > H - 20 || (p[0] > box.l && p[0] < box.r && p[1] > box.t && p[1] < box.b);
    if (hidden) {
      const phone = r.width > W * 0.8, fy = phone ? box.t / 2 : (box.b + H) / 2;
      animateTo(viewTarget(f.label[0], f.label[1], s / sMin, W / 2, fy), 500);
    }
    pulse = { id: f.id, t0: performance.now() };
    const tick = () => { if (!pulse || pulse.id !== f.id) return; requestDraw(); if (performance.now() - pulse.t0 < 2400) requestAnimationFrame(tick); else { pulse = null; requestDraw(); } };
    requestAnimationFrame(tick);
  }
  function resize() {
    const r = stage.getBoundingClientRect(), first = !W;
    const keep = W ? { lon: lon0, lat: Math.atan(Math.sinh((cy - H / 2) / s)) / RAD, z: s / sMin } : null;
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    sMin = Math.min(W / 0.12, H / MERC_SPAN);   // 한반도가 화면에 다 들어오도록
    if (first || !keep) goHome(false);
    else { const t = viewTarget(keep.lon, keep.lat, keep.z); lon0 = t.lon; s = t.s; cy = t.cy; clampView(); requestDraw(); }
  }

  // 0°를 가운데로 둔 기준 메르카토르 좌표에 지도 두 바퀴를 담아요 (좌우로 끝없이 돌리기)
  function makeShape(geo) {
    const p2 = new Path2D();
    for (const dx of [0, TAU]) {
      d3.geoPath(d3.geoTransform({ point(lon, lat) { this.stream.point(lon * RAD + dx, -merc(lat)); } }), p2)(geo);
    }
    return p2;
  }
  function dropAntimeridian(mesh) {   // 180°에서 자른 가짜 해안선 지우기
    const on180 = p => Math.abs(Math.abs(p[0]) - 180) < 1e-6, lines = [];
    for (const line of mesh.coordinates) {
      let cur = [line[0]];
      for (let i = 1; i < line.length; i++) {
        if (on180(line[i - 1]) && on180(line[i])) { if (cur.length > 1) lines.push(cur); cur = [line[i]]; } else cur.push(line[i]);
      }
      if (cur.length > 1) lines.push(cur);
    }
    return { type: 'MultiLineString', coordinates: lines };
  }
  // 시도 · 시군 두 단계를 따로 준비해 두고, 고른 단계의 경계만 그려요
  const SETS = {};
  let curSet = 'si';
  function useSet(lv) {
    curSet = lv; const S_ = SETS[lv];
    countries = S_.list; borderShape = S_.border; coastShape = S_.coast; tiny = [];
  }
  async function loadData() {
    const topo = await fetch('data/korea.json').then(r => r.json());
    for (const lv of ['do', 'si']) {
      const list = topojson.feature(topo, topo.objects[lv]).features;
      for (const f of list) {
        f.bb = d3.geoBounds(f); f.wrap = false;
        f.area = d3.geoArea(f); f.label = [f.properties.lx, f.properties.ly];
        f.shape = makeShape(f); byId.set(f.id, f);
      }
      SETS[lv] = {
        list,
        border: makeShape(topojson.mesh(topo, topo.objects[lv], (a, b) => a !== b)),
        coast: makeShape(topojson.mesh(topo, topo.objects[lv], (a, b) => a === b)),
      };
    }
    sdBorderShape = makeShape(topojson.mesh(topo, topo.objects.do, (a, b) => a !== b));   // 시도 경계 (굵게)
    gridShape = makeShape(d3.geoGraticule().step([2, 2]).extentMajor([[118, 28], [138, 46]]).stepMajor([2, 2])());
    eqShape = makeShape({ type: 'LineString', coordinates: [[0, 0], [1, 0]] });   // 적도는 한반도 밖이라 그리지 않아요
    useSet('si');
  }

  // ───────── 그리기 ─────────
  let drawQueued = false, hoverId = null;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(draw); } }
  function fillOf(f) {
    if (G.flash && G.flash.id === f.id) return COL.flash;
    if (G.mode === 'guess' && G.active && f.id === G.queue[G.idx] && !G.state.has(f.id)) return COL.target;
    const st = G.state.get(f.id);
    if (st) return COL[st];
    return f.id === hoverId && G.active && G.mode === 'find' ? COL.hover : COL.land;
  }
  function draw() {
    drawQueued = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.ocean; ctx.fillRect(0, 0, W, H);
    if (!countries.length) return;
    const px = 1 / s, l0 = lon0 * RAD, xLeft = l0 - (W / 2) / s;
    const n = Math.floor((xLeft + Math.PI) / TAU), tx = W / 2 - s * (l0 - n * TAU);
    const reps = Math.max(1, Math.ceil((W / s + TAU) / (2 * TAU)));   // 많이 축소하면 옆으로 이어 붙여요
    for (let r = 0; r < reps; r++) {
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (tx + r * 2 * TAU * s), dpr * cy);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const f of countries) { ctx.fillStyle = fillOf(f); ctx.fill(f.shape); }
      ctx.lineWidth = 0.6 * px; ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.stroke(gridShape);
      ctx.lineWidth = 1.1 * px; ctx.strokeStyle = 'rgba(214,40,40,.55)'; ctx.stroke(eqShape);
      ctx.lineWidth = 0.8 * px; ctx.strokeStyle = '#555'; ctx.stroke(borderShape);
      ctx.lineWidth = 2.4 * px; ctx.strokeStyle = '#333'; ctx.stroke(sdBorderShape);   // 시도 경계는 굵게
      ctx.lineWidth = 1 * px; ctx.strokeStyle = '#1a1a1a'; ctx.stroke(coastShape);
      const out = G.reveal && byId.get(G.reveal);
      if (out) { ctx.lineWidth = 3 * px; ctx.strokeStyle = COL.flash; ctx.stroke(out.shape); }
      const tg = G.mode === 'guess' && G.active && byId.get(G.queue[G.idx]);
      if (tg) { ctx.lineWidth = 2.5 * px; ctx.strokeStyle = '#1d2733'; ctx.stroke(tg.shape); }
      if (hoverId && G.active && G.mode === 'find' && byId.has(hoverId)) { ctx.lineWidth = 2 * px; ctx.strokeStyle = '#1d2733'; ctx.stroke(byId.get(hoverId).shape); }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTiny(); drawGridLabels(); drawResultLabels(); drawPulse(); drawTargetRing();
  }
  const onScreen = p => p && p[0] > -40 && p[0] < W + 40 && p[1] > -20 && p[1] < H + 20;
  function drawTiny() {
    for (const f of tiny) {
      const p = proj(f.label); if (!onScreen(p)) continue;
      const st = G.state.get(f.id), fl = G.flash && G.flash.id === f.id;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, TAU);
      const tg = G.mode === 'guess' && G.active && f.id === G.queue[G.idx] && !st;
      ctx.fillStyle = fl ? COL.flash : st ? COL[st] : tg ? COL.target : 'rgba(255,255,255,.85)'; ctx.fill();
      ctx.lineWidth = f.id === hoverId && G.active ? 2 : 1; ctx.strokeStyle = '#333'; ctx.stroke();
    }
  }
  function drawGridLabels() {
    ctx.font = '600 11px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; ctx.fillStyle = 'rgba(29,39,51,.55)';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (let lat = -60; lat <= 60; lat += 30) {
      const p = proj([lon0, lat]); if (!p || p[1] < 12 || p[1] > H - 20) continue;
      ctx.fillText(lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`, 6, p[1] - 7);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = 30, first = Math.ceil((lon0 - (W / 2) / s / RAD) / step) * step;
    for (let lon = first; lon <= lon0 + (W / 2) / s / RAD; lon += step) {
      const x = W / 2 + (lon - lon0) * RAD * s; if (x < 30 || x > W - 60) continue;
      const L = ((lon % 360) + 540) % 360 - 180;
      ctx.fillText(L === 0 ? '0°' : Math.abs(L) === 180 ? '180°' : `${Math.abs(L)}°${L > 0 ? 'E' : 'W'}`, x, 6);
    }
  }
  function drawTargetRing() {   // 이 지역은?: 문제 지역 둘레 점선 동그라미 (작은 지역도 보이게)
    if (G.mode !== 'guess' || !G.active) return;
    const f = byId.get(G.queue[G.idx]); if (!f || G.state.has(f.id)) return;
    const p = proj(f.label); if (!p) return;
    const b = f.bb, r = Math.min(160, Math.max(16, (f.wrap ? b[1][0] + 360 - b[0][0] : b[1][0] - b[0][0]) * RAD * s / 2 + 12));
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(29,39,51,.75)'; ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawPulse() {
    if (!pulse) return;
    const f = byId.get(pulse.id), p = proj(f.label); if (!p) return;
    const t = (performance.now() - pulse.t0) / 1000, on = Math.floor(t * 3) % 2 === 0;
    if (!on) return;
    // 지역 테두리 굵게 + 둘레 동그라미 (작은 지역도 보이게)
    const l0 = lon0 * RAD, xLeft = l0 - (W / 2) / s, n = Math.floor((xLeft + Math.PI) / TAU), tx = W / 2 - s * (l0 - n * TAU);
    const reps = Math.max(1, Math.ceil((W / s + TAU) / (2 * TAU)));
    for (let r = 0; r < reps; r++) {
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (tx + r * 2 * TAU * s), dpr * cy);
      ctx.lineWidth = 3.5 / s; ctx.strokeStyle = '#1d2733'; ctx.stroke(f.shape);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const b = f.bb, wpx = Math.min(200, Math.max(14, (f.wrap ? b[1][0] + 360 - b[0][0] : b[1][0] - b[0][0]) * RAD * s / 2 + 10));
    ctx.beginPath(); ctx.arc(p[0], p[1], wpx, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(29,39,51,.8)'; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawResultLabels() {
    if (!G.showLabels) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const [id, st] of G.state) {
      const f = byId.get(id); if (!f) continue;
      const p = proj(f.label); if (!onScreen(p)) continue;
      ctx.font = '700 12.5px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
      const t = f.properties.ko;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.strokeText(t, p[0], p[1]);
      ctx.fillStyle = st === 'ok' ? '#1f7a45' : st === 'ng' ? '#b3332c' : '#b8661a'; ctx.fillText(t, p[0], p[1]);
    }
  }

  // ───────── 누른 곳의 지역 ─────────
  const inBox = (f, lon, lat) => lat >= f.bb[0][1] - .01 && lat <= f.bb[1][1] + .01 &&
    (f.wrap ? (lon >= f.bb[0][0] || lon <= f.bb[1][0]) : (lon >= f.bb[0][0] - .01 && lon <= f.bb[1][0] + .01));
  function hitTest(px, py, tol) {
    let ll = proj.invert([px, py]); if (!ll || !isFinite(ll[1])) return null;
    ll = [((ll[0] + 540) % 360) - 180, ll[1]];
    let best = null, nd = tol;
    for (const f of tiny) { const p = proj(f.label); if (!p) continue; const d = Math.hypot(p[0] - px, p[1] - py); if (d < nd) { nd = d; best = f; } }
    if (best) return best;
    for (const f of countries) if (inBox(f, ll[0], ll[1]) && d3.geoContains(f, ll) && (!best || f.area < best.area)) best = f;
    return best && best.properties.c !== '남극' ? best : null;
  }

  // ───────── 입력 ─────────
  const pointers = new Map(); let tap = null, pinch = null;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e); pointers.set(e.pointerId, { x, y });
    tap = pointers.size === 1 ? { id: e.pointerId, x, y, t: performance.now(), moved: false, type: e.pointerType } : null;
    if (pointers.size !== 2) pinch = null;
  });
  canvas.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') { const f = hitTest(x, y, 8), id = f ? f.id : null; if (id !== hoverId) { hoverId = id; requestDraw(); } }
      return;
    }
    const p = pointers.get(e.pointerId), dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
    if (pointers.size === 1) {
      if (tap && !tap.moved && Math.hypot(x - tap.x, y - tap.y) > 6) { tap.moved = true; canvas.classList.add('dragging'); }
      if (!tap || tap.moved) panBy(dx, dy);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { panBy(mx - pinch.mx, my - pinch.my); zoomAt(mx, my, d / pinch.d); }
      pinch = { mx, my, d };
    }
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId); canvas.classList.remove('dragging');
    if (tap && tap.id === e.pointerId && !tap.moved && e.type === 'pointerup' && performance.now() - tap.t < 800) {
      const f = hitTest(tap.x, tap.y, tap.type === 'mouse' ? 9 : 16);
      if (f) onPick(f, tap.x, tap.y);
    }
    if (!pointers.size) { tap = null; pinch = null; }
  };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; requestDraw(); } });
  canvas.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022))); }, { passive: false });
  $('#zoomIn').onclick = () => zoomAt(W / 2, H / 2, 1.5);
  $('#zoomOut').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.5);
  window.addEventListener('resize', () => resize());

  // ───────── 게임 ─────────
  const G = { mode: 'find', active: false, state: new Map(), flash: null, reveal: null, showLabels: false, queue: [], idx: 0, score: 0, timer: 0, intv: 0, wrong: 0, passLeft: PASSES, hintUsed: false, log: [], locked: false };
  const ko = id => (byId.get(id) || { properties: { ko: id } }).properties.ko;
  let level = 'high', conts = new Set(CONTS), mode = 'find', sound = true;   // 효과음은 처음엔 켜짐
  const maxWrong = () => G.mode === 'guess' ? 2 : MAX_WRONG;
  function load() {
    try { const d = JSON.parse(localStorage.getItem(STORE) || '{}');  if (d.mode === 'guess') mode = 'guess'; sound = d.sound !== false; if (Array.isArray(d.conts)) conts = new Set(d.conts.filter(c => CONTS.includes(c))); return d; } catch (_) { return {}; }
  }
  function save(extra) { try { const d = JSON.parse(localStorage.getItem(STORE) || '{}'); localStorage.setItem(STORE, JSON.stringify({ ...d, level, mode, sound, conts: [...conts], ...extra })); } catch (_) { } }
  const rangeKey = () => (mode === 'guess' ? 'guess:' : '') + (level === 'cont' ? 'cont:' + [...conts].sort().join(',') : level);
  const rangeName = () => (mode === 'guess' ? '이 지역은? · ' : '') + rangeName0();
  const rangeName0 = () => level === 'middle' ? '시도' : '시군';
  function pool() {
    const ids = D.HIGH;
    return ids.filter(id => byId.has(id));
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // 시작 화면
  const NOTES = {
    high: () => '시군 161곳을 맞혀요. 굵은 선은 시도 경계예요. 이름이 같은 곳은 괄호에 도 이름을 붙였어요. 전라남도와 광주광역시는 통합 전 경계예요.',
  };
  function listByCont(ids) { return CONTS.map(c => { const l = ids.filter(id => byId.has(id) && byId.get(id).properties.c === c).map(ko); return l.length ? `${c}(${l.join(', ')})` : ''; }).filter(Boolean).join(' · '); }
  function renderSetup() {
    document.querySelectorAll('#levelSeg [data-level]').forEach(b => b.classList.toggle('sel', b.dataset.level === level));
    document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.classList.toggle('sel', b.dataset.mode === mode));
    syncSound();
    $('#levelNote').textContent = byId.size ? NOTES[level]() : '';
    const box = $('#conts'); box.hidden = true;
    if (!box.children.length) for (const c of CONTS) {
      const lab = document.createElement('label'); lab.innerHTML = `<input type="checkbox" value="${c}"><span>${c}</span><small></small>`;
      lab.querySelector('input').onchange = e => { e.target.checked ? conts.add(c) : conts.delete(c); save(); renderSetup(); };
      box.appendChild(lab);
    }
    const n = pool().length; $('#startBtn').disabled = !n; $('#startBtn').textContent = n ? `🎮 시작! (${n}곳)` : '범위를 골라 주세요';
    const best = (load().best || {})[rangeKey()];
    $('#best').textContent = best != null ? `🏆 ${rangeName()} 최고 기록: ${best}개` : '';
  }
  document.querySelectorAll('#levelSeg [data-level]').forEach(b => b.onclick = () => { level = b.dataset.level; save(); renderSetup(); });
  document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; save(); renderSetup(); });
  document.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => { sound = b.dataset.snd === 'on'; save(); syncSound(); if (sound) sfx('ok'); });
  $('#hSound').onclick = () => { sound = !sound; save(); syncSound(); if (sound) sfx('ok'); };
  const SPK = '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>', MUTE = '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M3 3l18 18"/></svg>';
  function syncSound() {
    $('#hSound').innerHTML = sound ? SPK : MUTE; $('#hSound').title = sound ? '효과음 끄기' : '효과음 켜기';
    document.querySelectorAll('[data-snd]').forEach(b => b.classList.toggle('sel', (b.dataset.snd === 'on') === sound));
  }

  // 효과음 (파일 없이 소리를 만들어요)
  let actx = null;
  function sfx(kind) {
    if (!sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime;
      const tone = (f, at, dur, type = 'sine', vol = 0.18) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'ok') { tone(784, 0, 0.12); tone(1175, 0.09, 0.18); }
      else if (kind === 'ng') { tone(196, 0, 0.22, 'square', 0.09); tone(147, 0.12, 0.22, 'square', 0.08); }
      else if (kind === 'tick') tone(1320, 0, 0.05, 'triangle', 0.12);
      else if (kind === 'end') { tone(523, 0, 0.18); tone(659, 0.14, 0.18); tone(784, 0.28, 0.32); }
      else if (kind === 'pass') tone(440, 0, 0.1, 'triangle', 0.1);
    } catch (_) { }
  }
  const showSetup = () => { endTimers(); G.active = false; document.body.classList.remove('playing'); $('#hud').hidden = true; $('#choices').hidden = true; $('#result').hidden = true; $('#setup').hidden = false; renderSetup(); };
  $('#setupBtn').onclick = showSetup;
  // 제목을 누르면 처음 화면으로: 결과 색칠·이름을 지우고 지도도 처음 위치로
  $('#brand').onclick = () => {
    Object.assign(G, { state: new Map(), showLabels: false, flash: null, reveal: null }); pulse = null;
    $('#choices').hidden = true; $('#hintPop').hidden = true;
    showSetup(); goHome();
  };
  $('#setupClose').onclick = () => { $('#setup').hidden = true; };   // 닫고 지도만 보기 (위 [게임 시작]으로 다시 열어요)
  $('#startBtn').onclick = startGame; $('#againBtn').onclick = startGame;

  function startGame() {
    G.queue = shuffle(pool()); if (!G.queue.length) return;
    Object.assign(G, { mode, active: true, state: new Map(), flash: null, reveal: null, showLabels: false, idx: 0, score: 0, timer: GAME_SEC, wrong: 0, passLeft: PASSES, hintUsed: false, log: [], locked: false });
    $('#setup').hidden = true; $('#result').hidden = true; $('#hud').hidden = false; document.body.classList.add('playing');
    useSet('si');
    if (G.mode === 'find') goHome();
    endTimers();
    G.intv = setInterval(tick, 1000);
    updateHud(); nextQ();
  }
  function tick() {
    G.timer--; updateHud();
    if (G.timer > 0 && G.timer <= 10) sfx('tick');
    if (G.timer <= 0) endGame();
  }
  function endTimers() { clearInterval(G.intv); $('#danger').classList.remove('on'); }
  function updateHud() {
    const t = $('#hTime'); t.textContent = Math.max(0, G.timer); t.classList.toggle('low', G.timer <= 10);
    $('#danger').classList.toggle('on', G.active && G.timer <= 10 && G.timer > 0);
    $('#hScore').textContent = G.score;
    $('#hWrong').textContent = '✕'.repeat(G.wrong) + '○'.repeat(Math.max(0, maxWrong() - G.wrong));
    $('#hProg').textContent = `${Math.min(G.idx + 1, G.queue.length)} / ${G.queue.length}`;
    $('#passLeft').textContent = G.passLeft; $('#passBtn').disabled = !G.passLeft || !G.active;
    $('#hintBtn').disabled = G.hintUsed || !G.active;
  }
  function nextQ() {
    if (G.idx >= G.queue.length) return endGame();
    G.wrong = 0; G.hintUsed = false; G.reveal = null; $('#hintPop').hidden = true;
    if (G.mode === 'guess') { $('#hQ').textContent = '이 지역은?'; showChoices(); }
    else $('#hQ').textContent = ko(G.queue[G.idx]);
    updateHud(); requestDraw();
  }
  // 이 지역은?: 문제 지역으로 지도를 옮기고 보기 4개 (같은 대륙 지역을 섞어서)
  function focusTarget(f) {
    const b = f.bb, span = Math.max(4, f.wrap ? b[1][0] + 360 - b[0][0] : b[1][0] - b[0][0], (b[1][1] - b[0][1]) * 1.4);
    const z = Math.max(1, Math.min(5, 45 / span));
    const fy = Math.max(H * 0.3, (H - 140) / 2);   // 아래 보기 버튼에 가리지 않게
    animateTo(viewTarget(f.label[0], f.label[1], z, W / 2, fy), 450);
  }
  function showChoices() {
    const id = G.queue[G.idx], f = byId.get(id), c = f.properties.c;
    const others = shuffle(countries.map(g => g.id).filter(x => x !== id));
    const same = others.filter(x => byId.get(x).properties.c === c), rest = others.filter(x => byId.get(x).properties.c !== c);
    const opts = shuffle([id, ...[...same, ...rest].slice(0, 3)]);
    const box = $('#choices'); box.innerHTML = ''; box.hidden = false;
    opts.forEach((o, i) => {
      const b = document.createElement('button'); b.dataset.id = o; b.innerHTML = `<kbd>${i + 1}</kbd>${ko(o)}`;
      b.onclick = () => choose(o, b); box.appendChild(b);
    });
    focusTarget(f);
  }
  function choose(o, btn) {
    if (!G.active || G.locked || btn.disabled) return;
    const target = G.queue[G.idx], f = byId.get(target), p = proj(f.label) || [W / 2, H / 2];
    if (o === target) {
      G.score++; G.state.set(target, 'ok'); G.log.push({ id: target, r: 'ok' });
      btn.classList.add('ok'); feedback('⭕'); sfx('ok'); namePop(ko(target), p[0], p[1], true);
      G.idx++; G.locked = true; updateHud(); requestDraw();
      setTimeout(() => { G.locked = false; nextQ(); }, 650);
      return;
    }
    G.wrong++; btn.classList.add('ng'); btn.disabled = true; feedback('❌'); sfx('ng'); updateHud();
    if (G.wrong >= maxWrong()) {   // 2번 틀리면 정답을 보여 주고 다음 지역으로
      const right = $(`#choices [data-id="${target}"]`); if (right) right.classList.add('ok');
      G.state.set(target, 'ng'); G.log.push({ id: target, r: 'ng' }); G.idx++; G.locked = true; requestDraw();
      setTimeout(() => { G.locked = false; nextQ(); }, 1100);
    }
  }
  function onPick(f, x, y) {
    if (!G.active || G.locked || G.mode !== 'find') return;
    const target = G.queue[G.idx];
    if (f.id === target) {
      G.score++; G.state.set(target, 'ok'); G.log.push({ id: target, r: 'ok' });
      const lp = proj(f.label), onMap = lp && lp[0] > 0 && lp[0] < W && lp[1] > 0 && lp[1] < H;
      feedback('⭕'); sfx('ok'); namePop(ko(target), onMap ? lp[0] : x, onMap ? lp[1] : y, true);   // 맞힌 지역 이름을 잠깐 띄워요
      G.idx++; updateHud(); requestDraw();
      setTimeout(nextQ, 300);
      return;
    }
    if (G.state.has(f.id)) return namePop(`${ko(f.id)} (이미 나온 지역)`, x, y, false);
    G.wrong++; feedback('❌'); sfx('ng'); namePop(`그건 ${ko(f.id)}`, x, y, false);
    G.flash = { id: f.id }; G.locked = true; updateHud(); requestDraw();
    setTimeout(() => {
      G.flash = null; G.locked = false;
      if (G.wrong >= MAX_WRONG) {   // 3번 틀리면 정답 테두리를 잠깐 보여 주고 다음 지역으로
        G.state.set(target, 'ng'); G.log.push({ id: target, r: 'ng' }); G.reveal = target; G.idx++;
        requestDraw(); G.locked = true;
        setTimeout(() => { G.locked = false; G.reveal = null; nextQ(); }, 900);
      } else requestDraw();
      updateHud();
    }, 550);
  }
  function passQ() {
    if (!G.active || !G.passLeft || G.locked) return;
    const id = G.queue[G.idx]; G.state.set(id, 'ps'); G.log.push({ id, r: 'ps' });
    G.passLeft--; G.idx++; sfx('pass'); nextQ();
  }
  function useHint() {
    if (!G.active || G.hintUsed) return;
    const cap = D.CAPITALS[G.queue[G.idx]];
    G.hintUsed = true; G.timer = Math.max(1, G.timer - 1); updateHud();
    const pop = $('#hintPop'); pop.textContent = cap ? '💡 수도: ' + cap : '💡 이 지역은 수도 힌트가 없어요'; pop.hidden = false;
  }
  $('#passBtn').onclick = passQ; $('#hintBtn').onclick = useHint; $('#hintBtn').hidden = true;   // 수도 힌트는 한반도 지역에는 없어요
  $('#quitBtn').onclick = () => endGame(true);

  let fbTimer = 0, npTimer = 0;
  function feedback(ch) { const el = $('#fb'); el.hidden = true; void el.offsetWidth; el.textContent = ch; el.hidden = false; clearTimeout(fbTimer); fbTimer = setTimeout(() => { el.hidden = true; }, 620); }
  function namePop(text, x, y, ok) {
    const el = $('#namePop'); el.textContent = text; el.className = 'name-pop' + (ok ? ' ok' : '');
    el.style.left = Math.max(70, Math.min(W - 70, x)) + 'px'; el.style.top = Math.max(40, y) + 'px'; el.hidden = false;
    clearTimeout(npTimer); npTimer = setTimeout(() => { el.hidden = true; }, 1100);
  }

  function endGame(quit) {
    if (!G.active) return;
    G.active = false; endTimers(); hoverId = null; G.reveal = null; G.flash = null; sfx('end');
    $('#choices').hidden = true;
    $('#hintPop').hidden = true; $('#hud').hidden = true; document.body.classList.remove('playing');
    const ok = G.log.filter(l => l.r === 'ok'), ng = G.log.filter(l => l.r === 'ng'), ps = G.log.filter(l => l.r === 'ps');
    $('#rOk').textContent = ok.length; $('#rNg').textContent = ng.length; $('#rPs').textContent = ps.length;
    const d = load(), best = { ...(d.best || {}) }, key = rangeKey(), prev = best[key];
    let note = `${rangeName()} · ${G.queue.length}개 중 ${G.idx}개 도전`;
    if (G.idx >= G.queue.length && !quit) note = `${rangeName()} ${G.queue.length}개를 시간 안에 모두 풀었어요! 남은 시간 ${G.timer}초`;
    if (prev == null || ok.length > prev) { best[key] = ok.length; save({ best }); if (prev != null) note += ` · 🏆 최고 기록 경신 (전 ${prev}개)`; }
    else note += ` · 최고 기록 ${prev}개`;
    $('#rNote').textContent = note;
    $('#rTitle').textContent = quit ? '그만하기 · 결과' : G.timer <= 0 ? '⏰ 시간 끝!' : '🎉 다 풀었어요!';
    const tags = $('#rTags'); tags.innerHTML = '';
    for (const l of [...ok, ...ng, ...ps]) {
      const b = document.createElement('button'); b.className = 'tag ' + l.r; b.textContent = ko(l.id);
      b.onclick = () => { tags.querySelectorAll('.tag').forEach(t => t.classList.toggle('on', t === b)); showCountry(byId.get(l.id)); };
      tags.appendChild(b);
    }
    G.showLabels = true; $('#result').classList.remove('min'); $('#result').hidden = false;
    goHome(); requestDraw();
  }
  $('#rMin').onclick = () => $('#result').classList.toggle('min');
  $('#rClose').onclick = () => { $('#result').hidden = true; pulse = null; requestDraw(); };   // 결과 창 닫고 지도만 (위 [게임 시작]으로 다시)

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.5);
    else if (e.key === '-' || e.key === '_') zoomAt(W / 2, H / 2, 1 / 1.5);
    else if (G.active && (e.key === 'h' || e.key === 'H' || e.key === 'ㅗ')) useHint();
    else if (G.active && (e.key === 'p' || e.key === 'P' || e.key === 'ㅔ')) passQ();
    else if (G.active && G.mode === 'guess' && /^[1-4]$/.test(e.key)) { const b = $(`#choices button:nth-child(${e.key})`); if (b) b.click(); }
    else if (!G.active && e.key === 'Enter' && !$('#setup').hidden) startGame();
    else if (e.key === 'Escape' && !$('#setup').hidden) $('#setup').hidden = true;
  });

  // ───────── 시작 ─────────
  load(); renderSetup(); resize();
  loadData().then(() => { $('#loading').hidden = true; renderSetup(); requestDraw(); })
    .catch(() => { $('#loading').textContent = '지도를 불러오지 못했어요. 새로고침해 주세요.'; });
  window.__game = { G, byId, hitTest, proj: () => proj, onPick };
})();
