/* ==========================================================================
   Checkpoint Shoes — storefront
   ========================================================================== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- helpers ---------- */
const esc1 = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const terms = (v) => v.toLowerCase().split(/\s+/).filter(Boolean);
const hl = (s, ts) => {
  if (!ts.length) return esc1(s);
  const re = new RegExp("(" + ts.map(rx).join("|") + ")", "gi");
  return s
    .split(re)
    .map((x, k) => (k % 2 ? `<mark>${esc1(x)}</mark>` : esc1(x)))
    .join("");
};
const load = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v == null ? d : v;
  } catch (e) {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};
const money = (n) => "₱" + n.toLocaleString("en-US");

const toast = (m) => {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("show");
  clearTimeout(t._);
  t._ = setTimeout(() => t.classList.remove("show"), 2400);
};

/* ---------- theme ---------- */
const TH = () =>
  root.dataset.theme ||
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const tic = () => {
  const d = TH() == "dark";
  $("#bt").innerHTML =
    `<svg class="ic"><use href="#i-${d ? "sun" : "moon"}"/></svg>`;
  $("#bt").setAttribute(
    "aria-label",
    d ? "Switch to light mode" : "Switch to dark mode",
  );
};
$("#bt").onclick = () => {
  const n = TH() == "dark" ? "light" : "dark";
  root.dataset.theme = n;
  try {
    localStorage.setItem("cp-theme", n);
  } catch (e) {}
  tic();
  const ic = $("#bt svg");
  if (ic) ic.classList.add("spin");
};
tic();

/* ---------- data ---------- */
const cats = [
  ["Sandals, Slides & Flip-Flops", "assets/images/cat-sandals.jpg"],
  ["Boots", "assets/images/cat-boots.jpg"],
  ["Formal Shoes", "assets/images/cat-formal.jpg"],
];
const prods = []; // filled live from Firestore: [name, price, "", image, catIndex, title, description, id, stock, sizes]
const CAT = cats.map((c) => c[0]);
const meta = (p) => {
  const t =
    p[5] || (p[0].includes("|") ? p[0].split("|")[1].trim() : "Vintage Derby");
  let d =
    p[6] ||
    p[0]
      .replace(/^(Ferrina by )?Checkpoint MARIKINA MADE /i, "")
      .replace(/\s*\|.*$/, "")
      .toLowerCase();
  d = d ? d[0].toUpperCase() + d.slice(1) : "";
  return { t, d };
};
const price = (p) => (p[1] == null ? "Price on request" : money(p[1]));
const sizesFor = (p) =>
  p[9]?.length ? p[9] : /women/i.test(p[0]) ? [5, 6, 7, 8, 9] : [6, 7, 8, 9, 10, 11, 12];
const hay = (p) =>
  [p[0], p[5] || "", p[6] || "", CAT[p[4]]].join(" ").toLowerCase();

/* ---------- persisted state ---------- */
/* ---------- Firebase + persisted state (wishlist & cart are saved by product id) ---------- */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore();
const stamp = () => firebase.firestore.Timestamp.now();

/* ---------- store settings (edited in the admin Settings page) + hooks used by checkout.js / fitsure.js ---------- */
const viewHooks = {}, userHooks = [], onCfg = [], prodHooks = [];
const CFG_DEF = {
  shipping: { fee: 150, freeOver: 5000 },
  pay: { cod: { on: true }, gcash: { on: false, name: "", number: "", limit: 100000 }, bank: { on: false, bank: "", name: "", number: "", limit: 500000 } },
  fit: {
    fee: 150, capacity: 2, leadDays: 1, maxDays: 60, pairs: 3, closedDays: [0], closedDates: [],
    slots: ["9:00 AM – 11:00 AM", "11:00 AM – 1:00 PM", "1:00 PM – 3:00 PM", "3:00 PM – 5:00 PM", "5:00 PM – 7:00 PM"],
    cities: ["Marikina", "Quezon City", "Pasig", "Makati", "Taguig", "Mandaluyong", "San Juan"],
    services: [
      { name: "Home Shoe Cleaning", price: 350, max: 350, note: "Per pair" },
      { name: "Shoe Polishing", price: 150, max: 150, note: "Per pair" },
      { name: "Repair Pickup", price: 150, max: 150, note: "Per transaction. Repair fees are separate" },
      { name: "Additional Services", price: 100, max: 300, note: "Price depends on service, materials and labor" },
    ],
  },
};
const mergeCfg = (a, b) => { const o = { ...a }; for (const k in b || {}) o[k] = a[k] && typeof a[k] == "object" && !Array.isArray(a[k]) && b[k] && typeof b[k] == "object" ? mergeCfg(a[k], b[k]) : b[k] ?? a[k]; return o; };
let CFG = mergeCfg(CFG_DEF, {});
const applyCfgText = () => {
  $$("[data-fee]").forEach((el) => (el.textContent = money(+CFG.fit.fee || 0)));
  $$("[data-cities]").forEach((el) => (el.textContent = (CFG.fit.cities || []).length));
};
applyCfgText();
db.collection("settings").doc("shop").onSnapshot((s) => { CFG = mergeCfg(CFG_DEF, s.data() || {}); applyCfgText(); onCfg.forEach((f) => f()); }, () => {});
let user = null, authReady = false, ready = false, profile = {}, myOrders = [];
let wish = new Set(), cart = [];
let store = { wish: load("cp-wish", []), cart: load("cp-cart", []) };
const ix = (id) => prods.findIndex((p) => p[7] == id);
function hydrate() {
  wish = new Set(store.wish.map((id) => ix(id)).filter((i) => i >= 0));
  cart = store.cart.map((c) => ({ i: ix(c.id), size: c.size, q: c.q })).filter((c) => c.i >= 0 && prods[c.i][1] != null && c.q > 0);
}
function persist() {
  if (!ready) return;
  store = { wish: [...wish].map((i) => prods[i][7]), cart: cart.map((c) => ({ id: prods[c.i][7], size: c.size ?? null, q: c.q })) };
  save("cp-wish", store.wish); save("cp-cart", store.cart);
  if (user) db.collection("users").doc(user.uid).set(store, { merge: true }).catch(() => {});
  if (!$("#account").hidden) renderAccount();
}
const saveCart = persist;

