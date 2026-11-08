import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const INT = 2500, TOT = 24, DUR = INT * TOT, LEAD = 4000, MATCHES = 8; // زمن كل رمز، عدد الرموز، مدة اللعبة، العد التنازلي، عدد التطابقات
const SYMS = ["🔴", "🔵", "🟢", "🟡", "🟣", "🟠"];

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// تسلسل ثابت بالبذرة: بالضبط MATCHES تطابقًا (الرمز = الرمز قبل N خطوات)، وما عداها لا يطابق أبدًا
function seqOf(seed, N) {
  const r = mul(seed * 31 + N), idx = [];
  for (let i = N; i < TOT; i++) idx.push(i);
  for (let i = idx.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const hit = new Set(idx.slice(0, MATCHES)), seq = [];
  for (let i = 0; i < TOT; i++) {
    if (i >= N && hit.has(i)) seq.push(seq[i - N]);
    else { let v; do v = (r() * SYMS.length) | 0; while (i >= N && v === seq[i - N]); seq.push(v); }
  }
  return seq;
}
const nOf = (s) => (s.n === 2 ? 2 : 1);

const CSS = `.nb{text-align:center}
.nb-time{font-size:2.2rem;font-weight:800}
.nb-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.nb-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.nb-stim{font-size:5.5rem;height:130px;display:flex;align-items:center;justify-content:center;margin:6px 0;border:2px dashed var(--line);border-radius:18px;background:#f8faff}
.nb-hist{display:flex;gap:6px;justify-content:center;min-height:30px;font-size:1.2rem;opacity:.6;margin-bottom:6px}
.nb-btn{width:100%;padding:18px 0;font:800 1.4rem Cairo,sans-serif;border:2px solid var(--ink);border-radius:14px;background:#38bdf8;color:var(--ink);cursor:pointer;touch-action:manipulation;user-select:none}
.nb-btn:active:not(:disabled){transform:scale(.97)}
.nb-btn:disabled{opacity:.4;cursor:default}
.nb .c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;
if (!document.getElementById("nb-css")) { const st = document.createElement("style"); st.id = "nb-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, starting = false, tickId = null, pressed = {}, fb = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };
const over = (s) => s.startAt && now() > s.startAt + DUR + 1500;
const idxNow = (s) => Math.min(TOT - 1, Math.floor((now() - s.startAt) / INT));

function press() {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play") return;
  const i = idxNow(s), key = s.seed + ":" + i, N = nOf(s);
  if (pressed[key]) return; // ضغطة واحدة لكل رمز
  pressed[key] = 1;
  const seq = seqOf(s.seed, N), hit = i >= N && seq[i] === seq[i - N];
  const sc = (s.scores && s.scores[me]) || 0;
  api.patch({ [`state/scores/${me}`]: Math.max(0, sc + (hit ? 1 : -1)) });
  fb = { ok: hit, until: Date.now() + 700 };
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".nb")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id), N = nOf(s);
  const hs = (s.scores && s.scores.host) || 0, gs = (s.scores && s.scores.guest) || 0, end = (s.startAt || 0) + DUR, op = me === "host" ? "guest" : "host";
  q("nb-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="o">أنت: ${(s.scores && s.scores[me]) || 0}</b><b class="x">${esc(r[op].name)}: ${(s.scores && s.scores[op]) || 0}</b>`;
  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("nb-time").textContent = Math.max(0, rem).toFixed(1);
  q("nb-bar").style.width = Math.max(0, rem / (DUR / 1000)) * 100 + "%";

  const stim = q("nb-stim"), hist = q("nb-hist"), seq = ph === "play" || ph === "end" ? seqOf(s.seed, N) : null;
  const ask = N === 1 ? "الرمز السابق" : "الرمز قبل رمزين";
  let msg = `اضغط «تطابق» إذا كان الرمز الحالي <b>هو نفسه ${ask}</b>`, final = false;
  stim.textContent = ""; hist.textContent = "";
  if (ph === "wait") msg = "جارٍ التجهيز…";
  else if (ph === "count") { msg = `استعد! تبدأ خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; stim.textContent = "🧠"; }
  else if (ph === "play") {
    const i = idxNow(s), within = (t - s.startAt) % INT;
    stim.textContent = within < INT - 500 ? SYMS[seq[i]] : ""; // فاصل قصير ليظهر تكرار نفس الرمز

    if (fb && Date.now() < fb.until) msg = fb.ok ? "✅ أصبت! +1" : "❌ ليس تطابقًا (−1)";
    if (spec) msg = "وضع المتفرج - تتبع اختبار الذاكرة";
  } else if (!over(s)) { msg = "جارٍ احتساب النتيجة…"; stim.textContent = "⏱"; }
  else {
    final = true; stim.textContent = "🏁";
    const win = hs > gs ? "host" : gs > hs ? "guest" : null;
    msg = (!win ? "تعادل!" : win === me ? "فزت! 🎉" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
  }
  const m = q("nb-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");
  q("nb-press").disabled = !(ph === "play" && !spec);
  q("nb-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = room.createdAt + ":" + room.state.seed;
  const N = nOf(room.state);
  el.innerHTML = `<div class="nb">
    <div class="c-stats" id="nb-info"></div><div class="nb-time" id="nb-time"></div>
    <div class="nb-bar"><i id="nb-bar"></i></div><p class="msg" id="nb-msg"></p>
    <div class="nb-stim" id="nb-stim"></div><div class="nb-hist" id="nb-hist"></div>
    <button class="nb-btn" id="nb-press">✋ تطابق (مع ${N === 1 ? "السابق" : "ما قبل السابق"})</button>
    <button class="btn hidden" id="nb-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;
  el.querySelector("#nb-press").onpointerdown = (e) => { e.preventDefault(); press(); };
  el.querySelector("#nb-again").onclick = () => cur.api.patch({ state: game.init(cur.room.state.n === 2 ? "2" : "1") });
}

const game = {
  id: "nBack",
  init: (mode) => ({ seed: (Math.random() * 1e6) | 0, n: mode === "2" ? 2 : 1, scores: { host: 0, guest: 0 } }),
  final(room, me) { const s = room.state; return over(s) ? { key: s.seed + ":" + s.startAt, score: (s.scores && s.scores[me]) || 0 } : null; },
  outcome(room) { const s = room.state; if (!over(s)) return null; const h = (s.scores && s.scores.host) || 0, g = (s.scores && s.scores.guest) || 0; return { w: h > g ? "host" : g > h ? "guest" : "draw" }; },
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; pressed = {}; fb = null; }
    cur = { el, room, me, api };
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".nb") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};
export default game;
