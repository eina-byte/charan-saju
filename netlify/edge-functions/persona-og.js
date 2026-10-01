// 링크가 카카오톡/X 등으로 공유될 때, 그 사람 생년월일(URL 쿼리)에 맞는
// 추구미 결과 썸네일이 뜨도록 og:image / twitter:image 메타 태그를 그 자리에서
// 바꿔치기해요. 크롤러는 자바스크립트를 실행하지 않기 때문에, 브라우저에서
// 계산하는 사주 로직을 여기(엣지)에도 똑같이 하나 두고 서버 쪽에서 미리
// 계산해요. 실제 페이지(HTML) 자체는 그대로 두고 메타 태그 2~3개만 살짝
// 바꿔서 돌려주기 때문에 앱 동작에는 전혀 영향이 없어요.
import { HTMLRewriter } from "https://ghuc.cc/worker-tools/html-rewriter/index.ts";

/* ---------- charan-saju.html의 사주 계산 로직과 100% 동일 (그대로 이식) ---------- */
var STEMS = ["갑","을","병","정","무","기","경","신","임","계"];
var BRANCHES = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
var STEM_EL = ["목","목","화","화","토","토","금","금","수","수"];
var BRANCH_EL = ["수","토","목","목","토","화","화","토","금","금","토","수"];
var EL_KEYS = ["목","화","토","금","수"];

