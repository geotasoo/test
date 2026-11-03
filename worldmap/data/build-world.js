const fs=require('fs');const {topology}=require('topojson-server');const S=require('topojson-simplify');
const C=JSON.parse(fs.readFileSync('ne_50m_admin_0_countries.geojson'));
const L=JSON.parse(fs.readFileSync('ne_50m_lakes.geojson'));
const CONT={'Asia':'아시아','Europe':'유럽','Africa':'아프리카','North America':'북아메리카','South America':'남아메리카','Oceania':'오세아니아','Antarctica':'남극'};
const SEVEN={MDV:'Asia',MUS:'Africa',SYC:'Africa',IOT:'Asia',SHN:'Africa',ATF:'Africa',HMD:'Oceania',SGS:'South America'};
// 교과서 표기에 맞춘 한국어 이름 (필요하면 여기만 고치면 됨)
const KO={CHN:'중국',PRK:'북한',TWN:'타이완',THA:'타이',TUR:'튀르키예',VAT:'바티칸',ZAF:'남아프리카 공화국',DMA:'도미니카 연방',
 COD:'콩고 민주 공화국',COG:'콩고',CAF:'중앙아프리카 공화국',DOM:'도미니카 공화국',NCL:'뉴칼레도니아',KAS:'시아첸 빙하',
 MKD:'북마케도니아',FSM:'미크로네시아',ATF:'프랑스령 남방 지역',CYN:'북키프로스',SOL:'소말릴란드',PSX:'팔레스타인'};
const typ=t=>t==='Sovereign country'||t==='Country'?'S':t==='Dependency'?'D':t==='Indeterminate'?'I':t==='Disputed'?'X':'O';
C.features.forEach(f=>{const p=f.properties;
 f.id=p.ADM0_A3;
 f.properties={ko:KO[p.ADM0_A3]||p.NAME_KO,en:p.NAME,c:CONT[SEVEN[p.ADM0_A3]||p.CONTINENT]||'',t:typ(p.TYPE),sov:p.SOV_A3,lx:+p.LABEL_X.toFixed(2),ly:+p.LABEL_Y.toFixed(2),ml:p.MIN_LABEL};
});
L.features.forEach((f,i)=>{const p=f.properties;f.properties={ko:p.name_ko||'',en:p.name||'',r:p.scalerank};});
const minW=+(process.argv[2]||0);
let topo=topology({countries:C,lakes:L});
const pts=t=>t.arcs.reduce((s,a)=>s+a.length,0);
const before=pts(topo);
if(minW>0){topo=S.presimplify(topo);
 const tc=require('topojson-client'),d3g=require('d3-geo');
 const idx=a=>a<0?~a:a;const walk=(x,cb)=>Array.isArray(x)?x.forEach(y=>walk(y,cb)):cb(x);
 let prot=0;topo.objects.countries.geometries.forEach(g=>{const f=tc.feature(topo,g);if(d3g.geoArea(f)<2e-5){prot++;walk(g.arcs,a=>{topo.arcs[idx(a)].forEach(p=>p[2]=Infinity)})}});
 console.log('protected',prot);
 topo=S.simplify(topo,minW);}
topo.arcs=topo.arcs.map(a=>a.map(p=>[p[0],p[1]]));if(minW>0){delete topo.transform;}topo=require('topojson-client').quantize(topo,1e5);
fs.writeFileSync(process.argv[3]||'world.json',JSON.stringify(topo));
console.log('points',before,'->',pts(topo),'size',(fs.statSync(process.argv[3]||'world.json').size/1024).toFixed(0),'KB');
