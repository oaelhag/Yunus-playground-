import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 60000, LEAD = 4000, LOCK = 400;

const FRUITS = [
  { name: "تفاح", icon: "🍎" },
  { name: "موز", icon: "🍌" },
  { name: "برتقال", icon: "🍊" },
  { name: "عنب", icon: "🍇" },
  { name: "بطيخ", icon: "🍉" },
  { name: "فراولة", icon: "🍓" },
  { name: "مانجو", icon: "🥭" },
  { name: "أناناس", icon: "🍍" },
  { name: "كيوي", icon: "🥝" },
  { name: "خوخ", icon: "🍑" }
];

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// توليد تسلسل ثابت للفواكه بناءً على البذرة
function getFruitSequence(seed, maxLen) {
  const r = mul(seed * 777);
  let seq = [];
  for (let i = 0; i < maxLen + 5; i++) {
    seq.push((r() * FRUITS.length) | 0);
  }
  return seq;
}

const CSS = `.fc{text-align:center}
.fc-time{font-size:2.2rem;font-weight:800}
.fc-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.fc-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.fc-target-box{background:#f8faff;border:2px dashed var(--o);padding:12px;border-radius:14px;margin:12px 0;font-size:1.2rem;font-weight:800;color:var(--ink);min-height:60px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
.fc-target-box span{font-size:1.6rem}
.fc-grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin:15px auto;max-width:320px}
.fc-tile{aspect-ratio:1.1;background:#fff;border:2px solid var(--line);border-radius:14px;font-size:1rem;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;user-select:none;touch-action:manipulation;transition:all .15s ease}
.fc-tile span{font-size:1.8rem}
.fc-tile:hover:not(:disabled){border-color:var(--o);transform:translateY(-2px)}
.fc-tile:active:not(:disabled){transform:scale(.95)}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}
.shake{animation:shake .3s}`;

if (!document.getElementById("fc-css")) { const st = document.createElement("style"); st.id = "fc-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
let currentStep = 0; // الخطوة المطلوبة حالياً من السلسلة

const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function chooseFruit(fruitIndex) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;

  const currentLevel = (s.scores && s.scores[me]) || 1;
  const seq = getFruitSequence(s.seed, currentLevel + 2);
  const expectedFruit = seq[currentStep];

  if (fruitIndex === expectedFruit) {
    currentStep++;
    // إذا أتم اللاعب إدخال السلسلة الحالية كاملة، ننتقل للمستوى التالي (تطويل السلسلة)
    if (currentStep === currentLevel) {
      currentStep = 0;
      const nextLevel = currentLevel + 1;
      api.patch({ [`state/scores/${me}`]: nextLevel });
    }
  } else {
    // خطأ: اهتزاز وإعادة البدء من أول السلسلة
    lockUntil = Date.now() + LOCK;
    currentStep = 0;
    const gridEl = cur.el.querySelector("#fc-grid");
    if (gridEl) {
      gridEl.classList.add("shake");
      setTimeout(() => gridEl.classList.remove("shake"), 300);
    }
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".fc")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = (s.scores && s.scores.host) || 1;
  const gs = (s.scores && s.scores.guest) || 1;
  const end = (s.startAt || 0) + DUR;

  q("fc-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: طول السلسلة ${hs}</b><b class="o">${esc(r.guest.name)}: طول السلسلة ${gs}</b>`
    : `<b class="o">سلسلتك: ${s.scores[me] || 1}</b><b class="x">الخصم: ${s.scores[me === "host" ? "guest" : "host"] || 1}</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("fc-time").textContent = Math.max(0, rem).toFixed(1);
  q("fc-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("fc-msg"); let msg = "";
  let final = false;

  if (ph === "wait") { msg = "جارٍ تجهيز اللعبة…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) {
      msg = "وضع المتفرج - تتبع سلسلة الفواكه";
    } else {
      msg = `أدخل العنصر رقم (${currentStep + 1}) من أصل (${s.scores[me] || 1})`;
      
      // عرض الفواكه المطلوبة حتى هذه الخطوة ليراها اللاعب بوضوح تام
      const seq = getFruitSequence(s.seed, (s.scores[me] || 1) + 2);
      const targetBox = q("fc-target");
      if (targetBox) {
        let html = "<b> مطلوب إدخال التسلسل: </b><br>";
        for (let i = 0; i <= currentStep && i < (s.scores[me] || 1); i++) {
          const f = FRUITS[seq[i]];
          html += `<span title="${f.name}">${f.icon}</span> `;
        }
        targetBox.innerHTML = html;
      }
    }
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت في تحدي الذاكرة والتسلسل!" : `فاز ${esc(r[win].name)}`) + ` (طول السلسلة: ${hs} مقابل ${gs})`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  q("fc-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);

  el.innerHTML = `<div class="fc">
    <div class="c-stats" id="fc-info"></div>
    <div class="fc-time" id="fc-time"></div>
    <div class="fc-bar"><i id="fc-bar"></i></div>
    <p class="msg" id="fc-msg"></p>
    
    <div class="fc-target-box" id="fc-target">أضف العنصر الأول</div>

    <div class="fc-grid" id="fc-grid">
      ${FRUITS.map((f, i) => `<button class="fc-tile" data-index="${i}"><span>${f.icon}</span>${esc(f.name)}</button>`).join("")}
    </div>

    <button class="btn hidden" id="fc-again" style="margin-top:15px;width:100%">لعبة جديدة</button>
  </div>`;

  el.querySelector("#fc-grid").onpointerdown = (e) => {
    const btn = e.target.closest(".fc-tile");
    if (btn && phase(room.state) === "play") {
      e.preventDefault();
      chooseFruit(parseInt(btn.dataset.index, 10));
    }
  };

  el.querySelector("#fc-again").onclick = () => {
    currentStep = 0;
    cur.api.patch({ state: game.init() });
  };
}

const game = {
  id: "fruitChain",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 1, guest: 1 } 
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; currentStep = 0; }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".fc") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;