/* ---------- layers (overlays, drawers, modals) ---------- */
const lastFocus = {};
const isOpen = (el) => el.classList.contains("open");
const LOCKERS = ["sp", "cd", "qv"];
function syncLock() {
  const on = LOCKERS.some((id) => isOpen($("#" + id)));
  if (on && !root.classList.contains("lock")) {
    root.style.setProperty(
      "--sbw",
      Math.max(0, innerWidth - root.clientWidth) + "px",
    );
  }
  root.classList.toggle("lock", on);
  if (!on) root.style.setProperty("--sbw", "0px");
}
function openEl(el, focusEl) {
  if (isOpen(el)) return;
  clearTimeout(el._t);
  lastFocus[el.id] = document.activeElement;
  el.hidden = false;
  void el.offsetWidth; // let the browser paint the closed state first
  el.classList.add("open");
  if (focusEl) focusEl.focus({ preventScroll: true });
  syncLock();
}
function closeEl(el, restore = true) {
  if (el.hidden || !isOpen(el)) return;
  el.classList.remove("open");
  clearTimeout(el._t);
  el._t = setTimeout(
    () => {
      if (!isOpen(el)) el.hidden = true;
      syncLock();
    },
    reduceMotion ? 0 : 340,
  );
  syncLock();
  if (restore) {
    const f = lastFocus[el.id];
    if (f && f.focus && document.contains(f)) f.focus({ preventScroll: true });
  }
}
function closeAll() {
  ["sp", "qv", "cd", "ap"].forEach((id) => closeEl($("#" + id), false));
  closeEl($("#scrim"), false);
}

/* ---------- scroll reveal ---------- */
const REV =
  ".perk,.prod,.cat,.hs,.pillar,.story>*,.sh,.shopnote,.band .txt,.band .img,.endcta,.stats .wrap>div,.news .wrap>*,.faq details,.toolbar,.pcount,.how+.steps,.box,.side";
const io =
  !reduceMotion && "IntersectionObserver" in window
    ? new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io.unobserve(e.target);
            }
          }),
        { threshold: 0.1, rootMargin: "0px 0px -5% 0px" },
      )
    : null;
function reveal(scope = document) {
  if (!io) return;
  scope.querySelectorAll(REV).forEach((el) => {
    if (el.dataset.rv) return;
    el.dataset.rv = 1;
    const idx = Math.min([...el.parentNode.children].indexOf(el), 7);
    el.style.setProperty("--d", idx * 70 + "ms");
    el.classList.add("rv");
    io.observe(el);
  });
}

/* ---------- categories & product grid ---------- */
$("#cats").innerHTML = cats
  .map(
    (c, i) =>
      `<a class="cat" href="#shop" data-c="${i}"><div class="cp"><img alt="" src="${c[1]}" loading="lazy"></div><div class="cl"><span>${c[0]}</span><span aria-hidden="true">→</span></div></a>`,
  )
  .join("");
let cf = -1,
  sq = "",
  sortBy = "0";
$("#ftabs").innerHTML = ["All styles", ...CAT]
  .map((n, k) => `<button data-f="${k - 1}">${n}</button>`)
  .join("");

