/* 나라 찾기 v1.0 — 세계지도 색칠하고 도형찍기 3.0의 지도 그리기만 가져온 독립 게임 */
(() => {
  'use strict';
  const D = window.WG_DATA;
  const $ = s => document.querySelector(s);
  const RAD = Math.PI / 180, TAU = 2 * Math.PI;
  const HOME_LON = 150, LAT_TOP = 84, LAT_BOT = -60, MAX_ZOOM = 40, MIN_ZOOM = 0.5;
  const GAME_SEC = 60, MAX_WRONG = 3, PASSES = 3;
  const CONTS = ['아시아', '유럽', '아프리카', '북아메리카', '남아메리카', '오세아니아'];
  const COL = { land: '#FFFFFF', ocean: '#D2E9F7', ok: '#86d3a2', ng: '#f19a93', ps: '#f8c983', flash: '#e8615a', hover: '#f3f6f9' };
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * RAD / 2));
  const MERC_SPAN = merc(LAT_TOP) - merc(LAT_BOT);
  const STORE = 'worldgame.v1';

  // ───────── 지도 ─────────
  const canvas = $('#map'), ctx = canvas.getContext('2d'), stage = $('#stage');
  let W = 0, H = 0, dpr = 1, s = 1, sMin = 1, lon0 = HOME_LON, cy = 0;
  const projM = d3.geoMercator().precision(0);
  let proj = projM;
  let countries = [], byId = new Map(), tiny = [], borderShape = null, coastShape = null, gridShape = null, eqShape = null;

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
  function viewTarget(lon, lat, z) { const ts = clampScale(sMin * z); return { lon, s: ts, cy: H / 2 + ts * merc(lat) }; }
  function goHome(animate = true) {
    const t = viewTarget(HOME_LON, 15, Math.max(0.68, Math.min(1, (W / TAU) / sMin)));   // 폰(세로 화면)은 세계가 한눈에 들어오게 축소
    if (animate) return animateTo(t);
    lon0 = t.lon; s = t.s; cy = t.cy; clampView(); requestDraw();
  }
  function flyTo(f) {
    const b = f.bb, span = Math.max(4, f.wrap ? b[1][0] + 360 - b[0][0] : b[1][0] - b[0][0], (b[1][1] - b[0][1]) * 1.4);
    animateTo(viewTarget(f.label[0], f.label[1], Math.max(1, Math.min(14, 110 / span))), 600);
  }
  function resize() {
    const r = stage.getBoundingClientRect(), first = !W;
    const keep = W ? { lon: lon0, lat: Math.atan(Math.sinh((cy - H / 2) / s)) / RAD, z: s / sMin } : null;
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    sMin = Math.max(W / TAU, H / MERC_SPAN);
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
  async function loadData() {
    const topo = await fetch('data/world.json').then(r => r.json());
    countries = topojson.feature(topo, topo.objects.countries).features;
    for (const f of countries) {
      f.bb = d3.geoBounds(f); f.wrap = f.bb[0][0] > f.bb[1][0];
      f.area = d3.geoArea(f); f.label = [f.properties.lx, f.properties.ly];
      f.shape = makeShape(f); byId.set(f.id, f);
      if (f.area < 2e-5 && D.ALL.includes(f.id)) tiny.push(f);   // 점처럼 작은 나라는 동그라미로
    }
    borderShape = makeShape(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b));
    coastShape = makeShape(dropAntimeridian(topojson.mesh(topo, topo.objects.countries, (a, b) => a === b)));
    gridShape = makeShape(d3.geoGraticule().step([30, 30]).extentMajor([[-180, -85], [180, 85]]).stepMajor([30, 30])());
    eqShape = makeShape({ type: 'LineString', coordinates: d3.range(-180, 181, 2).map(x => [x, 0]) });
  }

  // ───────── 그리기 ─────────
  let drawQueued = false, hoverId = null;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(draw); } }
  function fillOf(f) {
    if (G.flash && G.flash.id === f.id) return COL.flash;
    const st = G.state.get(f.id);
    if (st) return COL[st];
    return f.id === hoverId && G.active ? COL.hover : COL.land;
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
      ctx.lineWidth = 1 * px; ctx.strokeStyle = '#1a1a1a'; ctx.stroke(coastShape);
      const out = G.reveal && byId.get(G.reveal);
      if (out) { ctx.lineWidth = 3 * px; ctx.strokeStyle = COL.flash; ctx.stroke(out.shape); }
      if (hoverId && G.active && byId.has(hoverId)) { ctx.lineWidth = 2 * px; ctx.strokeStyle = '#1d2733'; ctx.stroke(byId.get(hoverId).shape); }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTiny(); drawGridLabels(); drawResultLabels();
  }
  const onScreen = p => p && p[0] > -40 && p[0] < W + 40 && p[1] > -20 && p[1] < H + 20;
  function drawTiny() {
    for (const f of tiny) {
      const p = proj(f.label); if (!onScreen(p)) continue;
      const st = G.state.get(f.id), fl = G.flash && G.flash.id === f.id;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, TAU);
      ctx.fillStyle = fl ? COL.flash : st ? COL[st] : 'rgba(255,255,255,.85)'; ctx.fill();
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

  // ───────── 누른 곳의 나라 ─────────
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
  $('#homeBtn').onclick = () => goHome();
  window.addEventListener('resize', () => resize());

  // ───────── 게임 ─────────
  const G = { active: false, state: new Map(), flash: null, reveal: null, showLabels: false, queue: [], idx: 0, score: 0, timer: 0, intv: 0, wrong: 0, passLeft: PASSES, hintUsed: false, log: [], locked: false };
  const ko = id => (byId.get(id) || { properties: { ko: id } }).properties.ko;
  let level = 'middle', conts = new Set(CONTS);
  function load() {
    try { const d = JSON.parse(localStorage.getItem(STORE) || '{}'); if (d.level) level = d.level; if (Array.isArray(d.conts)) conts = new Set(d.conts.filter(c => CONTS.includes(c))); return d; } catch (_) { return {}; }
  }
  function save(extra) { try { const d = JSON.parse(localStorage.getItem(STORE) || '{}'); localStorage.setItem(STORE, JSON.stringify({ ...d, level, conts: [...conts], ...extra })); } catch (_) { } }
  const rangeKey = () => level === 'cont' ? 'cont:' + [...conts].sort().join(',') : level;
  const rangeName = () => level === 'middle' ? '중학교' : level === 'high' ? '고등학교' : level === 'all' ? '모든 나라' : [...conts].join('·');
  function pool() {
    const ids = level === 'middle' ? D.MIDDLE : level === 'high' ? D.HIGH : level === 'all' ? D.ALL
      : D.ALL.filter(id => byId.has(id) && conts.has(byId.get(id).properties.c));
    return ids.filter(id => byId.has(id));
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // 시작 화면
  const NOTES = {
    middle: () => '중학교 지리 교과서에 나오는 나라: ' + listByCont(D.MIDDLE),
    high: () => '중학교 나라에 고등학교 지리 교과서 나라를 더했어요: ' + listByCont(D.HIGH.filter(id => !D.MIDDLE.includes(id))) + ' 추가',
    all: () => '지도에 있는 독립국 전체예요. 작은 섬나라도 나와요.',
    cont: () => '고른 대륙의 나라가 모두 나와요.',
  };
  function listByCont(ids) { return CONTS.map(c => { const l = ids.filter(id => byId.has(id) && byId.get(id).properties.c === c).map(ko); return l.length ? `${c}(${l.join(', ')})` : ''; }).filter(Boolean).join(' · '); }
  function renderSetup() {
    document.querySelectorAll('#levelSeg [data-level]').forEach(b => b.classList.toggle('sel', b.dataset.level === level));
    $('#cntMiddle').textContent = D.MIDDLE.length + '개'; $('#cntHigh').textContent = D.HIGH.length + '개'; $('#cntAll').textContent = D.ALL.filter(id => byId.has(id)).length + '개';
    $('#levelNote').textContent = byId.size ? NOTES[level]() : '';
    const box = $('#conts'); box.hidden = level !== 'cont';
    if (!box.children.length) for (const c of CONTS) {
      const n = D.ALL.filter(id => byId.has(id) && byId.get(id).properties.c === c).length;
      const lab = document.createElement('label'); lab.innerHTML = `<input type="checkbox" value="${c}"><span>${c}</span><small>${n}</small>`;
      lab.querySelector('input').onchange = e => { e.target.checked ? conts.add(c) : conts.delete(c); save(); renderSetup(); };
      box.appendChild(lab);
    }
    box.querySelectorAll('input').forEach(i => { i.checked = conts.has(i.value); });
    const n = pool().length; $('#startBtn').disabled = !n; $('#startBtn').textContent = n ? `🎮 시작! (${n}개 나라)` : '대륙을 골라 주세요';
    const best = (load().best || {})[rangeKey()];
    $('#best').textContent = best != null ? `🏆 ${rangeName()} 최고 기록: ${best}개` : '';
  }
  document.querySelectorAll('#levelSeg [data-level]').forEach(b => b.onclick = () => { level = b.dataset.level; save(); renderSetup(); });
  const showSetup = () => { endTimers(); G.active = false; document.body.classList.remove('playing'); $('#hud').hidden = true; $('#result').hidden = true; $('#setup').hidden = false; renderSetup(); };
  $('#setupBtn').onclick = showSetup; $('#toSetup').onclick = showSetup;
  $('#startBtn').onclick = startGame; $('#againBtn').onclick = startGame;

  function startGame() {
    G.queue = shuffle(pool()); if (!G.queue.length) return;
    Object.assign(G, { active: true, state: new Map(), flash: null, reveal: null, showLabels: false, idx: 0, score: 0, timer: GAME_SEC, wrong: 0, passLeft: PASSES, hintUsed: false, log: [], locked: false });
    $('#setup').hidden = true; $('#result').hidden = true; $('#hud').hidden = false; document.body.classList.add('playing');
    goHome();
    endTimers();
    G.intv = setInterval(tick, 1000);
    updateHud(); nextQ();
  }
  function tick() {
    G.timer--; updateHud();
    if (G.timer <= 0) endGame();
  }
  function endTimers() { clearInterval(G.intv); $('#danger').classList.remove('on'); }
  function updateHud() {
    const t = $('#hTime'); t.textContent = Math.max(0, G.timer); t.classList.toggle('low', G.timer <= 10);
    $('#danger').classList.toggle('on', G.active && G.timer <= 10 && G.timer > 0);
    $('#hScore').textContent = G.score;
    $('#hWrong').textContent = '✕'.repeat(G.wrong) + '○'.repeat(MAX_WRONG - G.wrong);
    $('#hProg').textContent = `${Math.min(G.idx + 1, G.queue.length)} / ${G.queue.length}`;
    $('#passLeft').textContent = G.passLeft; $('#passBtn').disabled = !G.passLeft || !G.active;
    $('#hintBtn').disabled = G.hintUsed || !G.active;
  }
  function nextQ() {
    if (G.idx >= G.queue.length) return endGame();
    G.wrong = 0; G.hintUsed = false; G.reveal = null; $('#hintPop').hidden = true;
    $('#hQ').textContent = ko(G.queue[G.idx]);
    updateHud(); requestDraw();
  }
  function onPick(f, x, y) {
    if (!G.active || G.locked) return;
    const target = G.queue[G.idx];
    if (f.id === target) {
      G.score++; G.state.set(target, 'ok'); G.log.push({ id: target, r: 'ok' });
      feedback('⭕'); G.idx++; updateHud(); requestDraw();
      setTimeout(nextQ, 300);
      return;
    }
    if (G.state.has(f.id)) return namePop(`${ko(f.id)} (이미 나온 나라)`, x, y, false);
    G.wrong++; feedback('❌'); namePop(`그건 ${ko(f.id)}`, x, y, false);
    G.flash = { id: f.id }; G.locked = true; updateHud(); requestDraw();
    setTimeout(() => {
      G.flash = null; G.locked = false;
      if (G.wrong >= MAX_WRONG) {   // 3번 틀리면 정답 테두리를 잠깐 보여 주고 다음 나라로
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
    G.passLeft--; G.idx++; nextQ();
  }
  function useHint() {
    if (!G.active || G.hintUsed) return;
    const cap = D.CAPITALS[G.queue[G.idx]];
    G.hintUsed = true; G.timer = Math.max(1, G.timer - 1); updateHud();
    const pop = $('#hintPop'); pop.textContent = cap ? '💡 수도: ' + cap : '💡 이 나라는 수도 힌트가 없어요'; pop.hidden = false;
  }
  $('#passBtn').onclick = passQ; $('#hintBtn').onclick = useHint;
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
    G.active = false; endTimers(); hoverId = null; G.reveal = null; G.flash = null;
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
      b.onclick = () => { flyTo(byId.get(l.id)); $('#result').classList.add('min'); };
      tags.appendChild(b);
    }
    G.showLabels = true; $('#result').classList.remove('min'); $('#result').hidden = false;
    goHome(); requestDraw();
  }
  $('#rMin').onclick = () => $('#result').classList.toggle('min');

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.5);
    else if (e.key === '-' || e.key === '_') zoomAt(W / 2, H / 2, 1 / 1.5);
    else if (G.active && (e.key === 'h' || e.key === 'H' || e.key === 'ㅗ')) useHint();
    else if (G.active && (e.key === 'p' || e.key === 'P' || e.key === 'ㅔ')) passQ();
    else if (!G.active && e.key === 'Enter' && !$('#setup').hidden) startGame();
  });

  // ───────── 시작 ─────────
  load(); renderSetup(); resize();
  loadData().then(() => { $('#loading').hidden = true; renderSetup(); requestDraw(); })
    .catch(() => { $('#loading').textContent = '지도를 불러오지 못했어요. 새로고침해 주세요.'; });
  window.__game = { G, byId, hitTest, proj: () => proj, onPick };
})();
