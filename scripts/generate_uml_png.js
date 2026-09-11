const fs = require('fs');
const FONT = 'Segoe UI, Arial, sans-serif', BW = 290;

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

function draw(label, attrs, x, y, isEnum) {
  const TH=30, LH=22, P=8, h=TH+attrs.length*LH+P*2;
  const cx=x+BW/2, cy=y+h/2;
  let o='';
  o+=`<rect x="${x}" y="${y}" width="${BW}" height="${h}" rx="3" fill="#fff" stroke="#333" stroke-width="1.5"/>`;
  o+=`<path d="M${x+3},${y} L${x+BW-3},${y} Q${x+BW},${y} ${x+BW},${y+3} L${x+BW},${y+TH} L${x},${y+TH} L${x},${y+3} Q${x},${y} ${x+3},${y}Z" fill="#f0f0f0" stroke="#333" stroke-width="1.5"/>`;
  o+=`<line x1="${x}" y1="${y+TH}" x2="${x+BW}" y2="${y+TH}" stroke="#333" stroke-width="1"/>`;
  const tl=label.split('\n');
  if(tl.length===1) o+=`<text x="${cx}" y="${y+TH/2}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="bold" fill="#000" dy="0.35em">${esc(tl[0])}</text>`;
  else { o+=`<text x="${cx}" y="${y+11}" text-anchor="middle" font-family="${FONT}" font-size="10" font-style="italic" fill="#000">${esc(tl[0])}</text>`; o+=`<text x="${cx}" y="${y+24}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="bold" fill="#000">${esc(tl[1])}</text>`; }
  attrs.forEach((a,i)=>{ o+=`<text x="${x+14}" y="${y+TH+P+(i+0.5)*LH}" font-family="${FONT}" font-size="11" fill="#000" dy="0.35em">${isEnum?esc(a):'- '+esc(a)}</text>`; });
  return {svg:o,x,y,w:BW,h,cx,cy};
}
function p(b,s){switch(s){case't':return{x:b.cx,y:b.y};case'b':return{x:b.cx,y:b.y+b.h};case'l':return{x:b.x,y:b.cy};case'r':return{x:b.x+b.w,y:b.cy};}}

function diamond(x,y,dx,dy){const ang=Math.atan2(dy,dx),s=6;let pts=[];for(let i=0;i<4;i++){const a=ang+i*Math.PI/2;pts.push(`${(x+s*Math.cos(a)).toFixed(1)},${(y+s*Math.sin(a)).toFixed(1)}`);}return`<polygon points="${pts.join(' ')}" fill="#555" stroke="#555" stroke-width="1"/>`;}
function arrow(x,y,dx,dy){const ang=Math.atan2(dy,dx),p=ang+Math.PI/2,s=10,hw=4;const b1x=x-s*Math.cos(ang)+hw*Math.cos(p),b1y=y-s*Math.sin(ang)+hw*Math.sin(p);const b2x=x-s*Math.cos(ang)-hw*Math.cos(p),b2y=y-s*Math.sin(ang)-hw*Math.sin(p);return`<polyline points="${b1x.toFixed(1)},${b1y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}" fill="none" stroke="#555" stroke-width="1.5"/>`;}

function edge(b1,s1,b2,s2,l1,l2,type,via){
  const p1=p(b1,s1),p2=p(b2,s2);
  let path;
  if(via){path=`M${p1.x},${p1.y} L${via.x},${p1.y} L${via.x},${via.y} L${p2.x},${via.y} L${p2.x},${p2.y}`;}
  else if(s1==='t'||s1==='b'){const my=(p1.y+p2.y)/2;path=`M${p1.x},${p1.y} L${p1.x},${my} L${p2.x},${my} L${p2.x},${p2.y}`;}
  else{const mx=(p1.x+p2.x)/2;path=`M${p1.x},${p1.y} L${mx},${p1.y} L${mx},${p2.y} L${p2.x},${p2.y}`;}
  const dash=type==='dep'?'8,4':'none';
  let o=`<path d="${path}" fill="none" stroke="#555" stroke-width="1.8" stroke-dasharray="${dash}"/>`;
  if(type==='comp'){const s=path.split(' ');o+=diamond(+s[1],+s[2],+s[4]-+s[1],+s[5]-+s[2]);}
  if(type==='dep'){const s=path.split(' '),n=s.length;o+=arrow(+s[n-2],+s[n-1],+s[n-2]-+s[n-5],+s[n-1]-+s[n-4]);}
  const G=14;
  let lx1=p1.x,ly1=p1.y,lx2=p2.x,ly2=p2.y;
  if(s1==='t'){ly1-=G;lx1+=8;}else if(s1==='b'){ly1+=G;lx1+=8;}else if(s1==='r'){lx1+=G;ly1-=8;}else if(s1==='l'){lx1-=G;ly1-=8;}
  if(s2==='t'){ly2-=G;lx2-=8;}else if(s2==='b'){ly2+=G;lx2-=8;}else if(s2==='r'){lx2+=G;ly2+=8;}else if(s2==='l'){lx2-=G;ly2+=8;}
  o+=`<text x="${lx1}" y="${ly1}" font-family="${FONT}" font-size="10" fill="#000" text-anchor="middle" dy="0.35em">${l1}</text>`;
  o+=`<text x="${lx2}" y="${ly2}" font-family="${FONT}" font-size="10" fill="#000" text-anchor="middle" dy="0.35em">${l2}</text>`;
  return o;
}