const heart = (i) => {
  const w = wish.has(i);
  return `<button class="hb${w ? " on" : ""}" data-h="${i}" aria-label="Save to wishlist" aria-pressed="${w}"><svg class="ic"><use href="#i-heart"/></svg></button>`;
};
const stockTag = (p) => {
  const n = p[8] ?? 0;
  return `<span class="stk ${n <= 0 ? "out" : n <= 5 ? "low" : "ok"}">${n <= 0 ? "Out of stock" : n <= 5 ? `Only ${n} left` : `${n} in stock`}</span>`;
};
const card = ([p, i]) => {
  const { t, d } = meta(p);
  return `<article class="prod" data-i="${i}"><div class="img" data-qv="${i}"><svg class="ph" aria-hidden="true"><use href="#shoe"/></svg><img alt="${esc1(t)}" src="${p[3]}" loading="lazy" decoding="async" onload="this.parentNode.classList.add('ok')" onerror="this.style.visibility='hidden'"><span class="qvb">Quick view</span></div>${heart(i)}<div class="body"><span class="pc">${CAT[p[4]]}</span><h3><button type="button" class="ptl" data-qv="${i}">The ${esc1(t)}</button></h3><p class="pd">${esc1(d)}</p>${stockTag(p)}<div class="foot"><div class="pr">${price(p)}</div><button class="add" data-i="${i}" ${p[1] != null && (p[8] ?? 0) <= 0 ? "disabled" : ""}>${p[1] == null ? "Ask for price" : (p[8] ?? 0) <= 0 ? "Sold out" : "Add to Cart"}</button></div></div></article>`;
};
const matchQ = (p) => !sq || terms(sq).every((t) => hay(p).includes(t));
const renderP = () => {
  const list = prods
    .map((p, i) => [p, i])
    .filter(([p]) => (cf < 0 || p[4] == cf) && matchQ(p));
  const pv = (x) => (x[0][1] == null ? Infinity : x[0][1]);
  if (sortBy == "1") list.sort((a, b) => (pv(a) === pv(b) ? 0 : pv(a) < pv(b) ? -1 : 1));
  if (sortBy == "2") list.sort((a, b) => (pv(a) === pv(b) ? 0 : pv(a) < pv(b) ? 1 : -1));
  $("#ptitle").textContent = sq
    ? `Results for “${sq}”`
    : cf < 0
      ? "All styles"
      : CAT[cf];
  $("#pcount").innerHTML =
    list.length +
    (list.length == 1 ? " style" : " styles") +
    (sq
      ? ` for “${esc1(sq)}” · <button type="button" class="clr" data-clr>Clear search</button>`
      : "");
  $$("#ftabs button").forEach((b) => {
    const on = +b.dataset.f == cf;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
  });
  $("#prods").innerHTML = list.length
    ? list.map(card).join("")
    : `<p class="empty none">No styles ${sq ? "match your search" : "in this category yet"}.${sq ? ' <button type="button" class="clr" data-clr>Clear search</button>' : " Check back soon."}</p>`;
  $("#prods-home").innerHTML = prods
    .slice(0, 4)
    .map((p, i) => card([p, i]))
    .join("");
  reveal($("#prods"));
  reveal($("#prods-home"));
};
$("#sort").onchange = (e) => {
  sortBy = e.target.value;
  renderP();
};

/* ---------- wishlist ---------- */
/* Guests must sign in before using the wishlist or cart */
function needLogin(what) {
  if (user) return false;
  closeEl(qv, false);
  closeCart(false);
  toast(`Please sign in or create an account to ${what}`);
  goLogin(location.hash || "#home");
  return true;
}
function toggleWish(i) {
  if (needLogin("save to your wishlist")) return;
  const on = !wish.has(i);
  on ? wish.add(i) : wish.delete(i);
  persist();
  $$(`.hb[data-h="${i}"]`).forEach((b) => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
  });
  toast(on ? "Saved to your wishlist" : "Removed from wishlist");
}

/* ---------- cart ---------- */
const lineKey = (c) => c.i + "|" + c.size;
const MAX_PER_ADD = 5;
const stockOf = (i) => Math.max(0, +prods[i]?.[8] || 0);
const inCartOf = (i) => cart.filter((c) => c.i == i).reduce((a, c) => a + c.q, 0);
const roomFor = (i) => Math.max(0, stockOf(i) - inCartOf(i));
/* returns true only when the pair was really added */
function addCart(i, size, q = 1, quiet = false) {
  const f = cart.find((c) => c.i == i && c.size == size);
  const stock = stockOf(i), have = inCartOf(i), room = roomFor(i);
  if (stock <= 0) { toast("Sorry, this pair is out of stock"); return false; }
  if (q > room) { toast(room > 0 ? (have ? `Only ${room} more available` : `Only ${stock} left in stock`) : `You already have all ${stock} in your cart`); return false; }
  f ? (f.q += q) : cart.push({ i, size, q });
  rc(true);
  if (!quiet) toast(`The ${meta(prods[i]).t} added to cart`);
  return true;
}
function rc(bump) {
  const q = cart.reduce((a, c) => a + c.q, 0),
    b = $("#cart");
  b.textContent = q;
  b.hidden = !q;
  $("#cn").textContent = q ? `(${q})` : "";
  $("#bc").setAttribute("aria-label", q ? `Open cart, ${q} items` : "Open cart");
  if (bump && q) {
    b.classList.remove("bump");
    void b.offsetWidth;
    b.classList.add("bump");
  }
  $("#clist").innerHTML = cart.length
    ? cart
        .map((c, k) => {
          const p = prods[c.i];
          return `<div class="ci"><span class="thumb"><img class="shoe" alt="" src="${p[3]}"></span><div><b>The ${esc1(meta(p).t)}</b>${c.size != null ? `<small class="csz">Size ${c.size} (US)</small>` : ""}${inCartOf(c.i) > stockOf(c.i) ? `<small class="csz" style="color:#b3392b">${stockOf(c.i) > 0 ? "Only " + stockOf(c.i) + " in stock" : "Out of stock"}</small>` : ""}<div class="cpr">${money(p[1] * c.q)}${c.q > 1 ? `<small> · ${money(p[1])} each</small>` : ""}</div><div class="cr"><div class="qty"><button data-q="${k}:-1" aria-label="Decrease quantity">−</button><span aria-live="polite">${c.q}</span><button data-q="${k}:1" aria-label="Increase quantity" ${roomFor(c.i) < 1 ? "disabled" : ""}>+</button></div><button class="rm" data-rm="${k}">Remove</button></div></div></div>`;
        })
        .join("")
    : `<div class="cempty"><svg class="ic" aria-hidden="true"><use href="#i-bag"/></svg><p>Your cart is empty.</p><a class="btn blue" href="#shop">Start shopping</a></div>`;
  $("#ctot").textContent = money(
    cart.reduce((a, c) => a + prods[c.i][1] * c.q, 0),
  );
  saveCart();
}
function openCart() {
  openEl($("#scrim"));
  openEl($("#cd"), $("#cx"));
}
function closeCart(restore = true) {
  closeEl($("#cd"), restore);
  closeEl($("#scrim"), false);
}
$("#bc").onclick = () => (isOpen($("#cd")) ? closeCart() : openCart());
$("#cx").onclick = () => closeCart();
$("#scrim").onclick = () => closeCart();
$("#clist").onclick = (e) => {
  const rm = e.target.closest("[data-rm]");
  if (rm) {
    cart.splice(+rm.dataset.rm, 1);
    return rc();
  }
  const q = e.target.closest("[data-q]");
  if (!q) return;
  const [k, d] = q.dataset.q.split(":");
  if (!cart[k]) return;
  if (+d > 0 && roomFor(cart[k].i) < 1) return toast("No more stock available for this pair");
  cart[k].q += +d;
  if (cart[k].q < 1) cart.splice(k, 1);
  rc();
};
$("#chk").onclick = () => {
  if (!cart.length) return toast("Add a pair to your cart first");
  if (!user) { closeCart(false); goLogin("#checkout"); return toast("Please sign in or create an account to check out"); }
  closeCart(false); location.hash = "#checkout";
};

