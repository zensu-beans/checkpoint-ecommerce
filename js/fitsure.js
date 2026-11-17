/* =====================================================================
   Fit-Sure at-home fitting: real bookings, slot availability, My Account list.
   Loaded after app.js / checkout.js and shares their globals.
   ===================================================================== */
const FST = { pending: "Awaiting confirmation", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", noshow: "Missed" };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fitFmt = (d) => d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const FIT = { date: null, slot: null, pairs: [{ pid: "", size: null }], svc: new Set(), where: "home", my: [], busy: {}, vy: 0, vm: 0, done: null, busyUnsub: null, busyFor: null, ready: false, sending: false };
const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const fc = () => CFG.fit;
const minDate = () => new Date(today0().getTime() + (fc().leadDays || 1) * 864e5);
const maxDate = () => new Date(today0().getTime() + (fc().maxDays || 60) * 864e5);
const dayOpen = (d) => d >= minDate() && d <= maxDate() && !fc().closedDays.includes(d.getDay()) && !fc().closedDates.includes(ymd(d));

function initFit() {
  if (FIT.ready) return;
  FIT.ready = true;
  const t = minDate(); FIT.vy = t.getFullYear(); FIT.vm = t.getMonth();
  $("#fitapp").innerHTML = `
  <div class="bk"><div class="bk-main">
    <section class="box bx" data-step="date"><div class="bh"><span class="bn" aria-hidden="true">1</span><div><h3>Date &amp; time</h3><p class="sub">Choose when you'd like your fitting session.</p></div></div>
      <div class="cal"><div><span class="lbl">Select date</span><div class="grid7" id="cal"></div></div>
      <div><span class="lbl">Available time slots</span><div class="slots" id="slots"></div><p class="fnote" id="slotnote"></p></div></div>
    </section>
    <section class="box bx" data-step="pairs"><div class="bh"><span class="bn" aria-hidden="true">2</span><div><h3>Shoes to try</h3><p class="sub">Pick up to <span id="fmax"></span> pairs and sizes, and we'll bring them to you.</p></div></div>
      <div id="fpairs"></div><button type="button" class="fadd" id="fadd">+ Add another pair</button></section>
    <section class="box bx" data-step="where"><div class="bh"><span class="bn" aria-hidden="true">3</span><div><h3>Where to meet</h3><p class="sub">Tell us where to bring the shoes.</p></div></div>
      <div class="seg" id="seg"><button type="button" class="on" data-w="home">My saved address</button><button type="button" data-w="other">Other address</button></div>
      <div class="f">
        <label class="full">Full name<input id="nm" autocomplete="name"></label>
        <label class="full">Address<input id="ad" autocomplete="street-address" placeholder="House no., street, barangay"></label>
        <label>City<select id="ct"></select></label><label>Postal code<input id="zp" inputmode="numeric" maxlength="6"></label>
        <label class="full">Contact number<input id="ph" inputmode="tel" autocomplete="tel" placeholder="09XX XXX XXXX"></label>
        <label class="full">Note <small class="opt">(optional)</small><input id="fnote" maxlength="200" placeholder="Landmarks, gate code, who to ask for…"></label>
      </div></section>
    <section class="box bx" data-step="svc"><div class="bh"><span class="bn" aria-hidden="true">4</span><div><h3>Add services <small class="opt">(optional)</small></h3><p class="sub">Enhance your experience with our shoe care services.</p></div></div><div class="svc" id="svc"></div></section>
  </div>
  <aside class="side bk-side"><div class="bs-hd"><h3>Your booking</h3><span class="bs-fee"><svg class="ic" aria-hidden="true"><use href="#i-home"/></svg>At-home</span></div>
    <div class="bs-prog"><div class="bs-bar"><i id="bsfill"></i></div><span id="bsprog">0 of 3 steps ready</span></div>
    <ul class="bs-ck"><li data-ck="date">Date &amp; time</li><li data-ck="pairs">Shoes &amp; sizes</li><li data-ck="where">Meeting details</li></ul>
    <div class="bs-sec"><b>Date &amp; time</b><p id="sdt"></p></div>
    <div class="bs-sec"><b>Pairs to bring</b><div id="spr"></div></div>
    <div class="bs-sec"><b>Meeting address</b><p id="sad"></p></div>
    <div class="bs-sec"><b>Delivery &amp; fitting</b><div class="l"><span>At-home fitting</span><span id="sfee"></span></div></div>
    <div class="bs-sec"><b>Additional services</b><div id="ssv"></div></div>
    <div class="l tot">Estimated total <b id="tot"></b></div>
    <button class="go" id="go">Request appointment</button>
    <div class="note"><svg class="ic" aria-hidden="true"><use href="#i-shield"/></svg><span>Your request is confirmed by our team, usually within the day. Services are paid at your appointment.</span></div>
    <a class="back" href="#shop">← Back to shop</a>
  </aside></div>`;
  $("#cal").onclick = (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.m) { FIT.vm += +b.dataset.m; if (FIT.vm > 11) { FIT.vm = 0; FIT.vy++; } if (FIT.vm < 0) { FIT.vm = 11; FIT.vy--; } }
    else if (b.dataset.d) { FIT.date = new Date(FIT.vy, FIT.vm, +b.dataset.d); FIT.slot = null; watchBusy(); }
    fitCal(); fitUpd();
  };
  $("#slots").onclick = (e) => { const s = e.target.closest("[data-s]"); if (s && !s.disabled) { FIT.slot = +s.dataset.s; fitUpd(); } };
  $("#fadd").onclick = () => { if (FIT.pairs.length < fc().pairs) { FIT.pairs.push({ pid: "", size: null }); fitPairs(); fitUpd(); } };
  $("#fpairs").onchange = (e) => {
    const r = e.target.closest("[data-pi]"); if (!r) return;
    const i = +r.dataset.pi;
    if (e.target.dataset.k == "pid") { FIT.pairs[i] = { pid: e.target.value, size: null }; fitPairs(); }
    else FIT.pairs[i].size = e.target.value;
    fitUpd();
  };
  $("#fpairs").onclick = (e) => { const x = e.target.closest("[data-prm]"); if (x) { FIT.pairs.splice(+x.dataset.prm, 1); if (!FIT.pairs.length) FIT.pairs.push({ pid: "", size: null }); fitPairs(); fitUpd(); } };
  $("#svc").onchange = (e) => { const i = +e.target.dataset.v; e.target.checked ? FIT.svc.add(i) : FIT.svc.delete(i); fitUpd(); };
  $("#seg").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    FIT.where = b.dataset.w; $$("#seg button").forEach((x) => x.classList.toggle("on", x == b));
    fillFit(true); fitUpd();
  };
  $$("#fitapp .f input,#fitapp .f select").forEach((i) => (i.oninput = fitUpd));
  $("#go").onclick = submitFit;
  fitStatic(); fillFit(true); fitCal(); fitPairs(); fitUpd();
}
function fitStatic() {
  $("#fmax").textContent = fc().pairs;
  $("#ct").innerHTML = fc().cities.map((c) => `<option>${esc1(c)}</option>`).join("");
  $("#svc").innerHTML = fc().services.map((s, i) => `<label><i><svg class="ic"><use href="#${["i-drop", "i-spark", "i-wrench", "i-rule"][i % 4]}"/></svg></i><span class="sv-t"><b>${esc1(s.name)}</b>${s.note ? `<small>${esc1(s.note)}</small>` : ""}</span><em class="sv-p">${s.max > s.price ? `${peso(s.price)}–${peso(s.max)}` : peso(s.price)}</em><input type="checkbox" data-v="${i}" ${FIT.svc.has(i) ? "checked" : ""} aria-label="Add ${esc1(s.name)}"></label>`).join("");
  const fc2 = $("#faq-cities"); if (fc2) { const c = fc().cities; fc2.textContent = `The booking form currently lists ${c.length > 1 ? c.slice(0, -1).join(", ") + " and " + c[c.length - 1] : c[0] || "no cities yet"}.`; }
  const f = $("#faq-fee"); if (f) f.textContent = `Delivery and the at-home fitting are ${peso(fc().fee)} per appointment.`;
}
function fillFit(force) {
  if (!$("#nm")) return;
  const set = (id, v) => { const el = $(id); if (force || !el.value) el.value = v; };
  if (FIT.where == "home") { set("#nm", profile.name || ""); set("#ad", profile.address || ""); set("#ph", profile.phone || ""); }
  else { set("#nm", profile.name || ""); $("#ad").value = ""; set("#ph", profile.phone || ""); }
}
function fitCal() {
  const first = new Date(FIT.vy, FIT.vm, 1), n = new Date(FIT.vy, FIT.vm + 1, 0).getDate(), t = minDate();
  let h = `<div class="mh"><button type="button" data-m="-1" aria-label="Previous month" ${FIT.vy == t.getFullYear() && FIT.vm <= t.getMonth() ? "disabled" : ""}>‹</button><span>${first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span><button type="button" data-m="1" aria-label="Next month" ${new Date(FIT.vy, FIT.vm + 1, 1) > maxDate() ? "disabled" : ""}>›</button></div>` +
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<b>${d}</b>`).join("") + "<span></span>".repeat(first.getDay());
  for (let d = 1; d <= n; d++) { const x = new Date(FIT.vy, FIT.vm, d); h += `<button type="button" data-d="${d}" class="${FIT.date && +x == +FIT.date ? "sel" : ""}" ${dayOpen(x) ? "" : "disabled"}>${d}</button>`; }
  $("#cal").innerHTML = h;
}
/* live count of taken slots for the chosen day */
function watchBusy() {
  FIT.busyUnsub?.(); FIT.busyUnsub = null; FIT.busy = {};
  if (!FIT.date) return;
  const key = ymd(FIT.date); FIT.busyFor = key;
  FIT.busyUnsub = db.collection("fitbusy").where("date", "==", key).onSnapshot((s) => {
    FIT.busy = {}; s.docs.forEach((d) => { const k = d.data().slot; FIT.busy[k] = (FIT.busy[k] || 0) + 1; });
    if (FIT.slot != null && (FIT.busy[FIT.slot] || 0) >= fc().capacity) FIT.slot = null;
    fitUpd();
  }, () => {});
}
function fitPairs() {
  const avail = prods.map((p, i) => [p, i]).filter(([p]) => p[8] > 0);
  $("#fpairs").innerHTML = FIT.pairs.map((r, i) => {
    const p = prods.find((x) => x[7] == r.pid);
    return `<div class="fp" data-pi="${i}"><span class="fpn">Pair ${i + 1}</span><select data-k="pid" aria-label="Style"><option value="">Select a style…</option>${avail.map(([p]) => `<option value="${p[7]}" ${p[7] == r.pid ? "selected" : ""}>${esc1(meta(p).t)}${p[1] != null ? " — " + peso(p[1]) : ""}</option>`).join("")}</select>
      <select data-k="size" aria-label="Size" ${p ? "" : "disabled"}><option value="">Size…</option>${p ? sizesFor(p).map((s) => `<option ${String(s) == String(r.size) ? "selected" : ""}>${s}</option>`).join("") : ""}</select>
      <button type="button" class="fx" data-prm="${i}" aria-label="Remove pair">✕</button></div>`;
  }).join("");
  $("#fadd").hidden = FIT.pairs.length >= fc().pairs;
}
function fitTotals() {
  let min = +fc().fee || 0, max = min;
  const sv = [...FIT.svc].map((i) => fc().services[i]).filter(Boolean);
  sv.forEach((s) => { min += +s.price; max += +(s.max || s.price); });
  return { min, max, sv };
}
function fitUpd() {
  if (!$("#slots")) return;
  const cap = fc().capacity;
  $("#slots").innerHTML = FIT.date ? fc().slots.map((s, i) => { const full = (FIT.busy[i] || 0) >= cap; return `<button type="button" class="slot ${i === FIT.slot ? "on" : ""}" data-s="${i}" ${full ? "disabled" : ""}>${esc1(s)}${full ? "<small>Fully booked</small>" : ""}</button>`; }).join("") : `<p class="fnote">Pick a date first.</p>`;
  $("#slotnote").textContent = FIT.date && fc().slots.every((_, i) => (FIT.busy[i] || 0) >= cap) ? "All slots are taken that day. Please try another date." : "";
  $("#sdt").textContent = FIT.date && FIT.slot != null ? `${fitFmt(FIT.date)} · ${fc().slots[FIT.slot]}` : "Choose a date and time";
  const done = FIT.pairs.filter((r) => r.pid);
  $("#spr").innerHTML = done.length ? done.map((r) => { const p = prods.find((x) => x[7] == r.pid); return `<div class="l"><span>The ${esc1(meta(p).t)}</span><span>${r.size ? "Size " + esc1(r.size) : "Size?"}</span></div>`; }).join("") : "<p>None selected</p>";
  $("#sad").innerHTML = [$("#nm").value, $("#ad").value, $("#ct").value + " " + $("#zp").value, $("#ph").value].map(esc1).filter((x) => x.trim()).join("<br>") || "—";
  $("#sfee").textContent = peso(fc().fee);
  const { min, max, sv } = fitTotals();
  $("#ssv").innerHTML = sv.length ? sv.map((s) => `<div class="l"><span>${esc1(s.name)}</span><span>${s.max > s.price ? peso(s.price) + "–" + peso(s.max) : peso(s.price)}</span></div>`).join("") : "<p>None selected</p>";
  $("#tot").textContent = max > min ? peso(min) + " – " + peso(max) : peso(min);
  const okD = FIT.date && FIT.slot != null, okP = done.length > 0 && done.every((r) => r.size),
    okW = !!$("#nm").value.trim() && $("#ad").value.trim().length >= 6 && /^[0-9+()\-\s]{7,}$/.test($("#ph").value.trim());
  [["date", okD], ["pairs", okP], ["where", okW]].forEach(([k, v]) => $$(`#fitapp [data-step="${k}"],#fitapp [data-ck="${k}"]`).forEach((el) => el.classList.toggle("done", !!v)));
  const n = [okD, okP, okW].filter(Boolean).length;
  $("#bsprog").textContent = n == 3 ? "Ready to request" : `${n} of 3 steps ready`;
  $("#bsfill").style.width = (n / 3) * 100 + "%";
}
async function submitFit() {
  if (FIT.sending) return;
  if (!user) { toast("Please sign in or create an account to book a fitting"); return goLogin("#fit"); }
  const say = (m, sel) => { toast(m); if (sel) $(sel)?.focus?.(); return false; };
  if (!FIT.date) return say("Please choose a date");
  if (FIT.slot == null) return say("Please choose a time slot");
  const pairs = FIT.pairs.filter((r) => r.pid);
  if (!pairs.length) return say("Please choose at least one pair to try");
  if (pairs.some((r) => !r.size)) return say("Please choose a size for each pair");
  if (!$("#nm").value.trim()) return say("Please enter your full name", "#nm");
  if ($("#ad").value.trim().length < 6) return say("Please enter your address", "#ad");
  if (!/^[0-9+()\-\s]{7,}$/.test($("#ph").value.trim())) return say("Please enter a valid contact number", "#ph");
  FIT.sending = true; const btn = $("#go"); btn.disabled = true; btn.textContent = "Sending request…";
  try {
    const key = ymd(FIT.date);
    const taken = (await db.collection("fitbusy").where("date", "==", key).get()).docs.filter((d) => d.data().slot == FIT.slot).length;
    if (taken >= fc().capacity) { FIT.slot = null; fitUpd(); throw Error("That time slot was just taken. Please choose another."); }
    const { min, max, sv } = fitTotals();
    const doc = {
      no: refNo("FS"), userId: user.uid, customer: $("#nm").value.trim(), phone: $("#ph").value.trim(), email: user.email,
      address: $("#ad").value.trim(), city: $("#ct").value, zip: $("#zp").value.trim(), note: $("#fnote").value.trim(),
      date: key, slot: FIT.slot, slotLabel: fc().slots[FIT.slot],
      pairs: pairs.map((r) => { const p = prods.find((x) => x[7] == r.pid); return { pid: r.pid, name: meta(p).t, size: r.size, price: p[1] }; }),
      services: sv.map((s) => ({ name: s.name, price: +s.price, max: +(s.max || s.price) })),
      fee: +fc().fee, estMin: min, estMax: max, status: "pending",
      history: [{ status: "pending", at: stamp(), note: "Appointment requested" }], createdAt: stamp(),
    };
    const ref = db.collection("bookings").doc(), b = db.batch();
    b.set(ref, doc); b.set(db.collection("fitbusy").doc(ref.id), { date: key, slot: FIT.slot, userId: user.uid });
    await b.commit();
    profile = { ...profile, name: profile.name || doc.customer, phone: profile.phone || doc.phone, address: profile.address || doc.address };
    FIT.done = doc; FIT.busyUnsub?.(); FIT.busyUnsub = null; renderFitDone(); $("#book").scrollIntoView();
  } catch (x) { toast(x.message); }
  FIT.sending = false; btn.disabled = false; btn.textContent = "Request appointment";
}
function renderFitDone() {
  const d = FIT.done, dt = fromYmd(d.date);
  $("#fitapp").innerHTML = `<div class="ck-done"><span class="ck-tick" aria-hidden="true">✓</span><h1>Appointment requested</h1>
    <p class="sub">Thank you! Our team will confirm your appointment shortly. You'll see its status under My Account → Fit-Sure appointments.</p>
    <div class="box"><div class="l"><span>Reference</span><b>${esc1(d.no)}</b></div>
    <div class="l"><span>When</span><b>${fitFmt(dt)} · ${esc1(d.slotLabel)}</b></div>
    <div class="l"><span>Where</span><b>${esc1(d.address)}, ${esc1(d.city)}</b></div><hr>
    ${d.pairs.map((p) => `<div class="l"><span>The ${esc1(p.name)}</span><span>Size ${esc1(p.size)}</span></div>`).join("")}
    ${d.services.map((s) => `<div class="l"><span>${esc1(s.name)}</span><span>${peso(s.price)}</span></div>`).join("")}
    <div class="l tot">Estimated total <b>${d.estMax > d.estMin ? peso(d.estMin) + " – " + peso(d.estMax) : peso(d.estMin)}</b></div></div>
    <div class="ck-act"><a class="go" href="#account">View my appointments</a><button type="button" class="lnk" id="fnew">Book another →</button></div></div>`;
  $("#fnew").onclick = () => { FIT.done = null; FIT.ready = false; FIT.date = null; FIT.slot = null; FIT.pairs = [{ pid: "", size: null }]; FIT.svc = new Set(); initFit(); };
}
viewHooks.fit = () => { if (FIT.done) return; initFit(); fillFit(); };
onCfg.push(() => { if (FIT.ready && !FIT.done) { fitStatic(); fitCal(); fitPairs(); fitUpd(); } });
/* product list may arrive after the page opens */
prodHooks.push(() => { if (FIT.ready && !FIT.done) { fitPairs(); fitUpd(); } });

