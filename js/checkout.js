/* =====================================================================
   Checkout, order numbers, payment, order tracking, cancel.
   Loaded after app.js and shares its globals (db, user, cart, prods, CFG, toast, ...).
   ===================================================================== */
const PAYL = { cod: "Cash on delivery", gcash: "GCash", bank: "Bank transfer" };
const OSTEP = { pending: "Order placed", processing: "Preparing", shipped: "Shipped", completed: "Delivered", cancelled: "Cancelled" };
const peso = (n) => "₱" + (+n || 0).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dFmt = (t, long) => {
  const d = t?.toDate ? t.toDate() : t instanceof Date ? t : null;
  return d ? d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", ...(long ? { hour: "numeric", minute: "2-digit" } : {}) }) : "";
};
function refNo(prefix) {
  const d = new Date(), p = (n) => String(n).padStart(2, "0"), A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = ""; for (let i = 0; i < 4; i++) r += A[Math.floor(Math.random() * A.length)];
  return `${prefix}-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${r}`;
}
const shipFor = (sub) => (CFG.shipping.freeOver > 0 && sub >= CFG.shipping.freeOver ? 0 : +CFG.shipping.fee || 0);
const orderLabel = (o) => o.no || "#" + o.id.slice(0, 6).toUpperCase();

/* ---------- payment instructions (from admin settings) ---------- */
function payInfo(method, amount) {
  const P = CFG.pay;
  if (method == "cod") return `<p>Pay in cash when your order arrives. Please prepare the exact amount if you can.</p>`;
  if (method == "gcash") return `<p>Send <b>${peso(amount)}</b> to GCash number <b>${esc1(P.gcash.number || "—")}</b>${P.gcash.name ? ` (${esc1(P.gcash.name)})` : ""}. Use your order number as the message, then enter the reference number below or after placing your order.</p>`;
  return `<p>Transfer <b>${peso(amount)}</b> to <b>${esc1(P.bank.bank || "—")}</b>, account name <b>${esc1(P.bank.name || "—")}</b>, account no. <b>${esc1(P.bank.number || "—")}</b>. Enter the reference number below or after placing your order.</p>`;
}
const payMethods = () => ["cod", "gcash", "bank"].filter((m) => CFG.pay[m]?.on);