/* ---------- product preview (quick view) ---------- */
const qv = $("#qv"),
  qvc = $("#qvc"),
  qbody = $("#qbody");
let qi = -1,
  qid = null,
  qsize = null,
  qqty = 1;
/* keeps the quantity stepper inside what is really available */
function qvQty() {
  const cap = Math.max(1, Math.min(MAX_PER_ADD, roomFor(qi)));
  qqty = Math.min(cap, Math.max(1, qqty));
  const q = $("#qq"); if (q) q.textContent = qqty;
  const dn = qbody.querySelector('[data-qd="-1"]'), up = qbody.querySelector('[data-qd="1"]');
  if (dn) dn.disabled = qqty <= 1;
  if (up) up.disabled = qqty >= cap;
}
function qvRender(keep) {
  const p = prods[qi],
    { t, d } = meta(p),
    n = prods.length;
  qid = p[7];
  const room = roomFor(qi), out = stockOf(qi) <= 0, cap = Math.max(1, Math.min(MAX_PER_ADD, room));
  qqty = Math.min(cap, Math.max(1, qqty));
  qbody.innerHTML = `
    <div class="qimg" id="qimg">
      <svg class="ph" aria-hidden="true"><use href="#shoe"/></svg>
      <img alt="${esc1(t)}" src="${p[3]}" decoding="async" onload="this.parentNode.classList.add('ok')" onerror="this.style.visibility='hidden'">
      ${heart(qi)}
    </div>
    <div class="qinfo">
      <div class="qnav">
        <span class="pc">${CAT[p[4]]}</span>
        <span class="qpager">
          <button type="button" data-qn="-1" aria-label="Previous product"><svg class="ic" style="transform:scaleX(-1)"><use href="#i-chev"/></svg></button>
          <span>${qi + 1} / ${n}</span>
          <button type="button" data-qn="1" aria-label="Next product"><svg class="ic"><use href="#i-chev"/></svg></button>
        </span>
      </div>
      <h2 id="qvt">The ${esc1(t)}</h2>
      <div class="qprice">${price(p)}</div>${stockTag(p)}
      <p class="qdesc">${esc1(d)}.</p>
      <p class="qfull">${esc1(p[0])}</p>
      ${
        p[1] == null
          ? ""
          : `<div class="qsz">
        <div class="qlbl"><span>Select size (US)</span><span class="qerr" id="qerr" hidden>Please choose a size</span></div>
        <div class="sizes" id="sizes" role="radiogroup" aria-label="Size">
          ${sizesFor(p)
            .map(
              (s) =>
                `<button type="button" class="sz" role="radio" aria-checked="${qsize == s}" data-sz="${s}">${s}</button>`,
            )
            .join("")}
        </div>
      </div>`
      }
      <div class="qact">
        ${p[1] == null ? "" : `<div class="qs" aria-label="Quantity"><button type="button" data-qd="-1" aria-label="Decrease quantity" ${qqty <= 1 ? "disabled" : ""}>−</button><span id="qq" aria-live="polite">${qqty}</span><button type="button" data-qd="1" aria-label="Increase quantity" ${qqty >= cap ? "disabled" : ""}>+</button></div>`}
        <button type="button" class="go qadd" id="qadd" ${p[1] != null && (out || room < 1) ? "disabled" : ""}>${p[1] == null ? "Ask for price" : out ? "Out of stock" : room < 1 ? "Max in cart" : "Add to Cart"}</button>
      </div>
      <ul class="qperks">
        <li><svg class="ic"><use href="#i-shoe"/></svg>Marikina made, since MMXI</li>
        <li><svg class="ic"><use href="#i-truck"/></svg>Secure and fast delivery</li>
        <li><svg class="ic"><use href="#i-cal"/></svg>Try it at home with Fit-Sure — ${money(+CFG.fit.fee || 0)} per appointment</li>
      </ul>
      <a class="lnk" href="#fit">Not sure about your size? Book a fitting <span aria-hidden="true">→</span></a>
    </div>`;
  if (!keep) {
    qbody.scrollTop = 0;
    const info = qbody.querySelector(".qinfo");
    if (info) info.scrollTop = 0;
  }
}
function shakeSizes() {
  const s = $("#sizes"),
    e = $("#qerr");
  if (!s) return;
  if (e) e.hidden = false;
  s.classList.remove("shake");
  void s.offsetWidth;
  s.classList.add("shake");
}
function openQV(i, opts = {}) {
  qi = i;
  qsize = null;
  qqty = 1;
  qvRender();
  openEl(qv, qvc);
  if (opts.needSize && prods[i][1] != null) {
    toast("Choose a size to add this pair to your cart");
    setTimeout(shakeSizes, 380);
  }
}
function qvGo(dir) {
  qi = (qi + dir + prods.length) % prods.length;
  qsize = null;
  qqty = 1;
  if (reduceMotion) return qvRender();
  qvc.classList.add("swap");
  setTimeout(() => {
    qvRender();
    qvc.classList.remove("swap");
  }, 170);
}
qbody.addEventListener("click", (e) => {
  const sz = e.target.closest("[data-sz]");
  if (sz) {
    qsize = +sz.dataset.sz;
    $$("#sizes .sz").forEach((b) =>
      b.setAttribute("aria-checked", b === sz ? "true" : "false"),
    );
    $("#qerr").hidden = true;
    return;
  }
  const qd = e.target.closest("[data-qd]");
  if (qd) {
    qqty += +qd.dataset.qd;
    qvQty();
    return;
  }
  const qn = e.target.closest("[data-qn]");
  if (qn) return qvGo(+qn.dataset.qn);
  const add = e.target.closest("#qadd");
  if (add) {
    const p = prods[qi];
    if (p[1] == null) return toast("Please contact us for pricing on this pair");
    if (needLogin("add to your cart")) return;
    if (qsize == null) return shakeSizes();
    if (!addCart(qi, qsize, qqty, true)) return qvRender(true);
    add.textContent = "Added ✓";
    add.classList.add("done");
    setTimeout(() => {
      closeEl(qv, false);
      setTimeout(openCart, 160);
    }, 650);
  }
});
qbody.addEventListener("mousemove", (e) => {
  const z = e.target.closest(".qimg");
  if (!z) return;
  const r = z.getBoundingClientRect();
  z.style.setProperty("--ox", ((e.clientX - r.left) / r.width) * 100 + "%");
  z.style.setProperty("--oy", ((e.clientY - r.top) / r.height) * 100 + "%");
});
$("#qx").onclick = () => closeEl(qv);
qv.addEventListener("mousedown", (e) => {
  if (e.target === qv) closeEl(qv);
});

