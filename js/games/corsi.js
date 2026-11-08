import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 60000, LEAD = 4000, LOCK = 500, MAXSPAN = 9; // المدة، العد التنازلي، عقوبة الخطأ، أطول مسار

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// مواقع 9 مربعات متناثرة (نفس البذرة = نفس التوزيع للاعبين)، بلا تداخل
function layout(seed) {
  const r = mul(seed * 53 + 7), c = [16, 50, 84];
  return Array.from({ length: 9 }, (_, i) => ({ x: c[i % 3] + ((r() * 12) | 0) - 6, y: c[(i / 3) | 0] + ((r() * 12) | 0) - 6 }));
}
// مسار بطول span؛ يتغير مع كل محاولة (att)
function path(seed, att, span) {
  const r = mul(seed * 911 + att * 37), p = [];
  for (let i = 0; i < span; i++) { let v; do v = (r() * 9) | 0; while (i && v === p[i - 1]); p.push(v); }
  return p;
}
const val = (o, me, d) => (o && o[me] != null ? o[me] : d);

const CSS = `.co{text-align:center}
.co-time{font-size:2.2rem;font-weight:800}
.co-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.co-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.co-box{position:relative;width:min(100%,320px);aspect-ratio:1;margin:12px auto;background:#f1f5fb;border:2px solid var(--line);border-radius:18px}
.co-b{position:absolute;width:22%;aspect-ratio:1;transform:translate(-50%,-50%);background:#475569;border:2px solid var(--ink);border-radius:12px;cursor:pointer;touch-action:manipulation;padding:0;transition:background .12s,transform .12s}
.co-b.on{background:#f59e0b;transform:translate(-50%,-50%) scale(1.12);box-shadow:0 0 14px rgba(245,158,11,.7)}
.co-b.tap{background:#38bdf8}
.co .c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
.co-shake{animation:cos .3s}
@keyframes cos{0%{translate:0}25%{translate:-8px}50%{translate:8px}75%{translate:-5px}100%{translate:0}}`;
if (!document.getElementById("co-css")) { const st = document.createElement("style"); st.id = "co-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
let step = 0, showing = false, shownKey = "", showToken = 0;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };
const over = (s) => s.startAt && now() > s.startAt + DUR + 1500;
const blk = (n) => cur && cur.el.querySelector(`#co-box [data-i="${n}"]`);

// عرض المسار: كل مربع يضيء 0.6ث ثم ينطفئ 0.25ث
function show(seq) {
  showing = true; step = 0;
  const tok = ++showToken; let i = 0;
  const go = () => {
    if (tok !== showToken) return;
    if (!cur || phase(cur.room.state) !== "play" || !cur.el.querySelector("#co-box")) { showing = false; return; }
    if (i >= seq.length) { showing = false; return; }
    const b = blk(seq[i++]); if (b) b.classList.add("on");
    setTimeout(() => { if (b) b.classList.remove("on"); setTimeout(go, 250); }, 600);
  };
  setTimeout(go, 500);
}

function choose(n) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || showing || Date.now() < lockUntil) return;
  const span = val(s.span, me, 2), att = val(s.att, me, 0), p = path(s.seed, att, span);
  const b = blk(n); if (b) { b.classList.add("tap"); setTimeout(() => b.classList.remove("tap"), 180); }
  if (n === p[step]) {
    step++;
    if (step === span) { // أتمّ المسار: يطول بمربع
      step = 0; lockUntil = Date.now() + 600;
      api.patch({ [`state/scores/${me}`]: Math.max(val(s.scores, me, 0), span), [`state/span/${me}`]: Math.min(MAXSPAN, span + 1), [`state/att/${me}`]: att + 1 });
    }
  } else { // خطأ: مسار جديد أقصر بمربع
    step = 0; lockUntil = Date.now() + LOCK;
    const bx = cur.el.querySelector("#co-box"); bx.classList.add("co-shake"); setTimeout(() => bx.classList.remove("co-shake"), 300);
    api.patch({ [`state/span/${me}`]: Math.max(2, span - 1), [`state/att/${me}`]: att + 1 });
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".co")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = val(s.scores, "host", 0), gs = val(s.scores, "guest", 0), end = (s.startAt || 0) + DUR, op = me === "host" ? "guest" : "host";
  q("co-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="o">أطول مسار لك: ${val(s.scores, me, 0)}</b><b class="x">${esc(r[op].name)}: ${val(s.scores, op, 0)}</b>`;
  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("co-time").textContent = Math.max(0, rem).toFixed(1);
  q("co-bar").style.width = Math.max(0, rem / (DUR / 1000)) * 100 + "%";
  let msg = "شاهد المربعات تضيء ثم اضغطها <b>بنفس الترتيب</b>", final = false;
  if (ph === "wait") msg = "جارٍ التجهيز…";
  else if (ph === "count") msg = `استعد! تبدأ خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`;
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع ذاكرة المسار";
    else {
      const span = val(s.span, me, 2), att = val(s.att, me, 0), key = s.seed + ":" + att;
      if (shownKey !== key && !showing) { shownKey = key; show(path(s.seed, att, span)); }
      msg = showing ? `👀 احفظ المسار (${span} مربعات)…` : `✍️ أعد المسار بنفس الترتيب (${Math.min(step + 1, span)} من ${span})`;
    }
  } else if (!over(s)) msg = "جارٍ احتساب النتيجة…";
  else {
    final = true;
    const win = hs > gs ? "host" : gs > hs ? "guest" : null;
    msg = (!win ? "تعادل!" : win === me ? "فزت! 🎉" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
  }
  const m = q("co-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");
  q("co-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = room.createdAt + ":" + room.state.seed;
  el.innerHTML = `<div class="co">
    <div class="c-stats" id="co-info"></div><div class="co-time" id="co-time"></div>
    <div class="co-bar"><i id="co-bar"></i></div><p class="msg" id="co-msg"></p>
    <div class="co-box" id="co-box">${layout(room.state.seed).map((p, i) => `<button class="co-b" data-i="${i}" style="left:${p.x}%;top:${p.y}%"></button>`).join("")}</div>
    <button class="btn hidden" id="co-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;
  el.querySelector("#co-box").onpointerdown = (e) => { const b = e.target.closest(".co-b"); if (b) { e.preventDefault(); choose(+b.dataset.i); } };
  el.querySelector("#co-again").onclick = () => { step = 0; cur.api.patch({ state: game.init() }); };
}

const game = {
  id: "corsi",
  init: () => ({ seed: (Math.random() * 1e6) | 0, scores: { host: 0, guest: 0 }, span: { host: 2, guest: 2 }, att: { host: 0, guest: 0 } }),
  final(room, me) { const s = room.state; return over(s) ? { key: s.seed + ":" + s.startAt, score: val(s.scores, me, 0) } : null; },
  outcome(room) { const s = room.state; if (!over(s)) return null; const h = val(s.scores, "host", 0), g = val(s.scores, "guest", 0); return { w: h > g ? "host" : g > h ? "guest" : "draw" }; },
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; step = 0; showing = false; shownKey = ""; showToken++; }
    cur = { el, room, me, api };
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".co") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};
export default game;
