import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 120000, LEAD = 4000, LOCK = 500, SHOW = 800, WIN = 10; // سقف الوقت، العد التنازلي، عقوبة الخطأ، زمن عرض كل فاكهة، السلسلة المطلوبة للفوز

const FRUITS = [
  { name: "تفاح", icon: "🍎" }, { name: "موز", icon: "🍌" }, { name: "برتقال", icon: "🍊" }, { name: "عنب", icon: "🍇" }, { name: "بطيخ", icon: "🍉" },
  { name: "فراولة", icon: "🍓" }, { name: "مانجو", icon: "🥭" }, { name: "أناناس", icon: "🍍" }, { name: "كيوي", icon: "🥝" }, { name: "خوخ", icon: "🍑" }
];

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// السلسلة في المستوى L هي أول L فاكهة من تسلسل ثابت بالبذرة، فتطول فاكهة واحدة في كل نجاح
const seqOf = (seed, n) => { const r = mul(seed * 777); return Array.from({ length: n }, () => (r() * FRUITS.length) | 0); };
const level = (s, p) => (s.scores && s.scores[p]) || 1;

const CSS = `.fc{text-align:center}
.fc-time{font-size:2.2rem;font-weight:800}
.fc-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.fc-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.fc-target-box{background:#f8faff;border:2px dashed var(--o);padding:12px;border-radius:14px;margin:12px 0;min-height:76px;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;font-size:1.6rem}
.fc-big{font-size:3rem}
.fc-q{opacity:.35}
.fc-target-box small{font-size:.9rem;color:var(--mut);font-weight:700;margin-inline-start:8px}
.fc-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:12px auto;max-width:360px}
.fc-tile{aspect-ratio:1;min-width:0;padding:2px;background:#fff;border:2px solid var(--line);border-radius:14px;font:700 .72rem Cairo,sans-serif;color:var(--ink);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;user-select:none;touch-action:manipulation}
.fc-tile span{font-size:1.5rem;line-height:1}
.fc-tile:active{transform:scale(.94)}
.fc .c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
.fc-shake{animation:fcs .3s}
@keyframes fcs{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}`;
if (!document.getElementById("fc-css")) { const st = document.createElement("style"); st.id = "fc-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
let step = 0, showing = false, shownKey = "", showTimer = null;

// تنتهي الجولة عندما يصل أحدهما إلى سلسلة WIN (يُسجَّل وقت وصوله في state/finish) أو ينتهي سقف الوقت
const endAt = (s) => Math.min(s.startAt + DUR, ...Object.values(s.finish || {}));
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < endAt(s) ? "play" : "end"; };
const over = (s) => s.startAt && now() > endAt(s) + 1500;
// الفائز: الأسبق وصولًا إلى السلسلة المطلوبة، وإلا الأطول سلسلة عند انتهاء الوقت
function winner(s) {
  const f = Object.entries(s.finish || {}).sort((a, b) => a[1] - b[1]);
  if (f.length) return f.length > 1 && f[0][1] === f[1][1] ? null : f[0][0];
  const h = level(s, "host"), g = level(s, "guest");
  return h > g ? "host" : g > h ? "guest" : null;
}

// عرض السلسلة فاكهة بعد فاكهة (ثم تختفي ويُطلب من اللاعب إعادتها من الذاكرة)
function startShow(len) {
  clearInterval(showTimer);
  showing = true; step = 0;
  let i = -1;
  showTimer = setInterval(() => {
    const box = cur && cur.el.querySelector("#fc-target");
    if (!box || phase(cur.room.state) !== "play") { clearInterval(showTimer); showing = false; return; }
    i++;
    if (i < len) { const f = FRUITS[seqOf(cur.room.state.seed, len)[i]]; box.innerHTML = `<span class="fc-big">${f.icon}</span><small>${i + 1} / ${len}</small>`; }
    else { clearInterval(showTimer); showing = false; }
  }, SHOW);
}