/* ---------- floating search ---------- */
const sp = $("#sp"),
  qin = $("#q"),
  sres = $("#sres");
let actIdx = -1;
$("#sug").innerHTML =
  "<span>Popular</span>" +
  ["Boots", "Loafers", "Patrol", "Sandals"]
    .map((s) => `<button type="button" data-sg="${s}">${s}</button>`)
    .join("");
function renderSearch() {
  const v = qin.value.trim(),
    ts = terms(v);
  actIdx = -1;
  $("#sug").hidden = !!v;
  if (!v) {
    sres.innerHTML = "";
    return;
  }
  const pr = prods
      .map((p, i) => [p, i])
      .filter(([p]) => ts.every((t) => hay(p).includes(t))),
    ct = cats
      .map((c, k) => [c, k])
      .filter(([c]) => ts.every((t) => c[0].toLowerCase().includes(t)));
  let h = "";
  ct.forEach(
    ([c, k]) =>
      (h += `<button type="button" class="sr sr-c" data-sc="${k}" data-nav><span class="st"><b>${hl(c[0], ts)}</b><small>Category</small></span><svg class="ic" aria-hidden="true"><use href="#i-chev"/></svg></button>`),
  );
  pr.slice(0, 6).forEach(([p, i]) => {
    const { t, d } = meta(p);
    h += `<button type="button" class="sr" data-qv="${i}" data-nav><span class="thumb"><img alt="" src="${p[3]}" loading="lazy" onerror="this.style.visibility='hidden'"></span><span class="st"><b>The ${hl(t, ts)}</b><small>${hl(d, ts)}</small></span><span class="sp">${price(p)}</span></button>`;
  });
  if (!pr.length && !ct.length)
    h = `<p class="sno">No results for “${esc1(v)}”.<small>Try “Boots”, “Loafers” or “Patrol”.</small></p>`;
  else if (pr.length)
    h += `<button type="button" class="sr sr-all" data-all-s data-nav>See all ${pr.length} ${pr.length == 1 ? "result" : "results"} for “${esc1(v)}” <span aria-hidden="true">→</span></button>`;
  sres.innerHTML = h;
}
function openSearch() {
  qin.value = "";
  renderSearch();
  openEl(sp, qin);
}
function goShop() {
  if (location.hash !== "#shop") location.hash = "#shop";
  else route();
}
function applySearch(v) {
  sq = v;
  cf = -1;
  renderP();
  closeEl(sp, false);
  goShop();
}
function showCategory(k) {
  cf = k;
  sq = "";
  renderP();
  goShop();
}
$("#bs").onclick = openSearch;
$("#sclose").onclick = () => closeEl(sp);
sp.addEventListener("mousedown", (e) => {
  if (e.target === sp) closeEl(sp);
});
qin.addEventListener("input", renderSearch);
qin.addEventListener("keydown", (e) => {
  if (e.key != "ArrowDown" && e.key != "ArrowUp") return;
  const items = [...sres.querySelectorAll("[data-nav]")];
  if (!items.length) return;
  e.preventDefault();
  actIdx =
    (actIdx + (e.key == "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items.forEach((b, k) => b.classList.toggle("act", k == actIdx));
  items[actIdx].scrollIntoView({ block: "nearest" });
});
$("#sf").addEventListener("submit", (e) => {
  e.preventDefault();
  const items = [...sres.querySelectorAll("[data-nav]")];
  if (actIdx >= 0 && items[actIdx]) return items[actIdx].click();
  const v = qin.value.trim();
  if (v) applySearch(v);
});
sres.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.sc != null) {
    closeEl(sp, false);
    showCategory(+b.dataset.sc);
  } else if (b.dataset.qv != null) closeEl(sp, false);
  else if (b.hasAttribute("data-all-s")) applySearch(qin.value.trim());
});
$("#sug").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sg]");
  if (!b) return;
  qin.value = b.dataset.sg;
  renderSearch();
  qin.focus();
});

