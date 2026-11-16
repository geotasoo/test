// 밸런스 시뮬레이션 (작업지시서 7장): AI끼리 자동 대전, 순번별 승률
// node tools/sim.js [판 수=300] [맵=all] [인원=4,5,6,7,8] [모드=5]
const E = require('../engine.js');
if (process.env.BONUS) Object.assign(E.CFG.bonus, JSON.parse(process.env.BONUS));   // 예: BONUS='{"4":[0,2,4,6]}'
const M = require('../data/kr161.js');
const [games = 300, preset = 'all', ns = '4,5,6,7,8', cap = '5'] = process.argv.slice(2);

for (const n of ns.split(',').map(Number)) {
  const wins = new Array(n).fill(0); let rounds = 0, early = 0;
  for (let g = 0; g < +games; g++) {
    const s = E.newGame(M, { preset, cap: +cap, seed: g * 7919 + n, players: Array.from({ length: n }, (_, i) => ({ name: 'AI' + i, style: i, ai: true })) });
    // 순번 효과만 보려고 자리 번호 = 순번
    let guard = 0;
    while (!s.over && guard++ < 100000) {
      const mv = E.aiMove(M, s);
      if (mv) E.attack(M, s, mv[0], mv[1]); else E.endTurn(M, s);
    }
    const st = E.standings(M, s);
    st.filter(r => r.rank === 1).forEach(r => wins[r.p] += 1 / st.filter(x => x.rank === 1).length);
    rounds += s.round; if (s.endReason === 'all') early++;
  }
  const pct = wins.map(w => (100 * w / games).toFixed(1));
  const spread = Math.max(...pct) - Math.min(...pct);
  console.log(`${preset} ${n}명 주사위${cap}개 | 순번별 1등 비율(%): ${pct.join(' / ')} | 차이 ${spread.toFixed(1)}%p | 평균 라운드 ${(rounds / games).toFixed(1)} | 15라운드 전 끝남 ${early}판`);
}