function choose(k) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || showing || Date.now() < lockUntil) return;
  const L = level(s, me);
  if (k === seqOf(s.seed, L)[step]) {
    step++;
    if (step === L) { // أتمّ السلسلة: تطول فاكهة، وعند الوصول للهدف تنتهي الجولة
      step = 0;
      const o = { [`state/scores/${me}`]: L + 1 };
      if (L >= WIN) o[`state/finish/${me}`] = now();
      api.patch(o);
    }
  } else {
    lockUntil = Date.now() + LOCK; step = 0; // خطأ: يبدأ الإدخال من أول السلسلة
    const g = cur.el.querySelector("#fc-grid"); g.classList.add("fc-shake"); setTimeout(() => g.classList.remove("fc-shake"), 300);
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".fc")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = level(s, "host"), gs = level(s, "guest"), op = me === "host" ? "guest" : "host", end = (s.startAt || 0) + DUR;
  // السلسلة المنجزة = المستوى - 1
  q("fc-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs - 1}/${WIN}</b><b class="o">${esc(r.guest.name)}: ${gs - 1}/${WIN}</b>`
    : `<b class="o">سلسلتك: ${level(s, me) - 1}/${WIN}</b><b class="x">${esc(r[op].name)}: ${level(s, op) - 1}/${WIN}</b>`;
  const rem = ph === "play" ? (Math.min(end, endAt(s)) - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("fc-time").textContent = Math.max(0, rem).toFixed(1);
  q("fc-bar").style.width = Math.max(0, rem / (DUR / 1000)) * 100 + "%";

  let msg = "", final = false;
  const box = q("fc-target");
  if (ph === "wait") msg = "جارٍ التجهيز…";
  else if (ph === "count") { msg = `استعد! تبدأ خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; box.textContent = "🍎 🍌 🍊"; }
  else if (ph === "play") {
    if (spec) { msg = "وضع المتفرج - تتبع سلسلة الفواكه"; box.textContent = "…"; }
    else {
      const L = level(s, me), key = s.seed + ":" + L;
      if (shownKey !== key && !showing) { shownKey = key; startShow(L); } // سلسلة جديدة: نعرضها أولًا
      msg = showing ? `👀 احفظ السلسلة (${L} ${L === 1 ? "فاكهة" : "فواكه"})…` : `✍️ أعد السلسلة بالترتيب (${Math.min(step + 1, L)} من ${L})`;
      if (!showing) {
        const sq = seqOf(s.seed, L);
        box.innerHTML = sq.map((f, i) => (i < step ? `<span>${FRUITS[f].icon}</span>` : `<span class="fc-q">❔</span>`)).join("");
      }
    }
  } else if (!over(s)) msg = "جارٍ احتساب النتيجة…";
  else {
    final = true; box.textContent = "انتهى الوقت!";
    const win = winner(s), got = Object.keys(s.finish || {}).length > 0;
    msg = (!win ? "تعادل!" : win === me ? (got ? `فزت! وصلت أولًا إلى سلسلة ${WIN} 🎉` : "فزت! 🎉") : `فاز ${esc(r[win].name)}` + (got ? ` ووصل أولًا إلى سلسلة ${WIN}` : "")) + ` (${hs - 1} مقابل ${gs - 1})`;
  }
  const m = q("fc-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");
  q("fc-replay").classList.toggle("hidden", !(ph === "play" && !spec && !showing));
  q("fc-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = room.createdAt + ":" + room.state.seed;
  el.innerHTML = `<div class="fc">
    <div class="c-stats" id="fc-info"></div><div class="fc-time" id="fc-time"></div>
    <div class="fc-bar"><i id="fc-bar"></i></div><p class="msg" id="fc-msg"></p>
    <div class="fc-target-box" id="fc-target"></div>
    <div class="fc-grid" id="fc-grid">${FRUITS.map((f, i) => `<button class="fc-tile" data-k="${i}"><span>${f.icon}</span>${esc(f.name)}</button>`).join("")}</div>
    <button class="btn ghost hidden" id="fc-replay" style="width:100%">👁 أعد عرض السلسلة</button>
    <button class="btn hidden" id="fc-again" style="margin-top:15px;width:100%">لعبة جديدة</button>
  </div>`;
  // نقرأ الحالة الحالية دائمًا من cur (لا من نسخة قديمة محفوظة وقت البناء)
  el.querySelector("#fc-grid").onpointerdown = (e) => { const b = e.target.closest(".fc-tile"); if (b) { e.preventDefault(); choose(+b.dataset.k); } };
  el.querySelector("#fc-replay").onclick = () => {
    if (!cur || cur.me === "spec" || phase(cur.room.state) !== "play" || showing) return;
    startShow(level(cur.room.state, cur.me)); // بلا خصم نقاط: الوقت هو الثمن
  };
  el.querySelector("#fc-again").onclick = () => { step = 0; cur.api.patch({ state: game.init() }); };
}

const game = {
  id: "fruitChain",
  init: () => ({ seed: (Math.random() * 1e6) | 0, scores: { host: 1, guest: 1 } }),
  // أفضل نتيجة: طول السلسلة، وعند التساوي الأسرع وصولًا (الوقت يُسجَّل لمن أكمل الهدف)
  final(room, me) { const s = room.state; if (!over(s)) return null; const f = s.finish && s.finish[me]; return { key: s.seed + ":" + s.startAt, score: level(s, me) - 1, time: f ? (f - s.startAt) / 1000 : null }; },
  outcome(room) { const s = room.state; return over(s) ? { w: winner(s) || "draw" } : null; },
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; step = 0; showing = false; shownKey = ""; clearInterval(showTimer); }
    cur = { el, room, me, api };
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".fc") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};
export default game;