// ═══ ENTITIES ═══
const ents=[
  ['n1','Пользователь',           ['код: uuid','логин: string','email: string','nickname: string','ФИО: string','роль: Role'], 650,46],
  ['n2','Участник курса',         ['код: uuid','роль: CourseRole','дата_вступления: datetime'], 960,270],
  ['n3','Курс',                   ['код: uuid','название: string','описание: text','код_приглашения: string','дата_создания: datetime'], 650,458],
  ['n4','Канал',                  ['код: uuid','название: string','тип: ChannelType','описание: text'], 30,694],
  ['n5','Учебная группа',         ['код: uuid','название: string','дата_создания: datetime'], 370,694],
  ['n6','Задание',                ['код: uuid','название: string','статус: AssignmentStatus','дата_вступления: datetime','описание: text'], 710,694],
  ['n9','Видеокомната',           ['код: uuid','название: string','лимит_участников: int'], 1050,694],
  ['n8','Сообщение',              ['код: uuid','текст: text','дата_создания: datetime'], 30,900],
  ['n7','Сдача работы',           ['код: uuid','статус: SubmissionStatus','оценка: string','время_отправки: datetime'], 710,900],
  ['n10','Участник видеокомнаты', ['код: uuid','реестр: string','время_входа: datetime','время_выхода: datetime'], 1050,900],
  ['n11','Уведомление',           ['код: uuid','тип: NotificationType','заголовок: string','прочитано: bool'], 1400,46],
  ['n12','<<enumeration>>\nРоль участника',['пользователь','преподаватель'], 1400,246,true],
];
const B=ents.map(([id,label,attrs,x,y,isEnum])=>({id,...draw(label,attrs,x,y,isEnum)}));
const M={}; B.forEach(b=>M[b.id]=b);

// ═══ EDGES (verified non-crossing) ═══
let E='';

// 1. User(b)→CM(t): slight diagonal, safe gap
E+=edge(M.n1,'b',M.n2,'t','1','0..*','assoc');

// 2. CM(b)→Course(r): CM bottom down→left into Course right side
E+=edge(M.n2,'b',M.n3,'r','1','0..*','comp');

// 3-6. Course(b)→fan-out: shared vertical segment then horizontal split
E+=edge(M.n3,'b',M.n4,'t','1','0..*','comp');
E+=edge(M.n3,'b',M.n5,'t','1','0..*','comp');
E+=edge(M.n3,'b',M.n6,'t','1','0..*','comp');
E+=edge(M.n3,'b',M.n9,'t','1','0..1','comp');

// 7. CM(r)→Submission(t): goes right, down in gap, then left
E+=edge(M.n2,'r',M.n7,'t','1','0..*','assoc',{x:1340,y:880});

// 8. User(r)→Notification(l): horizontal right
E+=edge(M.n1,'r',M.n11,'l','1','0..*','comp');

// 9. User(r)→Enum(t): around the right edge
E+=edge(M.n1,'r',M.n12,'t','1','1','dep',{x:1690,y:210});

// 10. Channel(b)→Message(t)
E+=edge(M.n4,'b',M.n8,'t','1','0..*','comp');
// 11. Assignment(b)→Submission(t)
E+=edge(M.n6,'b',M.n7,'t','1','0..*','comp');
// 12. VideoRoom(b)→Participant(t)
E+=edge(M.n9,'b',M.n10,'t','1','0..*','comp');

// ═══ SVG ═══
const W=1750,H=1080;
let I='';
I+=`<rect width="${W}" height="${H}" fill="#fff"/>`;
I+=`<text x="${W/2}" y="18" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="bold" fill="#000">Диаграмма классов предметной области DIPLOM LMS</text>`;
I+=`<text x="${W/2}" y="36" text-anchor="middle" font-family="${FONT}" font-size="10" fill="#666">(нотация UML, уровень концептуальной модели, без привязки к СУБД)</text>`;
I+=E;
B.forEach(b=>I+=b.svg);
fs.writeFileSync('D:\\DIPLOM\\diagram_class_vkr.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${I}\n</svg>`);
console.log('SVG saved to D:\\DIPLOM\\diagram_class_vkr.svg');