/* ---------- account ---------- */
const ap = $("#ap");
let nextHash = null;
function goLogin(back, mode) {
  nextHash = back || null;
  location.hash = "#login" + (mode == "signup" ? "?mode=signup" : "");
}
$("#ba").onclick = () => {
  if (!user) { closeEl(ap, false); return goLogin(location.hash.startsWith("#login") ? nextHash : location.hash || "#home"); }
  isOpen(ap) ? closeEl(ap) : openEl(ap, $("#aout"));
  $("#ba").setAttribute("aria-expanded", isOpen(ap));
};

/* ---------- login / sign-up page ---------- */
let lgMode = "signin";
const lgErr = (m) => ($("#lgerr").textContent = m || "");
function setMode(m) {
  lgMode = m;
  const up = m == "signup";
  $("#tab-in").setAttribute("aria-selected", !up);
  $("#tab-up").setAttribute("aria-selected", up);
  $("#lgnw").hidden = $("#lgcw").hidden = !up;
  $("#lgt").textContent = up ? "Create your account" : "Welcome back";
  $("#lgs").textContent = up ? "It only takes a moment." : "Sign in to see your orders and wishlist.";
  $("#lgsub").textContent = up ? "Create account" : "Sign in";
  $("#lgfg").hidden = up;
  $("#lgp").autocomplete = up ? "new-password" : "current-password";
  lgErr("");
}
$("#tab-in").onclick = () => setMode("signin");
$("#tab-up").onclick = () => setMode("signup");
$("#lgv").onclick = () => {
  const show = $("#lgp").type == "password";
  $("#lgp").type = $("#lgc").type = show ? "text" : "password";
  $("#lgv").textContent = show ? "Hide" : "Show";
  $("#lgv").setAttribute("aria-pressed", show);
  $("#lgv").setAttribute("aria-label", show ? "Hide password" : "Show password");
};
function authMsg(e) {
  const c = e.code || "";
  if (/user-not-found|wrong-password|invalid-credential|invalid-login/.test(c)) return "Wrong email or password.";
  if (c.includes("email-already-in-use")) return "An account with this email already exists. Try signing in.";
  if (c.includes("weak-password")) return "Password needs at least 6 characters.";
  if (c.includes("invalid-email")) return "Enter a valid email address.";
  if (c.includes("too-many-requests")) return "Too many attempts. Please wait a moment and try again.";
  if (c.includes("network")) return "Network problem. Check your connection and try again.";
  return e.message || "Something went wrong. Please try again.";
}
$("#lgf").onsubmit = async (e) => {
  e.preventDefault();
  const m = $("#lge").value.trim(), pw = $("#lgp").value, up = lgMode == "signup";
  if (!/^\S+@\S+\.\S+$/.test(m)) return lgErr("Enter a valid email address.");
  if (pw.length < 6) return lgErr("Password needs at least 6 characters.");
  if (up && !$("#lgn").value.trim()) return lgErr("Please enter your full name.");
  if (up && pw != $("#lgc").value) return lgErr("Passwords don't match.");
  lgErr("");
  const btn = $("#lgsub"); btn.disabled = true;
  try {
    if (up) {
      const name = $("#lgn").value.trim();
      const c = await auth.createUserWithEmailAndPassword(m, pw);
      await db.collection("users").doc(c.user.uid).set({ name, email: m, createdAt: stamp() }, { merge: true });
      profile = { ...profile, name, email: m };
      $("#aname").textContent = name;
      toast("Account created. Welcome!");
    } else {
      await auth.signInWithEmailAndPassword(m, pw);
      toast("Signed in");
    }
    $("#lgf").reset();
  } catch (x) { lgErr(authMsg(x)); }
  btn.disabled = false;
};
$("#lgfg").onclick = async () => {
  const m = $("#lge").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(m)) { lgErr("Enter your email above, then tap “Forgot your password?”"); return $("#lge").focus(); }
  try { await auth.sendPasswordResetEmail(m); lgErr(""); toast("Password reset email sent. Check your inbox."); }
  catch (x) { lgErr(/user-not-found/.test(x.code || "") ? "No account found for that email." : authMsg(x)); }
};
$("#aout").onclick = $("#aout2").onclick = () => { auth.signOut(); closeEl(ap, false); toast("Signed out"); };

