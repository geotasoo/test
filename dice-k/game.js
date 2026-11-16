// dice-k 화면: 로비 · 지도(줌/팬) · 2단계 공격 · "○○ 옆 △△" 배너 · 주사위 충전 · 결과
(() => {
  'use strict';
  const M = window.MAP_KR161, E = window.DiceK;
  const $ = s => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 플레이어 스타일 8가지: 색 + 아이콘 + 무늬 (색약 배려 3.2) ----------
  const STYLES = [
    { c: '#E8590C', name: '주황', ic: '★', pat: 'diag' },
    { c: '#1C7ED6', name: '파랑', ic: '●', pat: 'dots' },
    { c: '#2B8A3E', name: '초록', ic: '▲', pat: 'hor' },
    { c: '#E8B500', name: '노랑', ic: '■', pat: 'cross' },
    { c: '#AE3EC9', name: '보라', ic: '◆', pat: 'ver' },
    { c: '#0CA3B5', name: '청록', ic: '♥', pat: 'rdiag' },
    { c: '#D6336C', name: '분홍', ic: '♣', pat: 'grid' },
    { c: '#7A5C3E', name: '갈색', ic: '✚', pat: 'ring' },
  ];
  const mix = (hex, t) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; const m = v => Math.round(v + (255 - v) * t); return `rgb(${m(r)},${m(g)},${m(b)})`; };
  const TITLE_TXT = { 수: ['秀', '가장 뛰어나고 훌륭함 🌟'], 우: ['優', '넉넉하고 우수함'], 미: ['美', '훌륭하고 아름다움'], 양: ['良', '어질고 괜찮음'], 가: ['可', '충분히 가능성이 있음'] };

  // ---------- 설정 (기기 안에만 저장) ----------
  const LS = { save: 'dicek.save.v1', set: 'dicek.settings', lobby: 'dicek.lobby' };
  const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 진행 */ } };
  const set = Object.assign({ speed: 'normal', sound: true, labels: true }, load(LS.set) || {});
  if (!['normal', 'fast'].includes(set.speed)) set.speed = 'fast';   // 예전 '건너뛰기'는 빠르게로
  const saveSet = () => store(LS.set, set);

  // ---------- 상태 ----------
  let S = null;              // 엔진 상태
  let G = null;              // 현재 프리셋 그래프
  let localOf = new Map();   // 원본 칸 번호 → 로컬 번호
  let sel = { from: null, to: null }, info = null;
  let busy = false, waitingHandoff = false;
  const view = { x: 0, y: 0, k: 1 }; let k0 = 1;

  const svg = $('#map'), vp = $('#vp');
  const gCells = $('#gCells'), gOut = $('#gOut'), gLinks = $('#gLinks'), gHi = $('#gHi'), gBadges = $('#gBadges'), gNames = $('#gNames'), gProvNames = $('#gProvNames'), gFx = $('#gFx');

  // ---------- 효과음 (파일 없이 WebAudio로) ----------
  let AC = null;
  const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
  function beep(f, dur = .05, type = 'triangle', vol = .12, when = 0) {
    if (!set.sound) return; const a = ac(); if (!a) return;
    const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
  }
  const SND = {
    tick: () => beep(1400 + Math.random() * 900, .03, 'square', .05),
    win: () => [784, 1047, 1568].forEach((f, i) => beep(f, .16, 'triangle', .13, i * .08)),
    lose: () => { beep(330, .14, 'sine', .14); beep(220, .22, 'sine', .14, .1); },
    charge: () => [1319, 1568, 2093].forEach((f, i) => beep(f, .09, 'sine', .09, i * .06)),
    tap: () => beep(900, .03, 'sine', .06),
  };

  // ---------- 무늬 정의 ----------
  function makePatterns() {
    const defs = $('#defs');
    STYLES.forEach((st, k) => {
      const p = el('pattern', { id: 'pat' + k, patternUnits: 'userSpaceOnUse', width: 5, height: 5 }, defs);
      el('rect', { width: 5, height: 5, fill: mix(st.c, .2) }, p);
      const ink = { stroke: st.c, 'stroke-width': .7, opacity: .55, fill: 'none' };
      const L = d => el('path', Object.assign({ d }, ink), p);
      ({ diag: () => L('M0,5L5,0M-1,1L1,-1M4,6L6,4'), rdiag: () => L('M0,0L5,5M-1,4L1,6M4,-1L6,1'), hor: () => L('M0,2.5H5'), ver: () => L('M2.5,0V5'),
        cross: () => L('M0,5L5,0M0,0L5,5'), grid: () => L('M0,2.5H5M2.5,0V5'),
        dots: () => el('circle', { cx: 2.5, cy: 2.5, r: .9, fill: st.c, opacity: .55 }, p),
        ring: () => el('circle', Object.assign({ cx: 2.5, cy: 2.5, r: 1.3 }, ink), p) })[st.pat]();
      // 3D 주사위 한 개 (바닥 가운데가 0,0). 윗면·왼면·오른면 + 눈
      const sym = el('symbol', { id: 'die' + k, viewBox: '-11 -23 22 24', overflow: 'visible' }, defs);
      const pip = st.c === '#E8B500' ? '#1d2733' : '#fff';
      sym.innerHTML = `<path d="M0,-22L10,-17L0,-12L-10,-17Z" fill="${mix(st.c, .35)}" stroke="#1d2733" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M-10,-17L0,-12L0,0L-10,-5Z" fill="${st.c}" stroke="#1d2733" stroke-width=".9" stroke-linejoin="round"/>` +
        `<path d="M10,-17L0,-12L0,0L10,-5Z" fill="${shade(st.c, .28)}" stroke="#1d2733" stroke-width=".9" stroke-linejoin="round"/>` +
        `<ellipse cx="0" cy="-17" rx="2.2" ry="1.2" fill="${pip}"/>` +
        `<circle cx="-7" cy="-11.3" r="1.3" fill="${pip}"/><circle cx="-3" cy="-5.6" r="1.3" fill="${pip}"/>` +
        `<circle cx="2.6" cy="-10.6" r="1.2" fill="${pip}"/><circle cx="5" cy="-7.8" r="1.2" fill="${pip}"/><circle cx="7.4" cy="-5" r="1.2" fill="${pip}"/>`;
    });
  }
  function shade(hex, t) { const n = parseInt(hex.slice(1), 16), f = v => Math.round(v * (1 - t)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

  // ---------- 지도 그리기 (프리셋이 바뀔 때) ----------
  function drawMap() {
    G = E.buildGraph(M, S.preset);
    localOf = new Map(G.cells.map((g, i) => [g, i]));
    [gCells, gOut, gLinks, gBadges, gNames, gProvNames, gHi, gFx].forEach(g => g.textContent = '');
    M.cells.forEach((c, g) => {
      const on = localOf.has(g);
      const p = el('path', { d: c.d, class: 'cell' + (on ? '' : ' off'), id: 'c' + g }, on ? gCells : gOut);
      if (on) p.dataset.i = localOf.get(g);
    });
    ['#gProv', '#gProvCase', '#gProvFaint'].forEach(q => $(q).setAttribute('d', M.provLines));
    // 시도 경계는 게임하는 지역 안에서만 진하게 (밖은 옅게)
    $('#playClip').innerHTML = G.cells.map(g => `<path d="${M.cells[g].d}"/>`).join('');
    M.links.forEach(l => {
      const on = localOf.has(l.a) && localOf.has(l.b);
      const [[x1, y1], [x2, y2]] = l.line;
      if (l.type === 'bridge') el('line', { x1, y1, x2, y2, class: 'lk-bridge' + (on ? '' : ' lk-off') }, gLinks);
      else {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, [cx, cy] = l.ctrl;   // 바다 쪽으로 휘게
        const path = el('path', { d: `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`, class: 'lk-sea' + (on ? '' : ' lk-off') }, gLinks);
        path.dataset.a = l.a; path.dataset.b = l.b;
        if (on) { const t = el('text', { class: 'ship sc', 'data-x': (mx + cx) / 2, 'data-y': (my + cy) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, gLinks); t.textContent = '⛴'; }
      }
    });
    M.provLabels.filter(p => G.preset.provs ? G.preset.provs.includes(p.name) : G.preset.regions.includes(p.region)).forEach(p => {
      const t = el('text', { class: 'pname sc', 'data-x': p.p[0], 'data-y': p.p[1] }, gProvNames); t.textContent = p.name;
    });
    G.cells.forEach((g, i) => {
      const c = M.cells[g];
      const b = el('g', { class: 'badge sc', 'data-x': c.lp[0], 'data-y': c.lp[1] }, gBadges); b.dataset.i = i;
      const t = el('text', { class: 'cname sc', 'data-x': c.lp[0], 'data-y': c.lp[1], y: 17 }, gNames); t.textContent = c.label; t.dataset.i = i;
    });
    fit();
  }

  // ---------- 줌·팬 ----------
  const W = () => svg.clientWidth, H = () => svg.clientHeight;
  function fit() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // 각 칸의 가장 큰 덩어리 범위로 맞춤 (인천 옹진의 먼 섬 같은 작은 섬 때문에 지도가 작아지지 않게)
    G.cells.forEach(g => { const b = M.cells[g].bb; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); });
    if (!isFinite(x0)) return;
    const w = W(), h = H(), pad = 16;
    const kw = (w - pad * 2 - 44) / (x1 - x0), kh = (h - pad * 2) / (y1 - y0);
    // 세로로 긴 폰 화면에서는 너비에 맞추면 지도가 너무 작아져서, 높이 쪽으로 조금 더 키움 (옆은 끌어서 보기)
    const k = w < 700 && kh > kw ? Math.min(kh, kw * 1.45) : Math.min(kw, kh);
    k0 = k; view.k = k; view.x = (w - (x1 - x0) * k) / 2 - x0 * k; view.y = (h - (y1 - y0) * k) / 2 - y0 * k;
    applyView();
  }
  function zoomAt(px, py, f) {
    const k = Math.max(k0 * .7, Math.min(k0 * 8, view.k * f)); f = k / view.k;
    view.x = px - (px - view.x) * f; view.y = py - (py - view.y) * f; view.k = k; applyView();
  }
  let rafPending = false;
  function applyView() {
    vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
    if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; updateScaled(); }); }
  }
  // 글자·주사위 더미는 화면에서 같은 크기로
  function updateScaled() {
    const k = view.k, inv = 1 / k, z = k / k0;
    vp.querySelectorAll('.sc').forEach(e => e.setAttribute('transform', `translate(${e.dataset.x},${e.dataset.y}) scale(${inv})`));
    // 무늬는 화면에서 늘 같은 촘촘함으로
    document.querySelectorAll('#defs pattern').forEach(pt => pt.setAttribute('patternTransform', `scale(${(7 / (5 * k)).toFixed(4)})`));
    // 주사위 더미는 칸 크기에 맞춰 (좁은 칸은 작게, 이웃을 덜 가리게)
    gBadges.querySelectorAll('.badge').forEach(b => { const c = M.cells[G.cells[+b.dataset.i]]; const s = Math.max(.4, Math.min(1.05, c.room * k / 17)); b.setAttribute('transform', `translate(${b.dataset.x},${b.dataset.y}) scale(${inv * s})`); });
    renderNames();
  }

  // 포인터: 한 손가락 끌기, 두 손가락 확대, 짧게 누르면 선택
  const ptrs = new Map(); let drag = null, pinch = null;
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, vx: view.x, vy: view.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; if (drag) drag.moved = true; }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const k = Math.max(k0 * .7, Math.min(k0 * 8, pinch.k * d / pinch.d));
      const cx = (pinch.mx - r.left - pinch.vx) / pinch.k, cy = (pinch.my - r.top - pinch.vy) / pinch.k;
      view.k = k; view.x = mx - r.left - cx * k; view.y = my - r.top - cy * k; applyView();
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 7) { drag.moved = true; svg.classList.add('dragging'); }
      if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); }
    }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    const single = ptrs.size === 1; ptrs.delete(e.pointerId);
    if (single && drag && !drag.moved && e.type === 'pointerup') tapAt(e.clientX, e.clientY);
    if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: p.x, y: p.y, vx: view.x, vy: view.y, moved: true }; pinch = null; }
    if (ptrs.size === 0) { drag = null; pinch = null; svg.classList.remove('dragging'); }
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * .0016)); }, { passive: false });
  $('#zoomIn').onclick = () => zoomAt(W() / 2, H() / 2, 1.5);
  $('#zoomOut').onclick = () => zoomAt(W() / 2, H() / 2, 1 / 1.5);
  $('#zoomFit').onclick = () => fit();
  window.addEventListener('resize', () => { if (S) fit(); });

  function tapAt(cx, cy) {
    if (!S) return;
    let t = document.elementFromPoint(cx, cy), hit = t && t.closest && t.closest('[data-i]');
    let i = hit ? +hit.dataset.i : null;
    if (i == null) {   // 작은 칸: 배지 근처를 눌러도 잡히게
      const r = svg.getBoundingClientRect(); let best = 20;
      G.cells.forEach((g, li) => { const c = M.cells[g]; const d = Math.hypot(view.x + c.lp[0] * view.k - (cx - r.left), view.y + c.lp[1] * view.k - (cy - r.top)); if (d < best) { best = d; i = li; } });
    }
    if (i == null) { info = null; if (!busy) { sel = { from: null, to: null }; } render(); return; }
    onCell(i);
  }

  // ---------- 칸 누르기: 1단계 출발 칸 → 2단계 대상 칸 → 3단계 [주사위 굴리기] ----------
  const myTurn = () => S && !S.over && !busy && !waitingHandoff && !S.players[S.cur].ai;
  function onCell(i) {
    SND.tap();
    if (!myTurn()) { info = info === i ? null : i; render(); return; }
    if (sel.from != null && i === sel.from) { sel = { from: null, to: null }; info = null; render(); return; }
    if (sel.from != null && E.targetsOf(M, S, sel.from).includes(i)) { sel.to = i; info = null; render(); return; }
    if (S.owner[i] === S.cur && E.canAttackFrom(M, S, i)) { sel = { from: i, to: null }; info = null; render(); return; }
    sel = { from: null, to: null }; info = i;
    if (S.owner[i] === S.cur && S.dice[i] < 2) flashNotice('주사위가 2개 이상인 칸에서만 공격할 수 있어요');
    else if (S.owner[i] === S.cur) flashNotice('이웃 칸이 모두 내 땅이에요');
    render();
  }

  // ---------- 그리기 ----------
  const cellName = i => M.cells[G.cells[i]].name, cellLabel = i => M.cells[G.cells[i]].label;
  const stOf = p => STYLES[S.players[p].style];
  function icon(p, cls = '') { return `<span class="dic ${cls}">${dieIcon(S.players[p].style)}</span>`; }

  function render() {
    if (!S) return;
    gCells.querySelectorAll('path').forEach(p => { const i = +p.dataset.i; p.setAttribute('fill', `url(#pat${S.players[S.owner[i]].style})`); p.classList.toggle('pick', i === sel.from || i === sel.to); });
    renderBadges(); renderHi(); renderNames(); renderHud(); renderPlayers(); renderRoll();
  }

  function renderBadges() {
    gBadges.querySelectorAll('.badge').forEach(b => {
      const i = +b.dataset.i, n = S.dice[i], o = S.owner[i], st = S.players[o].style;
      const key = n + ':' + o;
      if (b.dataset.k === key) return;
      const [pn, po] = (b.dataset.k || '0:-1').split(':').map(Number);
      const fresh = po !== o ? 0 : pn;          // 주인이 바뀌면 모두 새로, 늘었으면 늘어난 만큼만 떨어짐
      b.dataset.k = key;
      const pos = d => { const col = Math.floor(d / 4), row = d % 4; return [col * 9, -row * 12 - col * 5]; };
      let h = `<ellipse cx="${n > 4 ? 6 : 1}" cy="1" rx="${n > 4 ? 17 : 12}" ry="4.5" fill="rgba(0,0,0,.28)"/>`;
      const order = [...Array(n).keys()].sort((a, c) => (Math.floor(c / 4) - Math.floor(a / 4)) || (a - c));   // 뒷줄 먼저
      for (const d of order) { const [x, y] = pos(d); h += `<use href="#die${st}" x="${x - 11}" y="${y - 23}" width="22" height="24"${d >= fresh && b.dataset.k0 ? ` class="drop" style="animation-delay:${(d - fresh) * 45}ms"` : ''}/>`; }
      h += `<rect x="-13" y="${-Math.min(n, 4) * 12 - 14}" width="${n > 4 ? 35 : 26}" height="${Math.min(n, 4) * 12 + 18}" fill="transparent"/>`;
      b.innerHTML = h; b.dataset.k0 = 1;
    });
  }

  function hotSet() {   // 이름을 꼭 보여 줄 칸: 고른 칸·누른 칸과 그 이웃
    const s = new Set(), base = sel.from != null ? sel.from : info;
    if (base != null) { s.add(base); G.nb[base].forEach(j => s.add(j)); }
    if (sel.to != null) s.add(sel.to);
    return s;
  }
  function renderNames() {
    if (!S) return;
    const k = view.k, z = k / k0, hot = hotSet(), tg = sel.from != null ? new Set(E.targetsOf(M, S, sel.from)) : new Set();
    gProvNames.style.display = z < 1.4 && set.labels && !hot.size ? '' : 'none';
    gNames.querySelectorAll('.cname').forEach(t => {
      const i = +t.dataset.i, c = M.cells[G.cells[i]];
      const fits = c.room * k >= Math.max(c.label.length * 6 + 3, 20);   // 이름(아래)과 주사위 더미(위)가 칸 안에 들어갈 때
      const show = hot.has(i) || (set.labels && (z >= 3 || fits) && !(hot.size && z < 1.4));
      t.style.display = show ? '' : 'none';
      t.setAttribute('class', 'cname sc' + (hot.has(i) ? ' hot' : '') + (tg.has(i) ? ' tgt' : '') + (i === sel.from || i === sel.to ? ' ondark' : ''));
    });
    // 이름표는 맨 위로: 뜨거운 이름을 마지막에
    hot.forEach(i => { const t = gNames.querySelector(`[data-i="${i}"]`); if (t) gNames.appendChild(t); });
  }

  function hiPath(i, cls) { return el('path', { d: M.cells[G.cells[i]].d, class: cls }, gHi); }
  function renderHi() {
    gHi.textContent = '';
    gLinks.querySelectorAll('.lk-sea').forEach(p => p.classList.remove('hi'));
    gCells.querySelectorAll('.dim').forEach(p => p.classList.remove('dim'));
    const base = sel.from != null ? sel.from : info;
    if (base == null) return;
    const nbs = G.nb[base], tg = sel.from != null ? E.targetsOf(M, S, sel.from) : [];
    nbs.forEach(j => { if (!tg.includes(j)) hiPath(j, 'hi-nb'); });
    tg.forEach(j => { if (j !== sel.to) hiPath(j, 'hi-tgt'); });
    hiPath(base, 'hi-from');
    // 뱃길로 이어진 이웃이면 뱃길 선도 강조
    const gb = G.cells[base];
    gLinks.querySelectorAll('.lk-sea').forEach(p => { const a = +p.dataset.a, b = +p.dataset.b; if ((a === gb && nbs.some(j => G.cells[j] === b)) || (b === gb && nbs.some(j => G.cells[j] === a))) p.classList.add('hi'); });
    if (sel.to != null) {
      hiPath(sel.to, 'hi-to');
      const a = M.cells[G.cells[sel.from]].lp, b = M.cells[G.cells[sel.to]].lp;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, sh = Math.min(6, L * .2);
      el('line', { x1: a[0] + dx / L * sh, y1: a[1] + dy / L * sh, x2: b[0] - dx / L * sh, y2: b[1] - dy / L * sh, class: 'arrow' }, gHi);
    }
  }

  function renderHud() {
    $('#hRound').textContent = S.round; $('#hMax').textContent = S.maxRound;
    const p = S.cur, pl = S.players[p];
    $('#hCur').innerHTML = `${icon(p)}<span class="nm">${esc(pl.name)}</span><span class="tag">${S.over ? '게임 끝' : pl.ai ? '🤖 생각 중…' : '차례'}</span>`;
    $('#speedBtn').textContent = { normal: '🤖 보통', fast: '🤖 빠르게' }[set.speed];
  }

  function dieIcon(style) { return `<svg viewBox="-12 -25 24 27"><use href="#die${style}" x="-11" y="-23" width="22" height="24"/></svg>`; }
  function renderPlayers() {
    $('#players').innerHTML = S.players.map((pl, p) => {
      const cells = pl.alive ? E.ownedBy(S, p).length : 0, cl = pl.alive ? E.largestCluster(M, S, p).length : 0;
      return `<div class="pl${p === S.cur && !S.over ? ' cur' : ''}${pl.alive ? '' : ' out'}" title="${esc(pl.name)} · ${cells}칸 · 다음 충전 ${cl}개">` +
        `${dieIcon(pl.style)}${pl.stock ? `<span class="stk">+${pl.stock}</span>` : ''}<span class="num">${cells}<small>충전 ${cl}</small></span><span class="nm">${esc(pl.name)}</span></div>`;
    }).join('');
    const cur = $('#players .cur'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // 가운데 굴리기 판 (굴리는 중이 아닐 때)
  let rolling = false;
  function renderRoll() {
    $('#endBtn').disabled = !myTurn();
    if (rolling) return;
    const rb = $('#rollbar'), pl = S.players[S.cur];
    const names = (a, b) => { const lt = E.linkType(M, S, a, b); return `<div class="rb-names">${esc(cellLabel(a))}<em class="${lt === 'sea' ? 'sea' : ''}">${lt === 'sea' ? '⛴ 뱃길' : '옆'}</em>${esc(cellLabel(b))}</div>`; };
    let h;
    if (S.over) h = '<div class="rb-msg">게임이 끝났어요</div>';
    else if (pl.ai) h = `<div class="rb-msg">🤖 <b>${esc(pl.name)}</b> 차례예요</div>`;
    else if (sel.from != null && sel.to != null) h = names(sel.from, sel.to) + `<button class="roll" id="rollBtn">🎲 주사위 굴리기 <small style="font-weight:600;opacity:.8">${S.dice[sel.from]} : ${S.dice[sel.to]}</small></button>`;
    else if (sel.from != null) h = `<div class="rb-msg"><b>${esc(cellName(sel.from))}</b> (주사위 ${S.dice[sel.from]}개)<small>빨간 테두리로 깜빡이는 이웃 칸을 눌러 공격할 곳을 골라요</small></div>`;
    else if (info != null) h = `<div class="rb-msg"><b>${esc(cellName(info))}</b>의 이웃<small>${G.nb[info].map(j => esc(cellLabel(j))).join(', ')}</small></div>`;
    else h = `<div class="rb-msg"><b>${esc(pl.name)}</b> 차례<small>주사위가 2개 이상인 내 칸을 눌러요</small></div>`;
    rb.innerHTML = h;
  }

  // ---------- 알림 ----------
  let noticeT = 0;
  function flashNotice(msg, ms = 2200) { const n = $('#notice'); n.textContent = msg; n.hidden = false; clearTimeout(noticeT); if (ms) noticeT = setTimeout(() => n.hidden = true, ms); }
  let toastT = 0;
  function toast(html, cls = '', ms = 1100) { const t = $('#toast'); t.className = 'toast ' + cls; t.innerHTML = html; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
  function checkStuck() {
    const eb = $('#endBtn');
    if (myTurn() && !E.anyAttack(M, S)) { flashNotice('더 이상 공격할 수 있는 칸이 없습니다', 0); eb.classList.add('pulse'); }
    else { eb.classList.remove('pulse'); if ($('#notice').textContent.startsWith('더 이상')) $('#notice').hidden = true; }
  }

  // ---------- 공격 연출: 배너 "거제 옆 부산 / 4 : 6" ----------
  const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
  const dieHtml = (v, style, roll) => `<span class="die2${roll ? ' rolling' : ''}${STYLES[style].c === '#E8B500' ? ' dk' : ''}" style="background:${STYLES[style].c}">${PIPS[v].map(([x, y]) => `<i style="left:${x}%;top:${y}%"></i>`).join('')}</span>`;
  const timing = ai => {
    if (!ai) return { roll: 750, hold: 1500, pick: 0 };   // 내 공격은 천천히 읽을 수 있게
    return { normal: { roll: 300, hold: 800, pick: 180 }, fast: { roll: 110, hold: 330, pick: 60 } }[set.speed];
  };
  async function showAttack(res, ai) {
    const tm = timing(ai);
    if (!tm.roll && !tm.hold) return;
    rolling = true;
    const A = cellLabel(res.from), D = cellLabel(res.to), lt = E.linkType(M, S, res.from, res.to);
    const sa = S.players[res.att].style, sd = S.players[res.def].style;
    const rb = $('#rollbar');
    const frame = (roll) => {
      const fa = roll ? res.a.map(() => 1 + Math.floor(Math.random() * 6)) : res.a, fd = roll ? res.d.map(() => 1 + Math.floor(Math.random() * 6)) : res.d;
      const cl = w => roll ? 'wait' : (w ? 'win' : 'lose');
      rb.innerHTML = `<div class="rb-names">${esc(A)}<em class="${lt === 'sea' ? 'sea' : ''}">${lt === 'sea' ? '⛴ 뱃길' : '옆'}</em>${esc(D)}</div>` +
        `<div class="rb-row"><span class="rb-side l"><span class="rb-dice">${fa.map(v => dieHtml(v, sa, roll)).join('')}</span><b class="rb-sum ${cl(res.win)}" style="color:${STYLES[sa].c}">${roll ? '?' : res.aSum}</b></span>` +
        `<span class="rb-vs">:</span><span class="rb-side r"><b class="rb-sum ${cl(!res.win)}" style="color:${STYLES[sd].c}">${roll ? '?' : res.dSum}</b><span class="rb-dice">${fd.map(v => dieHtml(v, sd, roll)).join('')}</span></span></div>`;
    };
    // 굴리는 동안 두 칸을 검게
    gCells.querySelectorAll('.pick').forEach(p => p.classList.remove('pick'));
    [res.from, res.to].forEach(i => { const p = gCells.querySelector(`[data-i="${i}"]`); if (p) p.classList.add('pick'); });
    gHi.textContent = ''; hiPath(res.from, 'hi-from'); hiPath(res.to, 'hi-to');
    const t0 = performance.now();
    while (performance.now() - t0 < tm.roll) { frame(true); SND.tick(); await sleep(70); }
    frame(false);
    // 지도 위 큰 숫자
    gFx.textContent = '';
    const bigNum = (i, v, win, st) => { const lp = M.cells[G.cells[i]].lp; const t = el('text', { class: 'sum sc' + (win ? '' : ' lose'), 'data-x': lp[0], 'data-y': lp[1], fill: mix(STYLES[st].c, .15) }, gFx); t.textContent = v; };
    bigNum(res.from, res.aSum, res.win, sa); bigNum(res.to, res.dSum, !res.win, sd); updateScaled();
    (res.win ? SND.win : SND.lose)();
    await sleep(Math.min(450, tm.hold / 2));
    render();   // 결과 반영된 지도 (주사위가 새 칸으로 떨어짐)
    const pair = `${esc(cellName(res.from))} ${lt === 'sea' ? '⛴' : '옆'} ${esc(cellName(res.to))}`;
    const nbLine = `<small class="nb">${esc(cellLabel(res.to))}의 이웃: ${G.nb[res.to].map(j => esc(cellLabel(j))).join(' · ')}</small>`;
    if (res.win) toast(`${pair} 획득!${nbLine}`, 'ok', tm.hold + 300);
    else toast(`${pair} 방어 성공!${nbLine}`, 'ng', tm.hold + 300);
    await sleep(tm.hold);
    gFx.textContent = '';
    rolling = false;
  }

  async function doAttack(from, to, ai) {
    const res = E.attack(M, S, from, to);
    save();
    sel = { from: null, to: null }; info = null;
    if (timing(ai).roll || timing(ai).hold) await showAttack(res, ai); else render();
    if (res.out != null) { toast(`${esc(S.players[res.out].name)} 탈락`, '', 1100); if (timing(ai).hold) await sleep(900); }
    render();
    return res;
  }

  async function doEnd(ai) {
    const res = E.endTurn(M, S);
    save();
    const tm = timing(ai);
    sel = { from: null, to: null }; info = null;
    render();
    if (tm.hold && res) {
      gHi.textContent = '';
      res.cluster.forEach(i => hiPath(i, 'hi-cl'));
      SND.charge();
      toast(`🎲 주사위 충전! +${res.gain}<small>서로 이어진 가장 큰 땅 ${res.gain}칸${res.stock ? ` · 저장 주사위 ${res.stock}개` : ''}${res.lost ? ` · ${res.lost}개는 넘쳐서 버려요` : ''}</small>`, 'charge', ai ? tm.hold : 1500);
      await sleep(ai ? tm.hold : 1300);
      gHi.textContent = '';
    }
    if (res && res.newRound && !S.over && tm.hold) flashNotice(`라운드 ${S.round} 시작`, 1400);
    return res;
  }

  // ---------- 차례 흐름 ----------
  async function advance() {
    busy = true; render();
    while (S && !S.over && S.players[S.cur].ai) {
      const me = S.cur;
      for (let guard = 0; guard < 500 && !S.over && S.cur === me; guard++) {
        const mv = E.aiMove(M, S);
        if (!mv) break;
        sel = { from: mv[0], to: mv[1] }; render(); busy = true; await sleep(timing(true).pick);
        await doAttack(mv[0], mv[1], true);
      }
      if (S.over) break;
      await doEnd(true);
    }
    busy = false;
    if (!S) return;
    if (S.over) return finish();
    startHumanTurn();
  }

  function startHumanTurn() {
    sel = { from: null, to: null }; info = null;
    const humans = S.players.filter(p => !p.ai && p.alive).length;
    if (humans >= 2) {
      waitingHandoff = true;
      const st = stOf(S.cur);
      $('#handoffIcon').style.background = st.c; $('#handoffIcon').textContent = st.ic;
      $('#handoffName').textContent = S.players[S.cur].name;
      $('#handoff').hidden = false;
    } else toast('내 차례예요!', '', 900);
    render(); checkStuck();
  }
  $('#handoffBtn').onclick = () => { $('#handoff').hidden = true; waitingHandoff = false; SND.tap(); render(); checkStuck(); };

  $('#rollbar').addEventListener('click', async e => {
    if (!e.target.closest('#rollBtn')) return;
    if (!myTurn() || sel.from == null || sel.to == null) return;
    ac(); busy = true; $('#notice').hidden = true;
    await doAttack(sel.from, sel.to, false);
    busy = false;
    if (S.over) return finish();
    render(); checkStuck();
  });
  $('#endBtn').onclick = async () => {
    if (!myTurn()) return;
    $('#endBtn').classList.remove('pulse'); $('#notice').hidden = true;
    busy = true;
    await doEnd(false);
    advance();
  };

  // ---------- 저장 · 이어서 하기 ----------
  function save() { if (S) store(LS.save, S); }
  const savedGame = () => { const s = load(LS.save); return s && s.v === 1 && !s.over && Array.isArray(s.owner) ? s : null; };

  function begin(state) {
    S = state;
    document.body.classList.add('playing');
    $('#hud').hidden = false; $('#speedBtn').hidden = false;
    $('#lobby').hidden = true; $('#result').hidden = true;
    drawMap(); render(); save();
  }

  // ---------- 결과 ----------
  function finish() {
    busy = false; render();
    try { localStorage.removeItem(LS.save); } catch (e) { }
    const rows = E.standings(M, S);
    $('#rTitle').textContent = S.endReason === 'all' ? `🏆 ${S.players[rows[0].p].name}님이 모든 칸을 차지했어요!` : S.endReason === 'quit' ? `🏳️ ${S.round}라운드에서 그만했어요` : `🏁 ${S.maxRound}라운드 끝!`;
    $('#rSub').textContent = `${G.preset.name} · ${G.cells.length}칸 · 주사위 ${S.cap}개 모드`;
    $('#ranks').innerHTML = rows.map(r => {
      const [hz, ds] = TITLE_TXT[r.title];
      return `<div class="rrow${r.rank === 1 ? ' first' : ''}"><span class="rk">${r.rank}등</span>${icon(r.p)}<span class="nm">${esc(r.name)}${r.ai ? ' 🤖' : ''}<small>${r.alive ? `${r.cells}칸 · 주사위 ${r.dice}개` : '탈락'}</small></span>` +
        `<span class="ttl">${ds}</span></div>`;
    }).join('');
    const humans = S.players.map((p, i) => [p, i]).filter(([p]) => !p.ai);
    $('#gots').innerHTML = humans.map(([p, i]) => {
      const names = p.got.map(c => M.cells[G.cells[c]].name);
      return `<div class="got"><h4>${icon(i, 'sm')} ${esc(p.name)}님이 차지했던 지역 (${names.length}곳)</h4>${names.length ? `<div class="chips">${names.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : '<div class="none">공격으로 차지한 곳이 없어요</div>'}</div>`;
    }).join('');
    $('#result').hidden = false;
    SND.win();
  }
  $('#rMap').onclick = () => { $('#result').hidden = true; };
  $('#rAgain').onclick = () => { $('#result').hidden = true; openLobby(); };

  // ---------- 로비 ----------
  const lob = Object.assign({ preset: 'all', n: 4, h: 1, cap: 5, rounds: 10, names: ['플레이어1', '플레이어2', '플레이어3', '플레이어4', '플레이어5', '플레이어6', '플레이어7', '플레이어8'], styles: [0, 1, 2, 3, 4, 5, 6, 7] }, load(LS.lobby) || {});
  if (![5, 10, 15].includes(lob.rounds)) lob.rounds = 10;
  const presetCount = id => E.buildGraph(M, id).cells.length;
  function renderLobby() {
    const btn = p => `<button data-p="${p.id}" class="${p.id === lob.preset ? 'sel' : ''}">${p.name}<small>${presetCount(p.id)}칸</small></button>`;
    $('#mapSeg').innerHTML = E.PRESETS.filter(p => !p.group).map(btn).join('');
    $('#mapSeg2').innerHTML = E.PRESETS.filter(p => p.group === 'prov').map(btn).join('');
    const maxN = E.maxPlayers(presetCount(lob.preset));
    lob.n = Math.min(lob.n, maxN);
    $('#nSeg').innerHTML = [4, 5, 6, 7, 8].map(n => `<button data-n="${n}" class="${n === lob.n ? 'sel' : ''}"${n > maxN ? ' disabled title="칸이 적어서 이 지도는 ' + maxN + '명까지"' : ''}>${n}명</button>`).join('');
    $('#nNote').textContent = maxN < 8 ? `이 지도는 칸이 적어서 ${maxN}명까지 할 수 있어요` : '';
    lob.h = Math.min(lob.h, lob.n);
    $('#hSeg').innerHTML = Array.from({ length: lob.n }, (_, i) => i + 1).map(h => `<button data-h="${h}" class="${h === lob.h ? 'sel' : ''}">${h}</button>`).join('');
    let ai = 0;
    $('#plist').innerHTML = Array.from({ length: lob.n }, (_, i) => {
      const st = STYLES[lob.styles[i]], human = i < lob.h;
      const nm = human ? lob.names[i] : `AI ${++ai}`;
      return `<div class="prow${human ? ' human' : ''}"><button class="sw" data-sw="${i}" title="${st.name} (눌러서 바꾸기)">${dieIcon(lob.styles[i])}</button>` +
        `<input data-nm="${i}" maxlength="8" value="${esc(nm)}" ${human ? 'placeholder="이름을 써 주세요"' : 'disabled'} aria-label="닉네임">${human ? '<span class="who">✏️</span>' : '<span class="who">🤖</span>'}</div>`;
    }).join('');
    $('#capSeg').querySelectorAll('button').forEach(b => b.classList.toggle('sel', +b.dataset.cap === lob.cap));
    $('#roundSeg').querySelectorAll('button').forEach(b => b.classList.toggle('sel', +b.dataset.r === lob.rounds));
    $('#resumeBtn').hidden = !savedGame();
  }
  $('#lobby').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p) lob.preset = b.dataset.p;
    else if (b.dataset.n) lob.n = +b.dataset.n;
    else if (b.dataset.h) lob.h = +b.dataset.h;
    else if (b.dataset.cap) lob.cap = +b.dataset.cap;
    else if (b.dataset.r) lob.rounds = +b.dataset.r;
    else if (b.dataset.sw) {   // 다른 사람이 안 쓰는 다음 색으로
      const i = +b.dataset.sw, used = new Set(lob.styles.slice(0, lob.n).filter((_, k) => k !== i));
      let s = lob.styles[i]; do { s = (s + 1) % STYLES.length; } while (used.has(s));
      // 화면에 안 보이는 자리(인원 밖)가 그 색을 쓰고 있으면 맞바꾸기
      const j = lob.styles.indexOf(s); if (j >= lob.n) lob.styles[j] = lob.styles[i];
      lob.styles[i] = s;
    } else return;
    SND.tap(); store(LS.lobby, lob); renderLobby();
  });
  $('#lobby').addEventListener('input', e => { if (e.target.dataset.nm != null) { lob.names[+e.target.dataset.nm] = e.target.value; store(LS.lobby, lob); } });

  function openLobby() {
    renderLobby(); $('#lobby').hidden = false;
  }
  function askConfirm(msg, yes = '새로 시작', no = '아니요') {
    return new Promise(res => {
      $('#confirmMsg').innerHTML = msg; $('#confirmYes').textContent = yes; $('#confirmNo').textContent = no; $('#confirmNo').hidden = !no;
      $('#confirm').hidden = false;
      $('#confirmYes').onclick = () => { $('#confirm').hidden = true; res(true); };
      $('#confirmNo').onclick = () => { $('#confirm').hidden = true; res(false); };
    });
  }
  $('#startBtn').onclick = async () => {
    ac();
    if (savedGame() && !(await askConfirm('진행 중인 게임 기록이 사라집니다.<br>새로 시작할까요?'))) return;
    let ai = 0;
    const players = Array.from({ length: lob.n }, (_, i) => i < lob.h
      ? { name: (lob.names[i] || '').trim() || `플레이어${i + 1}`, style: lob.styles[i], ai: false }
      : { name: `AI ${++ai}`, style: lob.styles[i], ai: true });
    const s = E.newGame(M, { preset: lob.preset, cap: lob.cap, rounds: lob.rounds, players });
    begin(s);
    // 차례 순서 보여 주기 (4.1)
    const list = s.players.map((p, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><b style="width:2.2em">${i + 1}번</b><span class="dic">${dieIcon(p.style)}</span><span style="font-weight:700">${esc(p.name)}</span>${p.bonus ? `<small style="color:#8a96a3;margin-left:auto">후공 보정 주사위 +${p.bonus}</small>` : ''}</div>`).join('');
    await askConfirm(`<div style="font-size:18px;margin-bottom:6px">🎲 차례 순서</div>${list}`, '시작!', '');
    advance();
  };
  $('#resumeBtn').onclick = () => { ac(); const s = savedGame(); if (!s) return renderLobby(); begin(s); advance(); };
  $('#brand').onclick = () => { if (!S || S.over) openLobby(); };

  // ---------- 메뉴 ----------
  function syncMenu() {
    $('#labelSeg').querySelectorAll('button').forEach(b => b.classList.toggle('sel', (b.dataset.l === '1') === set.labels));
    $('#speedSeg').querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.s === set.speed));
    $('#sndSeg').querySelectorAll('button').forEach(b => b.classList.toggle('sel', (b.dataset.snd === '1') === set.sound));
    $('#soundBtn').innerHTML = set.sound ? '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M3 3l18 18"/></svg>';
    if (S) renderHud();
  }
  $('#menuBtn').onclick = () => { syncMenu(); $('#menu').hidden = false; };
  $('#menuClose').onclick = () => { $('#menu').hidden = true; };
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.l) set.labels = b.dataset.l === '1';
    else if (b.dataset.s) set.speed = b.dataset.s;
    else if (b.dataset.snd) set.sound = b.dataset.snd === '1';
    else return;
    saveSet(); syncMenu(); if (S) renderNames();
  });
  $('#soundBtn').onclick = () => { set.sound = !set.sound; saveSet(); syncMenu(); };
  $('#speedBtn').onclick = () => { set.speed = set.speed === 'normal' ? 'fast' : 'normal'; saveSet(); syncMenu(); };
  $('#toLobby').onclick = () => { $('#menu').hidden = true; save(); openLobby(); };
  $('#quitBtn').onclick = async () => {
    $('#menu').hidden = true;
    if (!S || S.over) return;
    if (!(await askConfirm('게임을 그만할까요?<br><small style="font-weight:500;color:#5b6672">지금까지의 땅으로 등수를 보여 줄게요.</small>', '그만하기', '계속하기'))) return;
    E.quit(S); busy = false; finish();
  };

  // ---------- 시작 ----------
  makePatterns(); syncMenu();
  $('#loading').hidden = true;
  // 로비 뒤에도 지도가 보이게: 미리보기용 판
  S = E.newGame(M, { preset: savedGame() ? savedGame().preset : lob.preset, cap: 5, seed: 7, players: [0, 1, 2, 3].map(i => ({ name: '', style: i, ai: true })) });
  drawMap(); render(); S = null;
  gBadges.textContent = ''; gCells.querySelectorAll('path').forEach(p => p.setAttribute('fill', '#f7f3e8'));
  openLobby();
  window.__dicek = { get S() { return S; }, E, M, view };   // 테스트용
})();