/* clear the booking form / confirmation on sign-out and when leaving the page */
function resetFit() {
  FIT.busyUnsub?.(); FIT.busyUnsub = null;
  Object.assign(FIT, { done: null, ready: false, date: null, slot: null, pairs: [{ pid: "", size: null }], svc: new Set(), where: "home", busy: {}, busyFor: null, sending: false });
  const app = $("#fitapp"); if (app) app.innerHTML = "";
  if (!$("#fit").hidden) initFit();
}
userHooks.push((u) => { if (!u && (FIT.done || FIT.ready)) resetFit(); });
addEventListener("hashchange", () => { if (FIT.done && !/^#(fit|book|faq)/.test(location.hash)) resetFit(); });

/* ---------- my appointments (My Account) ---------- */
let unsubBooks = null;
userHooks.push((u) => {
  unsubBooks?.(); unsubBooks = null; FIT.my = [];
  if (!u) return renderMyBooks();
  const seenB = {};
  unsubBooks = db.collection("bookings").where("userId", "==", u.uid).onSnapshot((s) => {
    FIT.my = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date + b.slot).localeCompare(a.date + a.slot));
    FIT.my.forEach((b) => { if (seenB[b.id] && seenB[b.id] != b.status) toast(`Fit-Sure ${b.no}: ${FST[b.status] || b.status}`); seenB[b.id] = b.status; });
    renderMyBooks();
  }, () => {});
  fillFit();
});
function renderMyBooks() {
  const box = $("#blist"); if (!box) return;
  box.innerHTML = FIT.my.length ? FIT.my.map((b) => `<article class="ord">
    <div class="oh"><div><b>${esc1(b.no)}</b><span class="od">${fitFmt(fromYmd(b.date))} · ${esc1(b.slotLabel)}</span></div><span class="os ${b.status}">${FST[b.status] || b.status}</span></div>
    <ul class="it">${b.pairs.map((p) => `<li><span>The ${esc1(p.name)} · size ${esc1(p.size)}</span><span></span></li>`).join("")}${b.services.map((s) => `<li><span>${esc1(s.name)}</span><span>${peso(s.price)}</span></li>`).join("")}</ul>
    <p class="ord-msg">📍 ${esc1(b.address)}, ${esc1(b.city)}</p>
    <div class="ord-tot"><div class="l tot">Estimated total <b>${b.estMax > b.estMin ? peso(b.estMin) + " – " + peso(b.estMax) : peso(b.estMin)}</b></div></div>
    ${["pending", "confirmed"].includes(b.status) ? `<button class="lnk ord-cancel" data-cancelb="${b.id}">Cancel appointment</button>` : ""}
  </article>`).join("") : `<div class="ac-empty"><b>No appointments yet</b><p>Try your shoes at home before you decide.</p><a class="go" href="#fit">Book a Fit-Sure fitting</a></div>`;
}
$("#blist")?.addEventListener("click", async (e) => {
  const c = e.target.closest("[data-cancelb]"); if (!c) return;
  const b = FIT.my.find((x) => x.id == c.dataset.cancelb);
  if (!confirm("Cancel this appointment?")) return;
  try {
    const w = db.batch();
    w.update(db.collection("bookings").doc(b.id), { status: "cancelled", cancelReason: "Cancelled by customer", statusUpdatedAt: stamp(), history: [...(b.history || []), { status: "cancelled", at: stamp(), note: "Cancelled by customer" }] });
    w.delete(db.collection("fitbusy").doc(b.id));
    await w.commit(); toast("Appointment cancelled");
  } catch (x) { toast("Couldn't cancel: " + x.message); }
});
route();