/* ---------- global events ---------- */
document.addEventListener("click", (e) => {
  const tg = e.target;
  if (isOpen(ap) && !tg.closest("#ap,#ba")) {
    closeEl(ap, false);
    $("#ba").setAttribute("aria-expanded", "false");
  }
  const h = tg.closest(".hb[data-h]");
  if (h) return toggleWish(+h.dataset.h);
  const a = tg.closest(".add[data-i]");
  if (a) {
    const i = +a.dataset.i;
    if (prods[i][1] == null) return toast("Please contact us for pricing on this pair");
    if (stockOf(i) <= 0) return toast("Sorry, this pair is out of stock");
    if (needLogin("add to your cart")) return;
    return openQV(i, { needSize: true });
  }
  if (tg.closest("[data-clr]")) {
    sq = "";
    return renderP();
  }
  const q = tg.closest("[data-qv]");
  if (q) return openQV(+q.dataset.qv);
  const c = tg.closest(".prod");
  if (c && !tg.closest("button,a")) return openQV(+c.dataset.i);
  const ct = tg.closest(".cat");
  if (ct) {
    cf = +ct.dataset.c;
    sq = "";
    renderP();
  }
  const fb = tg.closest("#ftabs button");
  if (fb) {
    cf = +fb.dataset.f;
    sq = "";
    renderP();
  }
  if (tg.closest("[data-all]")) {
    cf = -1;
    sq = "";
    renderP();
  }
  if (tg.closest('a[href^="#"]')) setTimeout(route, 0);
});
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
function trap(e) {
  const top = ["sp", "qv", "cd"].map((id) => $("#" + id)).find(isOpen);
  if (!top) return;
  const box = top.id == "qv" ? qvc : top;
  const f = [
    ...box.querySelectorAll(
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
    ),
  ].filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0],
    last = f[f.length - 1],
    cur = document.activeElement;
  if (!box.contains(cur) || (e.shiftKey && (cur === first || cur === box))) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (!e.shiftKey && cur === last) {
    e.preventDefault();
    first.focus();
  }
}
addEventListener("keydown", (e) => {
  if (e.key == "Escape") {
    if (isOpen(sp)) closeEl(sp);
    else if (isOpen(qv)) closeEl(qv);
    else if (isOpen($("#cd"))) closeCart();
    else if (isOpen(ap)) {
      closeEl(ap);
      $("#ba").setAttribute("aria-expanded", "false");
    }
    return;
  }
  if (e.key == "Tab") return trap(e);
  if (
    ((e.key == "k" || e.key == "K") && (e.metaKey || e.ctrlKey)) ||
    (e.key == "/" && !typing() && !isOpen(sp))
  ) {
    e.preventDefault();
    if (!isOpen(sp)) openSearch();
    return;
  }
  if (isOpen(qv) && !isOpen(sp) && !typing()) {
    if (e.key == "ArrowLeft") qvGo(-1);
    if (e.key == "ArrowRight") qvGo(1);
  }
});
addEventListener(
  "scroll",
  () => $("header").classList.toggle("scrolled", scrollY > 8),
  { passive: true },
);

