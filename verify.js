// 계획 문서의 datetime + clipboard 핵심 로직을 그대로 옮겨 주장한 수치를 검증한다
const DAY_START=300, DAY_END=1560, SLOT=5, DAY_BOUNDARY_HOUR=4;
const pad2=n=>String(n).padStart(2,"0");
const snapToSlot=m=>Math.round(m/SLOT)*SLOT;
const clampToDay=m=>Math.min(DAY_END,Math.max(DAY_START,m));
const minutesToLabel=m=>{const w=((m%1440)+1440)%1440;return pad2(Math.floor(w/60))+":"+pad2(w%60);};
const formatDuration=m=>{const h=Math.floor(m/60),x=m%60;if(h===0)return x+"분";if(x===0)return h+"시간";return h+"시간 "+x+"분";};
const dateKey=d=>d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
const parseDateKey=k=>{const[y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d);};
const addDays=(k,n)=>{const d=parseDateKey(k);d.setDate(d.getDate()+n);return dateKey(d);};
const toUTCms=k=>{const[y,m,d]=k.split("-").map(Number);return Date.UTC(y,m-1,d);};
const daysBetween=(a,b)=>Math.round((toUTCms(b)-toUTCms(a))/86400000);
const weekdayOf=k=>parseDateKey(k).getDay();
const plannerDateKey=now=>{const s=new Date(now.getTime());s.setHours(s.getHours()-DAY_BOUNDARY_HOUR);return dateKey(s);};
const WN=["일","월","화","수","목","금","토"];
const formatDateKorean=k=>{const d=parseDateKey(k);return d.getFullYear()+". "+(d.getMonth()+1)+". "+d.getDate()+". ("+WN[d.getDay()]+")";};

function weekStart(k){return addDays(k,-weekdayOf(k));}
function rangeBounds(range,base){const t=range.type;
 if(t==="day")return[base,base];
 if(t==="week"){const s=weekStart(base);return[s,addDays(s,6)];}
 if(t==="month"){const d=parseDateKey(base);return[dateKey(new Date(d.getFullYear(),d.getMonth(),1)),dateKey(new Date(d.getFullYear(),d.getMonth()+1,0))];}
 if(t==="year"){const y=parseDateKey(base).getFullYear();return[y+"-01-01",y+"-12-31"];}
 let f=range.from||base,to=range.to||base; if(to<f)[f,to]=[to,f]; return[f,to];}
function allows(f,w){const t=(f&&f.type)||"all";if(t==="all")return true;if(t==="weekday")return w>=1&&w<=5;if(t==="weekend")return w===0||w===6;return Array.isArray(f.days)&&f.days.indexOf(w)!==-1;}
function resolve(range,filter,base){const[f,to]=rangeBounds(range,base);const r=[];let c=f,g=0;
 while(c<=to&&g<4000){if(allows(filter,weekdayOf(c)))r.push(c);c=addDays(c,1);g++;}return r;}

const ALL={type:"all"};
let fail=0;
const eq=(actual,expected,label)=>{const ok=JSON.stringify(actual)===JSON.stringify(expected);
  if(!ok){fail++;console.log("FAIL "+label+" → 실제:"+JSON.stringify(actual)+" 기대:"+JSON.stringify(expected));}};

eq(snapToSlot(303),305,"snap 303"); eq(snapToSlot(302),300,"snap 302"); eq(snapToSlot(308),310,"snap 308");
eq(minutesToLabel(1530),"01:30","label 1530"); eq(minutesToLabel(1560),"02:00","label 1560"); eq(minutesToLabel(1440),"00:00","label 1440");
eq(formatDuration(500),"8시간 20분","dur 500"); eq(formatDuration(120),"2시간","dur 120"); eq(formatDuration(0),"0분","dur 0");
eq(addDays("2028-02-28",1),"2028-02-29","윤년"); eq(addDays("2026-02-28",1),"2026-03-01","평년 2월");
eq(daysBetween("2026-08-02","2026-08-14"),12,"dday 12");
eq(weekdayOf("2026-08-02"),0,"8/2 일요일"); eq(weekdayOf("2026-08-01"),6,"8/1 토요일");
eq(formatDateKorean("2026-08-02"),"2026. 8. 2. (일)","한국어 날짜");
eq(plannerDateKey(new Date(2026,7,3,1,30)),"2026-08-02","새벽1:30 → 전날");
eq(plannerDateKey(new Date(2026,7,3,3,59)),"2026-08-02","새벽3:59 → 전날");
eq(plannerDateKey(new Date(2026,7,3,4,0)),"2026-08-03","오전4:00 → 당일");
eq(plannerDateKey(new Date(2026,0,1,2,0)),"2025-12-31","연초 새벽 → 전년");

eq(resolve({type:"week"},ALL,"2026-08-05").length,7,"주 7일");
eq(resolve({type:"week"},ALL,"2026-08-05")[0],"2026-08-02","주 시작=일요일");
eq(resolve({type:"month"},ALL,"2026-08-15").length,31,"8월 31일");
eq(resolve({type:"month"},ALL,"2026-02-10").length,28,"2026년 2월");
eq(resolve({type:"month"},ALL,"2028-02-10").length,29,"2028년 2월");
eq(resolve({type:"year"},ALL,"2026-03-01").length,365,"2026년 365일");
eq(resolve({type:"year"},ALL,"2028-03-01").length,366,"2028년 366일");
eq(resolve({type:"month"},{type:"weekday"},"2026-08-15").length,21,"8월 평일 21일");
eq(resolve({type:"month"},{type:"weekend"},"2026-08-15").length,10,"8월 주말 10일");
eq(resolve({type:"month"},{type:"custom",days:[1,3,5]},"2026-08-15").length,13,"8월 월수금 13일");
eq(resolve({type:"month"},{type:"custom",days:[]},"2026-08-15").length,0,"빈 요일 선택");
eq(resolve({type:"custom",from:"2026-08-05",to:"2026-08-03"},ALL,"2026-08-02").length,3,"뒤집힌 기간");

// 시간 라벨 개수
let labels=0; for(let m=DAY_START;m<=DAY_END;m+=60)labels++;
eq(labels,22,"1시간 라벨 22개");

console.log(fail===0 ? "\n전부 통과 — 계획에 적은 수치가 모두 맞습니다." : "\n실패 "+fail+"건");