function jdn(Y,M,D){
  var a = Math.floor((14-M)/12);
  var y = Y+4800-a;
  var m = M+12*a-3;
  return D + Math.floor((153*m+2)/5) + 365*y + Math.floor(y/4) - Math.floor(y/100) + Math.floor(y/400) - 32045;
}
function dayPillar(Y,M,D){
  var idx = ((jdn(Y,M,D)+49) % 60 + 60) % 60;
  return { stem: idx%10, branch: idx%12 };
}
function deg2rad(d){ return d*Math.PI/180; }
function normDeg(d){ d = d % 360; return d < 0 ? d+360 : d; }
function solarLongitude(jd){
  var T = (jd - 2451545.0) / 36525;
  var L0 = normDeg(280.46646 + 36000.76983*T + 0.0003032*T*T);
  var M = normDeg(357.52911 + 35999.05029*T - 0.0001537*T*T);
  var Mr = deg2rad(M);
  var C = (1.914602 - 0.004817*T - 0.000014*T*T) * Math.sin(Mr)
        + (0.019993 - 0.000101*T) * Math.sin(2*Mr)
        + 0.000289 * Math.sin(3*Mr);
  var trueLong = L0 + C;
  var omega = 125.04 - 1934.136*T;
  var lambda = trueLong - 0.00569 - 0.00478*Math.sin(deg2rad(omega));
  return normDeg(lambda);
}
function angDiffDeg(target, current){
  var d = (target - current) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function solarTermJD(termDeg, guessY, guessM, guessD){
  var jd = jdn(guessY, guessM, guessD);
  for (var i=0;i<8;i++){
    var diff = angDiffDeg(termDeg, solarLongitude(jd));
    jd += diff/0.9856;
  }
  return jd;
}
var SOLAR_TERMS = [
  {deg:285, branch:1, gm:1, gd:6},
  {deg:315, branch:2, gm:2, gd:4},
  {deg:345, branch:3, gm:3, gd:6},
  {deg:15,  branch:4, gm:4, gd:5},
  {deg:45,  branch:5, gm:5, gd:6},
  {deg:75,  branch:6, gm:6, gd:6},
  {deg:105, branch:7, gm:7, gd:7},
  {deg:135, branch:8, gm:8, gd:8},
  {deg:165, branch:9, gm:9, gd:8},
  {deg:195, branch:10,gm:10,gd:8},
  {deg:225, branch:11,gm:11,gd:7},
  {deg:255, branch:0, gm:12,gd:7}
];
function solarTermsOfYear(Y){
  return SOLAR_TERMS.map(function(t){
    return { branch:t.branch, jd: solarTermJD(t.deg, Y, t.gm, t.gd) };
  });
}
var DST_PERIODS = [
  [1948,6,1, 1948,9,13],[1949,4,3, 1949,9,11],[1950,4,1, 1950,9,10],
  [1951,5,6, 1951,9,9], [1955,5,5, 1955,9,9], [1956,5,20,1956,9,30],
  [1957,5,5, 1957,9,22],[1958,5,4, 1958,9,21],[1959,5,3, 1959,9,20],
  [1960,5,1, 1960,9,18],[1987,5,10,1987,10,11],[1988,5,8, 1988,10,9]
];
function dCmp(y1,m1,d1,y2,m2,d2){
  if (y1!==y2) return y1-y2;
  if (m1!==m2) return m1-m2;
  return d1-d2;
}
function isDstDate(y,m,d){
  for (var i=0;i<DST_PERIODS.length;i++){
    var p = DST_PERIODS[i];
    if (dCmp(y,m,d,p[0],p[1],p[2])>=0 && dCmp(y,m,d,p[3],p[4],p[5])<0) return true;
  }
  return false;
}
function stdUtcOffsetHours(y,m,d){
  if (dCmp(y,m,d,1954,3,21)>=0 && dCmp(y,m,d,1961,8,10)<0) return 8.5;
  return 9;
}
function shiftDate(y,m,d,deltaDays){
  var dt = new Date(Date.UTC(y,m-1,d));
  dt.setUTCDate(dt.getUTCDate()+deltaDays);
  return { y:dt.getUTCFullYear(), m:dt.getUTCMonth()+1, d:dt.getUTCDate() };
}
function toLocalStandardTime(y,m,d,hh,mm){
  if (!isDstDate(y,m,d)) return { y:y,m:m,d:d,hh:hh,mm:mm };
  var total = hh*60+mm-60;
  if (total < 0){
    total += 24*60;
    var s = shiftDate(y,m,d,-1);
    y=s.y; m=s.m; d=s.d;
  }
  return { y:y,m:m,d:d, hh:Math.floor(total/60), mm: total%60 };
}
function stdToUtJD(std){
  var offset = stdUtcOffsetHours(std.y,std.m,std.d);
  var utHour = std.hh + std.mm/60 - offset;
  return jdn(std.y,std.m,std.d) + (utHour-12)/24;
}
var TRUE_SOLAR_CORRECTION_MIN = -32;
function toTrueSolarTime(y,m,d,hh,mm){
  var std = toLocalStandardTime(y,m,d,hh,mm);
  var total = std.hh*60 + std.mm + TRUE_SOLAR_CORRECTION_MIN;
  var yy=std.y, mo=std.m, dd=std.d;
  if (total < 0){
    total += 24*60;
    var s1 = shiftDate(yy,mo,dd,-1); yy=s1.y; mo=s1.m; dd=s1.d;
  } else if (total >= 24*60){
    total -= 24*60;
    var s2 = shiftDate(yy,mo,dd,1); yy=s2.y; mo=s2.m; dd=s2.d;
  }
  return { y:yy, m:mo, d:dd, hh:Math.floor(total/60), mm: total%60 };
}
function yearPillar(utJD, y){
  var ipchun = solarTermJD(315, y, 2, 4);
  var yy = (utJD < ipchun) ? y-1 : y;
  var stem = ((yy-4)%10+10)%10;
  var branch = ((yy-4)%12+12)%12;
  return { stem:stem, branch:branch };
}
function monthBranchFor(utJD, y){
  var terms = solarTermsOfYear(y-1).concat(solarTermsOfYear(y));
  terms.sort(function(a,b){ return a.jd-b.jd; });
  var branch = terms[0].branch;
  for (var i=0;i<terms.length;i++){
    if (terms[i].jd <= utJD) branch = terms[i].branch; else break;
  }
  return branch;
}
var MONTH_GROUP_START = {0:2,5:2,1:4,6:4,2:6,7:6,3:8,8:8,4:0,9:0};
function monthPillar(utJD, y, yearStem){
  var branch = monthBranchFor(utJD, y);
  var startStem = MONTH_GROUP_START[yearStem];
  var branchOrder = ((branch-2+12)%12);
  var stem = (startStem+branchOrder)%10;
  return { stem:stem, branch:branch };
}
function hourBranchFor(hh,mm){
  var t = hh + mm/60;
  if (t>=23 || t<1) return 0;
  var idx = Math.floor((t-1)/2)+1;
  return idx%12;
}
var HOUR_GROUP_START = {0:0,5:0,1:2,6:2,2:4,7:4,3:6,8:6,4:8,9:8};
function hourPillar(dayStemIdx,hh,mm){
  var branch = hourBranchFor(hh,mm);
  var startStem = HOUR_GROUP_START[dayStemIdx];
  var stem = (startStem+branch)%10;
  return { stem:stem, branch:branch };
}
function computeSaju(y,m,d,hh,mm,hourKnown){
  var refHH = hourKnown ? hh : 12, refMM = hourKnown ? mm : 0;
  var std = toLocalStandardTime(y,m,d,refHH,refMM);
  var utJD = stdToUtJD(std);
  var yp = yearPillar(utJD, std.y);
  var mp = monthPillar(utJD, std.y, yp.stem);
  var solarDate = toTrueSolarTime(y,m,d,refHH,refMM);
  var dp = dayPillar(solarDate.y, solarDate.m, solarDate.d);
  var pillars = [ {p:yp}, {p:mp}, {p:dp} ];
  if (hourKnown){
    pillars.push({ p: hourPillar(dp.stem, solarDate.hh, solarDate.mm) });
  }
  var counts = {목:0,화:0,토:0,금:0,수:0};
  pillars.forEach(function(row){
    counts[STEM_EL[row.p.stem]]++;
    counts[BRANCH_EL[row.p.branch]]++;
  });
  return { pillars:pillars, counts:counts, dayStemIdx: dp.stem };
}
function dominantElement(counts){
  var max = -1, top = [];
  EL_KEYS.forEach(function(k){ if (counts[k] > max){ max = counts[k]; } });
  EL_KEYS.forEach(function(k){ if (counts[k] === max) top.push(k); });
  return { key: top[0] };
}

// 오행 한글 키 → 이미지 파일명(로마자)
var ROM = { 목:"wood", 화:"fire", 토:"earth", 금:"metal", 수:"water" };

// PERSONA 타이틀/태그라인 (charan-saju.html PERSONA 데이터와 동일 — 미리보기 텍스트용)
var PERSONA_META = {
  "wood-yang":  { title:"동네언니 추구미", tagline:"편하게 걸쳐도 태 나는 사람" },
  "wood-yin":   { title:"첫사랑 추구미", tagline:"청춘 로코 여주가 추구미인 사람" },
  "fire-yang":  { title:"텐션부자 추구미", tagline:"존재감으로 말하는 사람" },
  "fire-yin":   { title:"말랑로맨틱 추구미", tagline:"은은한 설렘을 주는 사람" },
  "earth-yang": { title:"무해력 추구미", tagline:"자연스러움이 힘인 사람" },
  "earth-yin":  { title:"집순이 추구미", tagline:"곁에 있으면 편안해지는 사람" },
  "metal-yang": { title:"일잘러 추구미", tagline:"일잘러 커리어우먼이 추구미인 사람" },
  "metal-yin":  { title:"칼정리 추구미", tagline:"고민 없이 완성하는 사람" },
  "water-yang": { title:"스트릿 추구미", tagline:"자유로운 감성이 추구미인 사람" },
  "water-yin":  { title:"어른여자 추구미", tagline:"말 많이 안 해도 뭔가 있어 보이는 사람" }
};

function personaFromQuery(url){
  var y = parseInt(url.searchParams.get("y"), 10);
  var m = parseInt(url.searchParams.get("m"), 10);
  var d = parseInt(url.searchParams.get("d"), 10);
  if (!y || !m || !d) return null;
  var hhRaw = url.searchParams.get("hh");
  var mmRaw = url.searchParams.get("mm");
  var hourKnown = hhRaw !== null && mmRaw !== null;
  var hh = hourKnown ? parseInt(hhRaw, 10) : 0;
  var mm = hourKnown ? parseInt(mmRaw, 10) : 0;
  try{
    var saju = computeSaju(y, m, d, hh, mm, hourKnown);
    var dom = dominantElement(saju.counts);
    var yy = (saju.dayStemIdx % 2 === 0) ? "yang" : "yin";
    var slug = ROM[dom.key] + "-" + yy;
    return { slug: slug, meta: PERSONA_META[slug] };
  }catch(e){
    return null;
  }
}

// 이미지 파일(og-*.png) 내용을 바꿀 때마다 이 값을 올려주세요.
// 카카오톡 등은 이미지 "주소"가 같으면 예전에 저장해둔 이미지를 계속
// 재사용해서 보여주기 때문에(제목·설명 텍스트와는 별도로 캐싱됨),
// 주소 끝에 버전값을 붙여 매번 "새 이미지"로 인식하게 만들어요.
var ASSET_VERSION = "20261001";

export default async function handler(request, context) {
  const response = await context.next();
  const url = new URL(request.url);
  const persona = personaFromQuery(url);
  if (!persona) return response; // 생년월일 파라미터가 없으면(=기본 방문) 원래 페이지 그대로

  const imageUrl = url.origin + "/og/persona/og-" + persona.slug + ".png?v=" + ASSET_VERSION;
  const title = persona.meta.title + " | 차란";
  const desc = "\"" + persona.meta.tagline + "\" — 나의 사주 추구미 결과를 확인해보세요.";

  const rewriter = new HTMLRewriter()
    .on('meta[property="og:image"]', { element(el){ el.setAttribute("content", imageUrl); } })
    .on('meta[name="twitter:image"]', { element(el){ el.setAttribute("content", imageUrl); } })
    .on('meta[property="og:title"]', { element(el){ el.setAttribute("content", title); } })
    .on('meta[name="twitter:title"]', { element(el){ el.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(el){ el.setAttribute("content", desc); } })
    .on('meta[name="twitter:description"]', { element(el){ el.setAttribute("content", desc); } });

  return rewriter.transform(response);
}

export const config = { path: "/" };