/* ---------- checkout page ---------- */
let ckDone = null, ckPay = "cod", ckBusy = false;
function cartTotals() {
  const sub = cart.reduce((a, c) => a + prods[c.i][1] * c.q, 0), ship = cart.length ? shipFor(sub) : 0;
  return { sub, ship, total: sub + ship };
}
function stockIssues() {
  const out = [];
  const per = {};
  cart.forEach((c) => (per[c.i] = (per[c.i] || 0) + c.q));
  Object.entries(per).forEach(([i, q]) => { if (q > prods[i][8]) out.push(`The ${meta(prods[i]).t}: ${prods[i][8] > 0 ? "only " + prods[i][8] + " left" : "out of stock"}`); });
  return out;
}
function renderCheckout() {
  const root = $("#ckw");
  if (!user) return;
  if (ckDone) return renderDone(root);
  if (!cart.length) { toast("Your cart is empty"); location.hash = "#shop"; return; }
  const ms = payMethods();
  if (!ms.includes(ckPay)) ckPay = ms[0] || "cod";
  const { sub, ship, total } = cartTotals(), issues = stockIssues();
  root.innerHTML = `
    <div class="ck-head"><a class="back" href="#shop">← Continue shopping</a><h1>Checkout</h1></div>
    <div class="ck">
      <div class="ck-main">
        <section class="box"><h3>1. Delivery details</h3><p class="sub">Where should we send your order?</p>
          <div class="f">
            <label class="full">Full name<input id="ck-n" value="${esc1(profile.name || "")}" autocomplete="name"></label>
            <label>Mobile number<input id="ck-p" value="${esc1(profile.phone || "")}" inputmode="tel" autocomplete="tel" placeholder="09XX XXX XXXX"></label>
            <label>Email<input value="${esc1(user.email)}" disabled></label>
            <label class="full">Complete address<input id="ck-a" value="${esc1(profile.address || "")}" autocomplete="street-address" placeholder="House no., street, barangay, city, province"></label>
            <label class="full">Note to seller <small class="opt">(optional)</small><input id="ck-note" placeholder="Landmark, preferred delivery time…" maxlength="200"></label>
          </div>
        </section>
        <section class="box"><h3>2. Payment</h3><p class="sub">Choose how you would like to pay.</p>
          <div class="pm" id="ck-pm">${ms.map((m) => `<label class="${m == ckPay ? "on" : ""}"><input type="radio" name="pm" value="${m}" ${m == ckPay ? "checked" : ""}><span><b>${PAYL[m]}</b><small>${m == "cod" ? "Pay when it arrives" : m == "gcash" ? "Send via GCash" : "Online or over-the-counter transfer"}</small></span></label>`).join("")}</div>
          <div class="pinfo" id="ck-pi"></div>
          <label class="full" id="ck-refw" hidden>Payment reference no. <small class="opt">(optional, if you've already paid)</small><input id="ck-ref" maxlength="40" placeholder="e.g. 1234 567 890123"></label>
        </section>
      </div>
      <aside class="side ck-sum">
        <h3>Order summary</h3>
        ${cart.map((c) => { const p = prods[c.i]; return `<div class="it"><span class="thumb"><img class="shoe" src="${p[3]}" alt=""></span><div><b>The ${esc1(meta(p).t)}</b><p>${c.size != null ? "Size " + c.size + " (US) · " : ""}Qty ${c.q}</p><p>${peso(p[1] * c.q)}</p></div></div>`; }).join("")}
        <hr><div class="l"><span>Subtotal</span><span>${peso(sub)}</span></div>
        <div class="l"><span>Shipping</span><span>${ship ? peso(ship) : "Free"}</span></div>
        ${CFG.shipping.freeOver > 0 && ship ? `<p class="note">Spend ${peso(CFG.shipping.freeOver - sub)} more for free shipping.</p>` : ""}
        <hr><div class="l tot">Total <b>${peso(total)}</b></div>
        ${issues.length ? `<div class="ck-warn"><b>Please update your cart</b>${issues.map((x) => `<p>${esc1(x)}</p>`).join("")}</div>` : ""}
        <button class="go" id="ck-go" ${issues.length ? "disabled" : ""}>Place order</button>
        <p class="note">By placing your order you agree to our delivery and returns terms. You can cancel it from My Account while it is still pending.</p>
      </aside>
    </div>`;
  payUI();
}
function payUI() {
  if (!$("#ck-pi")) return;
  const { total } = cartTotals();
  $("#ck-pi").innerHTML = payInfo(ckPay, total);
  $("#ck-refw").hidden = ckPay == "cod";
  $$("#ck-pm label").forEach((l) => l.classList.toggle("on", l.querySelector("input").value == ckPay));
}
document.addEventListener("change", (e) => { if (e.target.name == "pm") { ckPay = e.target.value; payUI(); } });
document.addEventListener("click", async (e) => {
  if (!e.target.closest("#ck-go") || ckBusy) return;
  const n = $("#ck-n").value.trim(), ph = $("#ck-p").value.trim(), ad = $("#ck-a").value.trim();
  if (!n) { toast("Please enter your full name"); return $("#ck-n").focus(); }
  if (!/^[0-9+()\-\s]{7,}$/.test(ph)) { toast("Please enter a valid mobile number"); return $("#ck-p").focus(); }
  if (ad.length < 10) { toast("Please enter your complete delivery address"); return $("#ck-a").focus(); }
  if (stockIssues().length) return renderCheckout();
  ckBusy = true; $("#ck-go").disabled = true; $("#ck-go").textContent = "Placing order…";
  try {
    const items = cart.map((c) => { const p = prods[c.i]; return { pid: p[7], name: meta(p).t, qty: c.q, price: p[1], size: c.size ?? null }; });
    const { sub, ship, total } = cartTotals();
    const o = {
      no: refNo("CP"), userId: user.uid, customer: n, phone: ph, email: user.email, contact: ph + " · " + user.email, address: ad,
      note: $("#ck-note").value.trim(), items, subtotal: sub, shipping: ship, total,
      payment: { method: ckPay, status: "unpaid", ref: ckPay == "cod" ? "" : $("#ck-ref").value.trim() },
      status: "pending", stockDeducted: false, history: [{ status: "pending", at: stamp(), note: "Order placed" }], createdAt: stamp(),
    };
    await db.collection("orders").add(o);
    profile = { ...profile, name: profile.name || n, phone: ph, address: ad };
    db.collection("users").doc(user.uid).set({ name: profile.name, phone: ph, address: ad, email: user.email }, { merge: true }).catch(() => {});
    cart = []; rc();
    ckDone = o; renderCheckout(); scrollTo(0, 0);
  } catch (x) { toast("Couldn't place your order: " + x.message); }
  ckBusy = false;
});
function renderDone(root) {
  const o = ckDone;
  root.innerHTML = `<div class="ck-done">
    <span class="ck-tick" aria-hidden="true">✓</span>
    <h1>Thank you, ${esc1(o.customer.split(" ")[0])}!</h1>
    <p class="sub">Your order has been placed. We'll review it and confirm shortly. You can follow every step in My Account.</p>
    <div class="box">
      <div class="l"><span>Order number</span><b>${esc1(o.no)}</b></div>
      <div class="l"><span>Payment</span><b>${PAYL[o.payment.method]}</b></div>
      <div class="l"><span>Deliver to</span><b>${esc1(o.address)}</b></div>
      <hr>
      ${o.items.map((i) => `<div class="l"><span>${i.qty}× The ${esc1(i.name)}${i.size != null ? " · size " + i.size : ""}</span><span>${peso(i.price * i.qty)}</span></div>`).join("")}
      <div class="l"><span>Shipping</span><span>${o.shipping ? peso(o.shipping) : "Free"}</span></div>
      <div class="l tot">Total <b>${peso(o.total)}</b></div>
    </div>
    ${o.payment.method != "cod" ? `<div class="pinfo"><b>How to pay</b>${payInfo(o.payment.method, o.total)}<p>Use <b>${esc1(o.no)}</b> as your payment reference.</p></div>` : ""}
    <div class="ck-act"><a class="go" href="#account">View my orders</a><a class="lnk" href="#shop">Keep shopping →</a></div>
  </div>`;
}
viewHooks.checkout = () => { if (ckDone && !location.hash.includes("done")) { /* show confirmation once */ } renderCheckout(); };
/* leaving the page clears the confirmation */
addEventListener("hashchange", () => { if (!location.hash.startsWith("#checkout")) ckDone = null; });
userHooks.push((u) => { if (!u) ckDone = null; });
onCfg.push(() => { if (!$("#checkout").hidden && !ckDone && user) renderCheckout(); });