/* ---------- newsletter ---------- */
$("#ns").onclick = async () => {
  const v = $("#ne").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(v)) {
    toast("Enter a valid email address");
    return;
  }
  const btn = $("#ns"), label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await db.collection("newsletter").add({ email: v, createdAt: stamp() });
    $("#ne").value = "";
    toast("Email recorded. Newsletter delivery isn't configured in this demo.");
  } catch (e) {
    toast("Couldn't record your email: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
};

/* ---------- routing ---------- */
const VIEWS = ["home", "shop", "fit", "about", "account", "login", "checkout"],
  ALIAS = { faq: "fit", book: "fit" },
  TITLES = {
    home: "Checkpoint Shoes",
    shop: "Shop — Checkpoint Shoes",
    fit: "Fit-Sure Service — Checkpoint Shoes",
    about: "About — Checkpoint Shoes",
    account: "My account — Checkpoint Shoes",
    login: "Sign in — Checkpoint Shoes",
    checkout: "Checkout — Checkpoint Shoes",
  };
function route() {
  const [h, qs] = (location.hash.slice(1) || "home").split("?"),
    v = VIEWS.includes(h) ? h : ALIAS[h] || "home";
  if (v == "account" && authReady && !user) {
    nextHash = "#account";
    toast("Sign in to see your account");
    history.replaceState(null, "", "#login");
    return route();
  }
  if (v == "checkout" && !authReady) { VIEWS.forEach((n) => ($("#" + n).hidden = true)); return; }
  if (v == "checkout" && !user) {
    nextHash = "#checkout";
    history.replaceState(null, "", "#login");
    return route();
  }
  if (v == "login" && authReady && user) {
    const to = nextHash && !nextHash.startsWith("#login") ? nextHash : "#account";
    nextHash = null;
    history.replaceState(null, "", to);
    return route();
  }
  if (v == "login") setMode(new URLSearchParams(qs || "").get("mode") == "signup" ? "signup" : "signin");
  closeAll();
  VIEWS.forEach((n) => ($("#" + n).hidden = n != v));
  $$("nav a").forEach((a) => {
    const on = a.getAttribute("href") == "#" + v;
    a.classList.toggle("on", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = TITLES[v];
  const el = ALIAS[h] ? document.getElementById(h) : null;
  if (el) el.scrollIntoView();
  else scrollTo(0, 0);
  viewHooks[v]?.();
  reveal($("#" + v));
}
addEventListener("hashchange", route);

/* ---------- init ---------- */
renderP();
rc();
route();
reveal();

/* ---------- click ripple ---------- */
document.addEventListener("pointerdown", (e) => {
  if (reduceMotion) return;
  const el = e.target.closest(
    ".btn,.go,.add,.sug button,.ftabs button,.slot,.sz,.seg button,.qs button,.qty button,.sx,.qx",
  );
  if (!el || el.disabled) return;
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.style.overflow = "hidden";
  const r = el.getBoundingClientRect(),
    d = Math.max(r.width, r.height) * 2,
    s = document.createElement("span");
  s.className = "rip";
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  el.appendChild(s);
  s.addEventListener("animationend", () => s.remove());
});
/* ---------- live products, accounts, orders (Firestore) ---------- */
db.collection("products").onSnapshot((s) => {
  const L = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.published !== false)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0) || a.name.localeCompare(b.name));
  prods.length = 0;
  L.forEach((x) => prods.push([x.name, x.price, "", x.image || "", Math.max(0, CAT.indexOf(x.category)), x.title || "", x.description || "", x.id, x.stock ?? 0, x.sizes || []]));
  ready = true; hydrate(); renderP(); rc(); prodHooks.forEach((f) => f());
  if (isOpen(qv)) { const k = ix(qid); if (k < 0) closeEl(qv, false); else { qi = k; qvRender(true); } }
  if (!$("#account").hidden) renderAccount();
}, (e) => toast("Couldn't load products: " + e.message));

const STEPS = ["pending", "processing", "shipped", "completed"];
const LABEL = { pending: "Order placed", processing: "Preparing", shipped: "Shipped", completed: "Delivered", cancelled: "Cancelled" };
let unsubOrders = null, wasIn = false;
const seen = {};
auth.onAuthStateChanged(async (u) => {
  user = u; authReady = true;
  $("#aform").hidden = !!u; $("#awel").hidden = !u;
  if (unsubOrders) unsubOrders(), (unsubOrders = null);
  if (u) {
    wasIn = true;
    try {
      profile = (await db.collection("users").doc(u.uid).get()).data() || {};
      const cartM = [...(profile.cart || [])];
      store.cart.forEach((c) => { if (!cartM.some((x) => x.id == c.id && x.size == c.size)) cartM.push(c); });
      store = { wish: [...new Set([...(profile.wish || []), ...store.wish])], cart: cartM };
    } catch (e) { toast("Couldn't load your account: " + e.message); }
    $("#aname").textContent = profile.name || u.email;
    hydrate(); renderP(); rc(); persist();
    unsubOrders = db.collection("orders").where("userId", "==", u.uid).onSnapshot((s) => {
      myOrders = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      myOrders.forEach((o) => { if (seen[o.id] && seen[o.id] != o.status) toast(`Order ${o.no || "#" + o.id.slice(0, 6).toUpperCase()} is now: ${LABEL[o.status] || o.status}`); seen[o.id] = o.status; });
      renderAccount();
    });
  } else {
    profile = {}; myOrders = [];
    if (wasIn) { wasIn = false; store = { wish: [], cart: [] }; hydrate(); renderP(); rc(); }
  }
  userHooks.forEach((f) => f(u));
  if (location.hash == "#account" || location.hash.startsWith("#login") || location.hash.startsWith("#checkout")) route();
});

function renderAccount() {
  if (!user) return;
  const nm = profile.name || user.email.split("@")[0];
  $("#ahello").textContent = user.email;
  $("#ahname").textContent = "Hello, " + nm.split(" ")[0];
  $("#aav").textContent = nm.trim()[0].toUpperCase();
  $("#ast-o").textContent = myOrders.length;
  $("#ast-w").textContent = wish.size;
  $("#ast-t").textContent = myOrders.filter((o) => o.status == "processing" || o.status == "shipped").length + FIT.my.filter((b) => b.status == "confirmed").length;
  renderMyOrders();
  renderMyBooks();
  $("#wlist").innerHTML = wish.size ? [...wish].map((i) => card([prods[i], i])).join("") : `<div class="ac-empty"><b>Your wishlist is empty</b><p>Tap the heart on any pair to save it here.</p></div>`;
  reveal($("#wlist"));
  [["acn", "name"], ["acp", "phone"], ["aca", "address"]].forEach(([id, k]) => { if (document.activeElement.id != id) $("#" + id).value = profile[k] || ""; });
}
$("#acf").onsubmit = async (e) => {
  e.preventDefault();
  profile = { ...profile, name: $("#acn").value.trim(), phone: $("#acp").value.trim(), address: $("#aca").value.trim() };
  try {
    await db.collection("users").doc(user.uid).set({ name: profile.name, phone: profile.phone, address: profile.address, email: user.email }, { merge: true });
    $("#aname").textContent = profile.name || user.email; toast("Details saved");
  } catch (x) { toast(x.message); }
};
