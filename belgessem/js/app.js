// Belgessem — logique commune : en-tête, pied de page, panier, pages.
(() => {
  const PRODUCTS = window.BELGESSEM_PRODUCTS || [];
  const CART_KEY = "belgessem-cart";
  const SHIPPING_FREE_FROM = 80;
  const SHIPPING_PRICE = 5.9;

  const $ = (sel, root = document) => root.querySelector(sel);
  const euro = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const CATEGORY_LABEL = { slips: "Slips connectés", telephones: "Téléphones", packs: "Packs" };

  // ---------- Panier (localStorage, avec repli en mémoire) ----------
  let memoryCart = [];
  const readCart = () => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return memoryCart; }
  };
  const writeCart = (cart) => {
    memoryCart = cart;
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* stockage indisponible */ }
    updateCartCount();
  };
  const addToCart = (id, option, qty = 1) => {
    const cart = readCart();
    const line = cart.find((l) => l.id === id && l.option === option);
    if (line) line.qty += qty; else cart.push({ id, option, qty });
    writeCart(cart);
    toast(`${byId(id).name} ajouté au panier`);
  };
  const cartCount = () => readCart().reduce((n, l) => n + l.qty, 0);
  const updateCartCount = () => {
    const el = $("#cart-count");
    if (!el) return;
    const n = cartCount();
    el.textContent = n;
    el.hidden = n === 0;
  };

  // ---------- Illustrations produit (SVG, aucune image externe) ----------
  function productArt(p) {
    if (p.category === "telephones") {
      return `<svg viewBox="0 0 200 200" aria-hidden="true">
        <rect x="58" y="18" width="84" height="164" rx="16" fill="${p.color}"/>
        <rect x="64" y="30" width="72" height="140" rx="9" fill="url(#scr-${p.id})"/>
        <rect x="88" y="23" width="24" height="4" rx="2" fill="#ffffff55"/>
        <circle cx="100" cy="92" r="16" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
        <text x="100" y="98" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" font-family="system-ui">B</text>
        <defs><linearGradient id="scr-${p.id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
      </svg>`;
    }
    if (p.category === "packs") {
      return `<svg viewBox="0 0 200 200" aria-hidden="true">
        <path d="M20 70 Q60 60 100 72 Q140 60 180 70 L172 104 Q140 112 128 140 L72 140 Q60 112 28 104 Z" fill="${p.color}" opacity=".85"/>
        <rect x="112" y="40" width="58" height="116" rx="12" fill="#0f172a"/>
        <rect x="117" y="48" width="48" height="100" rx="7" fill="#38bdf8"/>
        <text x="141" y="104" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="system-ui">B</text>
      </svg>`;
    }
    return `<svg viewBox="0 0 200 200" aria-hidden="true">
      <path d="M22 62 Q62 50 100 64 Q138 50 178 62 L168 104 Q132 114 120 150 L80 150 Q68 114 32 104 Z" fill="${p.color}"/>
      <path d="M22 62 Q62 50 100 64 Q138 50 178 62 L176 74 Q138 62 100 76 Q62 62 24 74 Z" fill="#ffffff44"/>
      <circle cx="100" cy="100" r="11" fill="#fff" opacity=".95"/>
      <path d="M93 100 h4 l2 -5 l3 10 l2 -5 h3" fill="none" stroke="${p.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M118 88 q8 12 0 24 M126 82 q14 18 0 36" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>
    </svg>`;
  }

  const stars = (r) => `<span class="stars" aria-label="Note ${r} sur 5">${"★".repeat(Math.round(r))}${"☆".repeat(5 - Math.round(r))}</span> <span class="muted">${r.toFixed(1)}</span>`;

  function productCard(p) {
    return `<article class="card">
      <a class="card-media" href="produit.html?id=${p.id}" style="--tint:${p.color}">
        ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
        ${productArt(p)}
      </a>
      <div class="card-body">
        <p class="eyebrow">${CATEGORY_LABEL[p.category]}</p>
        <h3><a href="produit.html?id=${p.id}">${esc(p.name)}</a></h3>
        <p class="muted">${esc(p.tagline)}</p>
        <p class="rating">${stars(p.rating)}</p>
        <div class="card-foot">
          <p class="price">${euro(p.price)} ${p.oldPrice ? `<s>${euro(p.oldPrice)}</s>` : ""}</p>
          <button class="btn btn-small" data-add="${p.id}">Ajouter</button>
        </div>
      </div>
    </article>`;
  }

  // ---------- En-tête et pied de page communs ----------
  function layout() {
    const page = document.body.dataset.page;
    if (!$("#backdrop")) {
      // Fond de l'application : les avatars de Sandrata et Nour, voilés pour garder le texte lisible
      document.body.insertAdjacentHTML("afterbegin", `<div id="backdrop" aria-hidden="true">
        <div class="backdrop-img" style="background-image:url(img/avatar-1.jpg)"></div>
        <div class="backdrop-img" style="background-image:url(img/avatar-2.jpg)"></div>
        <p class="backdrop-name">Sandrata et Nour Belgessem</p>
      </div>`);
    }
    const link = (href, label, key) => `<a href="${href}"${page === key ? ' aria-current="page"' : ""}>${label}</a>`;
    $("#site-header").innerHTML = `
      <div class="topbar">Site fictif, aucune vente réelle · Livraison offerte dès ${SHIPPING_FREE_FROM} € · Retours gratuits sous 30 jours · Garantie 2 ans</div>
      <div class="container nav">
        <a class="logo" href="index.html"><span class="logo-mark">B</span>Belgessem</a>
        <button class="menu-toggle" aria-expanded="false" aria-controls="main-nav">Menu</button>
        <nav id="main-nav" class="nav-links">
          ${link("index.html", "Accueil", "home")}
          ${link("boutique.html?cat=slips", "Slips connectés", "slips")}
          ${link("boutique.html?cat=telephones", "Téléphones", "telephones")}
          ${link("boutique.html", "Boutique", "shop")}
          ${link("contact.html", "Contact", "contact")}
        </nav>
        <a class="cart-link" href="panier.html" aria-label="Panier">🛒 Panier <span id="cart-count" class="cart-count" hidden>0</span></a>
      </div>`;
    $("#site-footer").innerHTML = `
      <div class="container footer-grid">
        <div><a class="logo" href="index.html"><span class="logo-mark">B</span>Belgessem</a>
          <p class="muted">Slips connectés et téléphones intelligents, pensés pour fonctionner ensemble.</p></div>
        <div><h4>Boutique</h4><a href="boutique.html?cat=slips">Slips connectés</a><a href="boutique.html?cat=telephones">Téléphones</a><a href="boutique.html?cat=packs">Packs</a></div>
        <div><h4>Aide</h4><a href="contact.html#faq">FAQ</a><a href="contact.html">Contact</a><a href="contact.html#livraison">Livraison et retours</a></div>
        <div><h4>Belgessem</h4><a href="index.html#apropos">À propos</a><a href="index.html#techno">Notre technologie</a></div>
      </div>
      <p class="container copyright">© ${new Date().getFullYear()} Belgessem. Tous droits réservés.</p>`;
    const toggle = $(".menu-toggle");
    toggle.addEventListener("click", () => {
      const open = $("#main-nav").classList.toggle("open");
      toggle.setAttribute("aria-expanded", open);
    });
    updateCartCount();
  }

  let toastTimer;
  function toast(msg) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // Bouton « Ajouter » sur les cartes : première option par défaut
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const p = byId(btn.dataset.add);
    addToCart(p.id, p.sizes[Math.min(1, p.sizes.length - 1)]);
  });

  // ---------- Pages ----------
  const pages = {
    home() {
      $("#featured-slips").innerHTML = PRODUCTS.filter((p) => p.category === "slips").slice(0, 3).map(productCard).join("");
      $("#featured-phones").innerHTML = PRODUCTS.filter((p) => p.category === "telephones").map(productCard).join("");
    },

    shop() {
      const params = new URLSearchParams(location.search);
      const state = { cat: params.get("cat") || "all", sort: "featured", q: "" };
      if (state.cat !== "all") document.body.dataset.page = state.cat; // menu actif
      layout();
      const grid = $("#product-grid");
      const render = () => {
        let list = PRODUCTS.filter((p) => state.cat === "all" || p.category === state.cat);
        if (state.q) list = list.filter((p) => (p.name + p.tagline + p.description).toLowerCase().includes(state.q));
        if (state.sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
        if (state.sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
        if (state.sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
        grid.innerHTML = list.length ? list.map(productCard).join("") : `<p class="empty">Aucun produit ne correspond à votre recherche.</p>`;
        $("#result-count").textContent = `${list.length} produit${list.length > 1 ? "s" : ""}`;
        $("#shop-title").textContent = state.cat === "all" ? "Toute la boutique" : CATEGORY_LABEL[state.cat];
        document.querySelectorAll("[data-cat]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === state.cat));
      };
      document.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
        state.cat = b.dataset.cat;
        history.replaceState(null, "", state.cat === "all" ? "boutique.html" : `boutique.html?cat=${state.cat}`);
        render();
      }));
      $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
      $("#search").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
      render();
      return true; // layout déjà fait
    },

    product() {
      const p = byId(new URLSearchParams(location.search).get("id"));
      const root = $("#product");
      if (!p) { root.innerHTML = `<div class="empty"><h1>Produit introuvable</h1><a class="btn" href="boutique.html">Retour à la boutique</a></div>`; return; }
      document.title = `${p.name} — Belgessem`;
      const optLabel = p.category === "telephones" ? "Stockage" : "Taille";
      root.innerHTML = `
        <nav class="breadcrumb"><a href="index.html">Accueil</a> › <a href="boutique.html?cat=${p.category}">${CATEGORY_LABEL[p.category]}</a> › ${esc(p.name)}</nav>
        <div class="product-layout">
          <div class="product-media" style="--tint:${p.color}">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}${productArt(p)}</div>
          <div class="product-info">
            <p class="eyebrow">${CATEGORY_LABEL[p.category]}</p>
            <h1>${esc(p.name)}</h1>
            <p class="lead">${esc(p.tagline)}</p>
            <p class="rating">${stars(p.rating)}</p>
            <p class="price big">${euro(p.price)} ${p.oldPrice ? `<s>${euro(p.oldPrice)}</s>` : ""}</p>
            <p>${esc(p.description)}</p>
            <ul class="checks">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
            <form id="buy" class="buy">
              <fieldset><legend>${optLabel}</legend>
                <div class="options">${p.sizes.map((s, i) => `<label><input type="radio" name="opt" value="${esc(s)}" ${i === 0 ? "checked" : ""}><span>${esc(s)}</span></label>`).join("")}</div>
              </fieldset>
              <div class="buy-row">
                <label class="qty">Quantité <input type="number" name="qty" min="1" max="10" value="1"></label>
                <button class="btn" type="submit">Ajouter au panier</button>
              </div>
            </form>
            <p class="muted small">✓ Livraison en 48 h · ✓ Retours gratuits 30 jours · ✓ Paiement sécurisé</p>
          </div>
        </div>
        <section class="specs"><h2>Caractéristiques techniques</h2>
          <table>${Object.entries(p.specs).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
        </section>
        <section><h2>Vous aimerez aussi</h2><div class="grid">${PRODUCTS.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 3).map(productCard).join("")}</div></section>`;
      $("#buy").addEventListener("submit", (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        addToCart(p.id, f.get("opt"), Math.max(1, Math.min(10, Number(f.get("qty")) || 1)));
      });
    },

    cart() {
      const root = $("#cart");
      const render = () => {
        const cart = readCart().filter((l) => byId(l.id));
        if (!cart.length) {
          root.innerHTML = `<div class="empty"><h2>Votre panier est vide</h2><p class="muted">Découvrez nos slips connectés et nos téléphones.</p><a class="btn" href="boutique.html">Voir la boutique</a></div>`;
          return;
        }
        const subtotal = cart.reduce((s, l) => s + byId(l.id).price * l.qty, 0);
        const shipping = subtotal >= SHIPPING_FREE_FROM ? 0 : SHIPPING_PRICE;
        root.innerHTML = `
          <div class="cart-layout">
            <div class="cart-lines">${cart.map((l, i) => {
              const p = byId(l.id);
              return `<div class="cart-line">
                <a class="cart-thumb" href="produit.html?id=${p.id}" style="--tint:${p.color}">${productArt(p)}</a>
                <div><h3><a href="produit.html?id=${p.id}">${esc(p.name)}</a></h3><p class="muted">${esc(l.option)} · ${euro(p.price)}</p></div>
                <div class="stepper"><button data-dec="${i}" aria-label="Retirer un">−</button><span>${l.qty}</span><button data-inc="${i}" aria-label="Ajouter un">+</button></div>
                <p class="price">${euro(p.price * l.qty)}</p>
                <button class="link" data-del="${i}">Supprimer</button>
              </div>`;
            }).join("")}</div>
            <aside class="summary">
              <h2>Récapitulatif</h2>
              <p><span>Sous-total</span><span>${euro(subtotal)}</span></p>
              <p><span>Livraison</span><span>${shipping ? euro(shipping) : "Offerte"}</span></p>
              ${shipping ? `<p class="muted small">Plus que ${euro(SHIPPING_FREE_FROM - subtotal)} pour la livraison offerte.</p>` : ""}
              <p class="total"><span>Total TTC</span><span>${euro(subtotal + shipping)}</span></p>
              <form id="checkout" class="checkout">
                <h3>Livraison</h3>
                <input required name="name" placeholder="Nom complet" autocomplete="name">
                <input required type="email" name="email" placeholder="E-mail" autocomplete="email">
                <input required name="address" placeholder="Adresse" autocomplete="street-address">
                <div class="two"><input required name="zip" placeholder="Code postal" autocomplete="postal-code"><input required name="city" placeholder="Ville" autocomplete="address-level2"></div>
                <button class="btn btn-block" type="submit">Valider la commande</button>
                <p class="muted small">Démonstration : aucun paiement n'est encaissé.</p>
              </form>
            </aside>
          </div>`;
      };
      root.addEventListener("click", (e) => {
        const t = e.target;
        const cart = readCart();
        if (t.dataset.inc) cart[t.dataset.inc].qty = Math.min(10, cart[t.dataset.inc].qty + 1);
        else if (t.dataset.dec) { const l = cart[t.dataset.dec]; l.qty -= 1; if (l.qty < 1) cart.splice(t.dataset.dec, 1); }
        else if (t.dataset.del) cart.splice(t.dataset.del, 1);
        else return;
        writeCart(cart);
        render();
      });
      root.addEventListener("submit", (e) => {
        if (e.target.id !== "checkout") return;
        e.preventDefault();
        const name = new FormData(e.target).get("name");
        const ref = "BG-" + Math.random().toString(36).slice(2, 8).toUpperCase();
        writeCart([]);
        root.innerHTML = `<div class="empty"><h2>Merci ${esc(name)} !</h2><p>Votre commande <strong>${ref}</strong> est enregistrée. Vous recevrez un e-mail de confirmation.</p><a class="btn" href="index.html">Retour à l'accueil</a></div>`;
      });
      render();
    },

    contact() {
      $("#contact-form").addEventListener("submit", (e) => {
        e.preventDefault();
        e.target.reset();
        toast("Message envoyé, nous vous répondons sous 24 h.");
      });
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    const name = document.body.dataset.init;
    if (name === "shop") return pages.shop(); // la boutique règle le menu actif avant le layout
    layout();
    pages[name]?.();
  });
})();
