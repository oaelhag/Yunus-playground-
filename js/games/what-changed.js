import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 60000, LEAD = 4000, LOCK = 900, BLANK = 900; // المدة، العد التنازلي، توقف بعد الخطأ، فاصل الإخفاء
const POOL = ["🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐸", "🐵", "🦁", "🐯", "🐮", "🐷", "🐔", "🦉", "🐢"];

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const val = (o, me) => (o && o[me]) || 0;
// جولة: n عنصرًا، يتغير واحد منها (موضع c يُستبدل بـ rep). تكبر الشبكة مع النجاح (6 → 12)
function round(seed, att, score) {
  const n = Math.min(6 + score, 12), r = mul(seed * 577 + att * 13 + 1), pool = POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const a = pool.slice(0, n), c = (r() * n) | 0, rep = pool[n]; // pool[n] ليس بين العناصر المعروضة
  const b = a.slice(); b[c] = rep;
  return { a, b, c, study: 2500 + n * 250 };
}

const CSS = `.wc{text-align:center}
.wc-time{font-size:2.2rem;font-weight:800}
.wc-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.wc-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.wc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px auto;max-width:340px}
.wc-c{aspect-ratio:1;min-width:0;padding:0;font-size:1.9rem;background:#fff;border:2px solid var(--line);border-radius:14px;display:flex;align-items:center;justify-content:center;touch-action:manipulation;user-select:none}
button.wc-c{cursor:pointer}
button.wc-c:active{transform:scale(.94)}
.wc-c.q{background:#e2e8f0;color:#94a3b8}
.wc-c.ok{background:#bbf7d0;border-color:#16a34a}
.wc-c.no{background:#fecaca;border-color:#dc2626}
.wc .c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;
if (!document.getElementById("wc-css")) { const st = document.createElement("style"); st.id = "wc-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, starting = false, tickId = null;
let rKey = "", rStart = 0, lockUntil = 0, reveal = null, view = "";
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };
const over = (s) => s.startAt && now() > s.startAt + DUR + 1500;

function choose(i) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;
  const att = val(s.att, me), sc = val(s.scores, me), R = round(s.seed, att, sc);
  if (Date.now() - rStart < R.study + BLANK) return; // ما زلنا في مرحلة الحفظ
  if (i === R.c) { reveal = { key: rKey, ok: true, c: R.c, until: Date.now() + 400 }; lockUntil = Date.now() + 300; api.patch({ [`state/scores/${me}`]: sc + 1, [`state/att/${me}`]: att + 1 }); }
  else { // خطأ: نُظهر الموضع الصحيح لحظة، ثم جولة جديدة بلا نقطة
    lockUntil = Date.now() + LOCK; reveal = { key: rKey, ok: false, i, c: R.c, until: lockUntil };
    setTimeout(() => { if (cur && cur.room.state.seed === s.seed && val(cur.room.state.att, me) === att) cur.api.patch({ [`state/att/${me}`]: att + 1 }); }, LOCK);
  }
  tick();
}

function paint(el, html) { const g = el.querySelector("#wc-grid"); if (g.dataset.v !== html) { g.dataset.v = html; g.innerHTML = html; } }

function tick() {
  if (!cur || !cur.el.querySelector(".wc")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = val(s.scores, "host"), gs = val(s.scores, "guest"), end = (s.startAt || 0) + DUR, op = me === "host" ? "guest" : "host";
  q("wc-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="o">أنت: ${val(s.scores, me)}</b><b class="x">${esc(r[op].name)}: ${val(s.scores, op)}</b>`;
  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("wc-time").textContent = Math.max(0, rem).toFixed(1);
  q("wc-bar").style.width = Math.max(0, rem / (DUR / 1000)) * 100 + "%";

  let msg = "احفظ أماكن الحيوانات ثم اضغط <b>الذي تغيّر</b>", final = false;
  if (ph === "wait") msg = "جارٍ التجهيز…";
  else if (ph === "count") { msg = `استعد! تبدأ خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; paint(el, ""); }
  else if (ph === "play") {
    if (spec) { msg = "وضع المتفرج - تتبع لعبة ما الذي تغيّر"; paint(el, ""); }
    else {
      const att = val(s.att, me), sc = val(s.scores, me), key = s.seed + ":" + att;
      if (key !== rKey) { rKey = key; rStart = Date.now(); reveal = null; }
      const R = round(s.seed, att, sc), el0 = Date.now() - rStart, cell = (e, cls = "", dis = true, k = -1) => dis ? `<div class="wc-c ${cls}">${e}</div>` : `<button class="wc-c ${cls}" data-i="${k}">${e}</button>`;
      if (el0 < R.study) { msg = "👀 احفظ أماكن الحيوانات…"; paint(el, R.a.map((e) => cell(e)).join("")); }
      else if (el0 < R.study + BLANK) { msg = "🙈 اختفت…"; paint(el, R.a.map(() => cell("❔", "q")).join("")); }
      else {
        const rv = reveal && reveal.key === key && Date.now() < reveal.until ? reveal : null;
        msg = rv ? (rv.ok ? "✅ أصبت! +1" : "❌ التغيير كان هنا") : "🤔 أيّها تغيّر؟ اضغط عليه";
        paint(el, R.b.map((e, i) => cell(e, rv ? (i === R.c ? "ok" : rv.i === i ? "no" : "") : "", !!rv, i)).join(""));
      }
    }
  } else if (!over(s)) msg = "جارٍ احتساب النتيجة…";
  else {
    final = true; paint(el, "");
    const win = hs > gs ? "host" : gs > hs ? "guest" : null;
    msg = (!win ? "تعادل!" : win === me ? "فزت! 🎉" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
  }
  const m = q("wc-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");
  q("wc-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = room.createdAt + ":" + room.state.seed;
  el.innerHTML = `<div class="wc">
    <div class="c-stats" id="wc-info"></div><div class="wc-time" id="wc-time"></div>
    <div class="wc-bar"><i id="wc-bar"></i></div><p class="msg" id="wc-msg"></p>
    <div class="wc-grid" id="wc-grid"></div>
    <button class="btn hidden" id="wc-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;
  el.querySelector("#wc-grid").onpointerdown = (e) => { const b = e.target.closest("button.wc-c"); if (b) { e.preventDefault(); choose(+b.dataset.i); } };
  el.querySelector("#wc-again").onclick = () => cur.api.patch({ state: game.init() });
}

const game = {
  id: "whatChanged",
  init: () => ({ seed: (Math.random() * 1e6) | 0, scores: { host: 0, guest: 0 }, att: { host: 0, guest: 0 } }),
  final(room, me) { const s = room.state; return over(s) ? { key: s.seed + ":" + s.startAt, score: val(s.scores, me) } : null; },
  outcome(room) { const s = room.state; if (!over(s)) return null; const h = val(s.scores, "host"), g = val(s.scores, "guest"); return { w: h > g ? "host" : g > h ? "guest" : "draw" }; },
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; rKey = ""; reveal = null; lockUntil = 0; }
    cur = { el, room, me, api };
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".wc") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};
export default game;
