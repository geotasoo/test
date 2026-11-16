// dice-k 게임 엔진: 화면 없이 규칙만 (브라우저와 node 모두에서 동작)
// 작업지시서 v3.2 기준. 지도는 '맵 팩'(data/kr161.js)으로 받아서 특정 지도에 묶이지 않음 → dice-w에서 그대로 재사용.
(function (root) {
  'use strict';

  // ---------- 설정 상수 ----------
  const CFG = {
    rounds: 15,            // 4.5 라운드 수
    stockMax: 64,          // 4.3 저장 주사위 상한
    startDicePerCell: 2,   // 4.1 초기 주사위 = 보유 칸 × 2
    smallMap: 50,          // 2.4 소형 맵 기준 (칸 수 미만)
    bonus: {               // 4.4 후공 보정 (순번별 시작 보너스 주사위)
      4: [0, 1, 2, 3], 5: [0, 1, 2, 3, 4], 6: [0, 1, 1, 2, 3, 4],
      7: [0, 1, 1, 2, 2, 3, 4], 8: [0, 1, 1, 2, 2, 3, 3, 4],
    },
    titles: {              // 4.6 등수 칭호
      4: '수우미가', 5: '수우미양가', 6: '수우우미양가', 7: '수우우미미양가', 8: '수우우미미양양가',
    },
  };

  // ---------- 맵 프리셋 (2.4) ----------
  const PRESETS = [
    { id: 'all', name: '전국', regions: ['capital', 'chungcheong', 'gangwon', 'honam', 'yeongnam', 'jeju'] },
    { id: 'capital', name: '수도권', regions: ['capital'] },
    { id: 'cap-chung', name: '수도충청', regions: ['capital', 'chungcheong'] },
    { id: 'cap-gang', name: '수도강원', regions: ['capital', 'gangwon'] },
    { id: 'chung-honam-jeju', name: '충청호남제주', regions: ['chungcheong', 'honam', 'jeju'] },
    { id: 'chung-yeong', name: '충청영남', regions: ['chungcheong', 'yeongnam'] },
    { id: 'chung-gang', name: '충청강원', regions: ['chungcheong', 'gangwon'] },
    { id: 'gang-yeong', name: '강원영남', regions: ['gangwon', 'yeongnam'] },
    { id: 'yeong-honam-jeju', name: '영남호남제주', regions: ['yeongnam', 'honam', 'jeju'] },
    // 도 하나 (특별·광역시는 빠짐)
    { id: 'p-gg', name: '경기', group: 'prov', provs: ['경기'] },
    { id: 'p-gw', name: '강원', group: 'prov', provs: ['강원'] },
    { id: 'p-gb', name: '경북', group: 'prov', provs: ['경북'] },
    { id: 'p-gn', name: '경남', group: 'prov', provs: ['경남'] },
    { id: 'p-jb', name: '전북', group: 'prov', provs: ['전북'] },
    { id: 'p-jn', name: '전남', group: 'prov', provs: ['전남'] },
  ];
  const maxPlayers = n => Math.max(4, Math.min(8, Math.floor(n / 3)));   // 칸이 적은 맵은 인원 제한 (1인당 3칸 이상)

  // ---------- 난수 (판 상태에 저장 → 새로고침해도 같은 결과) ----------
  function rand(s) {   // mulberry32, s.rng 를 갱신
    let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rint = (s, n) => Math.floor(rand(s) * n);
  function shuffle(s, a) { for (let i = a.length - 1; i > 0; i--) { const j = rint(s, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------- 맵 팩 → 프리셋에 맞는 그래프 ----------
  // 반환: { cells: [원본 칸 번호...], nb: [[이웃 로컬 번호...]], link: {"i-j": 'sea'|'bridge'} }
  function buildGraph(pack, presetId) {
    const pre = PRESETS.find(p => p.id === presetId) || PRESETS[0];
    const cells = [];
    const local = new Map();
    const inMap = c => pre.provs ? pre.provs.includes(c.provShort) : pre.regions.includes(c.region);
    pack.cells.forEach((c, i) => { if (inMap(c)) { local.set(i, cells.length); cells.push(i); } });
    const nb = cells.map(() => []);
    const link = {};
    const add = (a, b, type) => {
      if (!local.has(a) || !local.has(b)) return;     // 맵에 없는 칸과 이어진 연결은 비활성
      const i = local.get(a), j = local.get(b);
      if (!nb[i].includes(j)) { nb[i].push(j); nb[j].push(i); }
      if (type === 'sea') link[Math.min(i, j) + '-' + Math.max(i, j)] = 'sea';
    };
    pack.adjacency.forEach(([a, b]) => add(a, b, 'land'));
    pack.links.forEach(l => add(l.a, l.b, l.type));
    return { preset: pre, cells, nb, link };
  }

  // ---------- 새 게임 ----------
  // cfg: { preset, cap: 5|8, players: [{ name, style, ai }], seed? }
  function newGame(pack, cfg) {
    const g = buildGraph(pack, cfg.preset);
    const n = cfg.players.length;
    const s = {
      v: 1, preset: g.preset.id, cap: cfg.cap === 8 ? 8 : 5,
      rng: (cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 2 ** 31)) | 0,
      round: 1, maxRound: [5, 10, 15].includes(cfg.rounds) ? cfg.rounds : CFG.rounds, cur: 0, over: false,
      players: [], owner: [], dice: [], log: [], turnAttacks: 0,
    };
    // 1. 순서 섞기
    const order = shuffle(s, cfg.players.map((p, i) => i));
    s.players = order.map((k, i) => ({
      name: cfg.players[k].name, style: cfg.players[k].style, ai: !!cfg.players[k].ai,
      seat: i, alive: true, stock: 0, outAt: null, got: [],
    }));
    // 2. 칸 나누기: 균등, 남는 칸은 뒷순번부터 1칸씩
    const N = g.cells.length, base = Math.floor(N / n), extra = N % n;
    const quota = s.players.map((p, i) => base + (i >= n - extra ? 1 : 0));
    const pool = shuffle(s, g.cells.map((c, i) => i));
    let k = 0;
    s.owner = new Array(N); s.dice = new Array(N).fill(1);
    quota.forEach((q, p) => { for (let t = 0; t < q; t++) s.owner[pool[k++]] = p; });
    // 3. 초기 주사위(칸 × 2) + 후공 보정
    const small = N < CFG.smallMap;
    const bonusRow = CFG.bonus[n] || new Array(n).fill(0);
    s.players.forEach((pl, p) => {
      const mine = ownedBy(s, p);
      let b = bonusRow[p] || 0;
      if (small) b = Math.ceil(b / 2);
      pl.bonus = b;
      let left = mine.length * (CFG.startDicePerCell - 1) + b;   // 칸마다 1개는 이미 있음
      scatter(s, mine, left);
    });
    s.mapCells = g.cells;   // 원본 칸 번호 (화면용)
    return s;
  }

  // 남는 주사위를 빈자리에 랜덤으로 1개씩. 못 놓은 개수 반환
  function scatter(s, mine, count) {
    let left = count;
    while (left > 0) {
      const room = mine.filter(i => s.dice[i] < s.cap);
      if (!room.length) break;
      s.dice[room[rint(s, room.length)]]++; left--;
    }
    return left;
  }

  const ownedBy = (s, p) => { const r = []; for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === p) r.push(i); return r; };

  // ---------- 그래프 도우미 (그래프는 저장하지 않고 다시 만듦) ----------
  function graphOf(pack, s) { if (!s._g || s._g.preset.id !== s.preset) Object.defineProperty(s, '_g', { value: buildGraph(pack, s.preset), writable: true, configurable: true }); return s._g; }

  function largestCluster(pack, s, p) {
    const { nb } = graphOf(pack, s);
    const seen = new Set(); let best = [];
    for (let i = 0; i < s.owner.length; i++) {
      if (s.owner[i] !== p || seen.has(i)) continue;
      const comp = [i]; seen.add(i);
      for (let h = 0; h < comp.length; h++) for (const j of nb[comp[h]]) if (s.owner[j] === p && !seen.has(j)) { seen.add(j); comp.push(j); }
      if (comp.length > best.length) best = comp;
    }
    return best;
  }

  const canAttackFrom = (pack, s, i) => s.owner[i] === s.cur && s.dice[i] >= 2 && graphOf(pack, s).nb[i].some(j => s.owner[j] !== s.cur);
  const targetsOf = (pack, s, i) => canAttackFrom(pack, s, i) ? graphOf(pack, s).nb[i].filter(j => s.owner[j] !== s.cur) : [];
  function anyAttack(pack, s) { for (let i = 0; i < s.owner.length; i++) if (canAttackFrom(pack, s, i)) return true; return false; }
  const linkType = (pack, s, i, j) => graphOf(pack, s).link[Math.min(i, j) + '-' + Math.max(i, j)] || 'land';

  // ---------- 공격 (4.2) ----------
  function attack(pack, s, from, to) {
    if (s.over) throw new Error('끝난 게임');
    if (!targetsOf(pack, s, from).includes(to)) throw new Error('공격할 수 없는 칸');
    const att = s.cur, def = s.owner[to];
    const a = Array.from({ length: s.dice[from] }, () => 1 + rint(s, 6));
    const d = Array.from({ length: s.dice[to] }, () => 1 + rint(s, 6));
    const aSum = a.reduce((x, y) => x + y, 0), dSum = d.reduce((x, y) => x + y, 0);
    const win = aSum > dSum;   // 동점은 방어 성공
    const res = { from, to, att, def, a, d, aSum, dSum, win, moved: 0, out: null };
    if (win) {
      res.moved = s.dice[from] - 1;
      s.owner[to] = att; s.dice[to] = s.dice[from] - 1; s.dice[from] = 1;
      if (!s.players[att].got.includes(to)) s.players[att].got.push(to);
      if (!s.owner.includes(def)) { s.players[def].alive = false; s.players[def].outAt = s.log.length; res.out = def; }
      if (s.owner.every(o => o === att)) { s.over = true; s.endReason = 'all'; }
    } else {
      s.dice[from] = 1;
    }
    s.turnAttacks++;
    s.log.push({ t: 'atk', r: s.round, p: att, from, to, aSum, dSum, win });
    return res;
  }

  // ---------- 차례 끝내기 → 주사위 충전 (4.3) → 다음 차례 ----------
  function endTurn(pack, s) {
    if (s.over) return null;
    const p = s.cur, pl = s.players[p];
    const cl = largestCluster(pack, s, p);
    const gain = cl.length;
    const mine = ownedBy(s, p);
    const before = s.dice.slice();
    const total = pl.stock + gain;
    let left = scatter(s, mine, total);
    const lost = Math.max(0, left - CFG.stockMax);
    pl.stock = Math.min(left, CFG.stockMax);
    const added = mine.filter(i => s.dice[i] > before[i]).map(i => [i, s.dice[i] - before[i]]);
    const res = { p, gain, cluster: cl, added, stock: pl.stock, lost };
    s.log.push({ t: 'end', r: s.round, p, gain, stock: pl.stock });
    // 다음 살아 있는 플레이어
    let nx = p;
    do {
      nx = (nx + 1) % s.players.length;
      if (nx === 0) s.round++;
    } while (!s.players[nx].alive);
    if (s.round > s.maxRound) { s.over = true; s.endReason = 'rounds'; s.round = s.maxRound; }
    s.cur = nx; s.turnAttacks = 0;
    res.next = nx; res.newRound = !s.over && nx <= p;
    return res;
  }

  // ---------- 등수 (4.5) · 칭호 (4.6) ----------
  function standings(pack, s) {
    const n = s.players.length;
    const rows = s.players.map((pl, p) => {
      const mine = ownedBy(s, p);
      return { p, name: pl.name, style: pl.style, ai: pl.ai, alive: pl.alive, outAt: pl.outAt,
        cells: mine.length, dice: mine.reduce((t, i) => t + s.dice[i], 0), stock: pl.stock,
        cluster: pl.alive ? largestCluster(pack, s, p).length : 0 };
    });
    rows.sort((x, y) => (y.alive - x.alive) || (x.alive ? (y.cells - x.cells) || (y.dice - x.dice) : (y.outAt - x.outAt)));
    const titles = CFG.titles[n] || CFG.titles[8];
    rows.forEach((r, k) => {
      const prev = rows[k - 1];
      const tie = prev && r.alive && prev.alive && prev.cells === r.cells && prev.dice === r.dice;
      r.rank = tie ? prev.rank : k + 1;
      r.title = titles[r.rank - 1];
    });
    return rows;
  }

  // ---------- AI: 단순 탐욕 (6.1) ----------
  // 다음에 할 공격 [from, to] 또는 null(차례 끝)
  function aiMove(pack, s) {
    const { nb } = graphOf(pack, s);
    const me = s.cur;
    const cl = new Set(largestCluster(pack, s, me));
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < s.owner.length; i++) {
      if (!canAttackFrom(pack, s, i)) continue;
      for (const j of nb[i]) {
        if (s.owner[j] === me) continue;
        const a = s.dice[i], d = s.dice[j];
        if (!(a > d || (a === d && a === s.cap))) continue;
        let score = (a - d) * 2;
        // 내 큰 덩어리를 이어 주거나 키우는 공격 우선
        const myNb = nb[j].filter(k => s.owner[k] === me);
        if (myNb.some(k => !cl.has(k)) && cl.has(i)) score += 6;   // 떨어진 내 땅과 이어짐
        score += myNb.length;
        // 빼앗은 칸이 바로 다시 위험해지지 않게: 그 칸 이웃 적 주사위가 크면 감점
        const threat = Math.max(0, ...nb[j].filter(k => s.owner[k] !== me && s.owner[k] !== s.owner[j]).map(k => s.dice[k]));
        score -= Math.max(0, threat - (a - 1)) * 0.7;
        score += rand(s) * 0.5;
        if (score > bestScore) { bestScore = score; best = [i, j]; }
      }
    }
    return best;
  }

  // 게임 그만하기: 지금 상태로 끝내고 등수 매기기
  function quit(s) { s.over = true; s.endReason = 'quit'; }

  const api = { CFG, PRESETS, maxPlayers, quit, buildGraph, newGame, attack, endTurn, standings, aiMove, largestCluster, canAttackFrom, targetsOf, anyAttack, linkType, ownedBy, graphOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DiceK = api;
})(typeof window !== 'undefined' ? window : globalThis);