/* ---------- "My orders" in My Account ---------- */
function renderMyOrders() {
  const box = $("#olist");
  box.innerHTML = myOrders.length ? myOrders.map((o) => {
    const k = STEPS.indexOf(o.status), n = o.items.reduce((a, i) => a + i.qty, 0), pay = o.payment || { method: "cod", status: "unpaid" };
    const sub = o.subtotal ?? o.items.reduce((a, i) => a + i.price * i.qty, 0), ship = o.shipping ?? 0;
    const paid = pay.status == "paid";
    return `<article class="ord" data-oid="${o.id}">
      <div class="oh"><div><b>Order ${esc1(orderLabel(o))}</b><span class="od">${dFmt(o.createdAt)} · ${n} item${n > 1 ? "s" : ""}</span></div><span class="os ${o.status}">${OSTEP[o.status] || o.status}</span></div>
      ${o.status == "cancelled" ? `<p class="ord-msg">This order was cancelled${o.cancelReason ? ": " + esc1(o.cancelReason) : "."}</p>` : `<ol class="trk">${STEPS.map((s, i) => `<li class="${i <= k ? "done" : ""}">${OSTEP[s]}</li>`).join("")}</ol>`}
      ${o.tracking?.no ? `<p class="ord-msg">📦 ${esc1(o.tracking.courier || "Courier")} · Tracking no. <b>${esc1(o.tracking.no)}</b></p>` : ""}
      <ul class="it">${o.items.map((i) => `<li><span>${i.qty}× The ${esc1(i.name)}${i.size != null ? " · size " + i.size : ""}</span><span>${peso(i.price * i.qty)}</span></li>`).join("")}</ul>
      <div class="ord-tot"><div class="l"><span>Subtotal</span><span>${peso(sub)}</span></div><div class="l"><span>Shipping</span><span>${ship ? peso(ship) : "Free"}</span></div><div class="l tot">Total <b>${peso(o.total)}</b></div></div>
      <div class="ord-pay"><span>${PAYL[pay.method] || pay.method}</span><span class="pb ${paid ? "paid" : "unpaid"}">${paid ? "Paid" : o.status == "cancelled" ? "Unpaid" : pay.method == "cod" ? "Pay on delivery" : pay.ref ? "Payment under review" : "Awaiting payment"}</span></div>
      ${!paid && pay.method != "cod" && ["pending", "processing"].includes(o.status) ? `<div class="ord-ref"><p>${payInfo(pay.method, o.total)}</p><div class="rf"><input data-ref="${o.id}" placeholder="Payment reference no." value="${esc1(pay.ref || "")}" maxlength="40"><button class="go" data-saveref="${o.id}">${pay.ref ? "Update" : "Submit"}</button></div></div>` : ""}
      ${o.history?.length > 1 ? `<details class="ord-hist"><summary>Order updates</summary><ul>${[...o.history].reverse().map((h) => `<li><b>${OSTEP[h.status] || h.status}</b><span>${dFmt(h.at, true)}</span>${h.note ? `<small>${esc1(h.note)}</small>` : ""}</li>`).join("")}</ul></details>` : ""}
      ${o.status == "pending" ? `<button class="lnk ord-cancel" data-cancelo="${o.id}">Cancel this order</button>` : ""}
    </article>`;
  }).join("") : `<div class="ac-empty"><b>No orders yet</b><p>When you place an order, you can follow it here.</p><a class="go" href="#shop">Start shopping</a></div>`;
}
$("#olist").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-cancelo]"), s = e.target.closest("[data-saveref]");
  try {
    if (c) {
      if (!confirm("Cancel this order? This can't be undone.")) return;
      const o = myOrders.find((x) => x.id == c.dataset.cancelo);
      await db.collection("orders").doc(o.id).update({ status: "cancelled", cancelReason: "Cancelled by customer", statusUpdatedAt: stamp(), history: [...(o.history || []), { status: "cancelled", at: stamp(), note: "Cancelled by customer" }] });
      toast("Order cancelled");
    }
    if (s) {
      const o = myOrders.find((x) => x.id == s.dataset.saveref), v = $(`[data-ref="${o.id}"]`).value.trim();
      if (!v) return toast("Enter your payment reference number");
      await db.collection("orders").doc(o.id).update({ payment: { ...o.payment, ref: v } });
      toast("Thanks! We'll verify your payment shortly.");
    }
  } catch (x) { toast("Couldn't update: " + x.message); }
});
