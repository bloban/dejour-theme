/* ==========================================================================
   DE'JOUR — theme.js
   Kärnfunktioner utan externa bibliotek: drawers, varukorg, produktformulär,
   sök, drop-nedräkning, scroll-reveal, magnetiska knappar.
   Tunga effekter (GSAP) laddas separat i motion.js.
   ========================================================================== */
(() => {
  const DJ = (window.DJ = window.DJ || {});
  const cfg = (DJ.config = DJ.config || {});
  cfg.routes = cfg.routes || {};
  cfg.strings = cfg.strings || {};

  const html = document.documentElement;
  const motionOK = html.classList.contains('motion-ok');
  const isLite = html.classList.contains('is-lite');
  const hasHover = html.classList.contains('has-hover');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, ms = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };
  const parseHTML = (markup) => new DOMParser().parseFromString(markup, 'text/html');
  const announce = (msg) => {
    const el = document.getElementById('dj-live');
    if (!el || !msg) return;
    el.textContent = '';
    setTimeout(() => (el.textContent = msg), 60);
  };
  const onLoad = (fn) => {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  };
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));

  DJ.utils = { $, $$, debounce, parseHTML, announce, onLoad, idle };
  DJ.flags = { motionOK, isLite, hasHover };

  /* ------------------------------------------------------------------
     Dialoger (drawers, sök, meny)
     ------------------------------------------------------------------ */
  const Dialogs = {
    open(dialog, opener) {
      if (!dialog || dialog.open) return;
      dialog._opener = opener || document.activeElement;
      dialog.showModal();
      html.classList.add('is-locked');
      requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
      $$(`[aria-controls="${dialog.id}"]`).forEach((el) => el.setAttribute('aria-expanded', 'true'));
      dialog.dispatchEvent(new CustomEvent('dj:open'));
    },
    close(dialog) {
      if (!dialog || !dialog.open || dialog._closing) return;
      dialog._closing = true;
      dialog.classList.remove('is-open');
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        dialog._closing = false;
        dialog.close();
        if (!$('dialog.drawer[open]')) html.classList.remove('is-locked');
        $$(`[aria-controls="${dialog.id}"]`).forEach((el) => el.setAttribute('aria-expanded', 'false'));
        const opener = dialog._opener;
        if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
        dialog.dispatchEvent(new CustomEvent('dj:close'));
      };
      const panel = $('.drawer__panel', dialog);
      if (!motionOK || !panel) return finish();
      panel.addEventListener('transitionend', (e) => e.target === panel && finish());
      setTimeout(finish, 800);
    },
    closeAll() {
      $$('dialog.drawer[open]').forEach((d) => Dialogs.close(d));
    },
  };
  DJ.dialogs = Dialogs;

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) {
      const dialog = document.getElementById(opener.dataset.open);
      if (dialog && dialog.tagName === 'DIALOG') {
        e.preventDefault();
        Dialogs.closeAll();
        Dialogs.open(dialog, opener);
      }
      return;
    }
    const closer = e.target.closest('[data-close]');
    if (closer) {
      const dialog = closer.closest('dialog');
      if (dialog) {
        e.preventDefault();
        Dialogs.close(dialog);
      }
    }
  });

  // Esc: animera stängning i stället för att stänga direkt
  document.addEventListener(
    'cancel',
    (e) => {
      if (e.target.matches && e.target.matches('dialog.drawer')) {
        e.preventDefault();
        Dialogs.close(e.target);
      }
    },
    true
  );

  /* ------------------------------------------------------------------
     Header
     ------------------------------------------------------------------ */
  class SiteHeader extends HTMLElement {
    connectedCallback() {
      this.header = $('.site-header', this);
      if (!this.header) return;
      this.lastY = window.scrollY;
      this.ticking = false;
      this.onScroll = () => {
        if (this.ticking) return;
        this.ticking = true;
        requestAnimationFrame(() => this.update());
      };
      window.addEventListener('scroll', this.onScroll, { passive: true });
      // Första läsningen av scrollY väntar till nästa bildruta (ingen tvingad layout vid start)
      this.onScroll();

      this.dropdowns = $$('details[data-hover]', this);
      this.dropdowns.forEach((d) => {
        if (hasHover) {
          d.addEventListener('mouseenter', () => d.setAttribute('open', ''));
          d.addEventListener('mouseleave', () => d.removeAttribute('open'));
        }
        d.addEventListener('toggle', () => this.header.classList.toggle('is-open', this.dropdowns.some((x) => x.open)));
      });
      this.onDocClick = (e) => {
        this.dropdowns.forEach((d) => {
          if (d.open && !d.contains(e.target)) d.removeAttribute('open');
        });
      };
      this.onKey = (e) => {
        if (e.key !== 'Escape') return;
        this.dropdowns.forEach((d) => {
          if (d.open) {
            d.removeAttribute('open');
            $('summary', d)?.focus();
          }
        });
      };
      document.addEventListener('click', this.onDocClick);
      document.addEventListener('keydown', this.onKey);
    }

    disconnectedCallback() {
      window.removeEventListener('scroll', this.onScroll);
      document.removeEventListener('click', this.onDocClick);
      document.removeEventListener('keydown', this.onKey);
    }

    update() {
      const y = Math.max(0, window.scrollY);
      this.header.classList.toggle('is-scrolled', y > 8);
      const goingDown = y > this.lastY + 2;
      const goingUp = y < this.lastY - 2;
      const busy = $('dialog.drawer[open]') || this.dropdowns?.some((d) => d.open);
      if (goingDown && y > 280 && !busy) this.header.classList.add('is-hidden');
      else if (goingUp || y < 280) this.header.classList.remove('is-hidden');
      this.lastY = y;
      this.ticking = false;
    }
  }
  customElements.define('site-header', SiteHeader);

  /* ------------------------------------------------------------------
     Varukorg (Ajax Cart API + Section Rendering API)
     ------------------------------------------------------------------ */
  const Cart = {
    sectionIds() {
      return [...new Set($$('[data-cart-section]').map((el) => el.dataset.cartSection))];
    },

    async add(formData, source) {
      const ids = this.sectionIds();
      if (ids.length) {
        formData.append('sections', ids.join(','));
        formData.append('sections_url', window.location.pathname);
      }
      const variantId = formData.get('id');
      const quantity = Number(formData.get('quantity') || 1);
      const deferred = this.startLinesEvent(source, 'add', variantId, quantity);

      const res = await fetch(cfg.routes.cartAdd, {
        method: 'POST',
        headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || json.status) {
        this.dispatchError(source, json.description || json.message, json.status);
        if (deferred) deferred.reject(new Error(json.description || json.message));
        throw json;
      }
      this.render(json.sections);
      this.resolveLinesEvent(deferred);
      document.dispatchEvent(new CustomEvent('dj:cart:updated', { detail: { source: 'add' } }));
      return json;
    },

    async change(line, quantity, source) {
      const ids = this.sectionIds();
      const deferred = this.startLinesEvent(source, quantity === 0 ? 'remove' : 'update', null, quantity, line);
      const res = await fetch(cfg.routes.cartChange, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line, quantity, sections: ids, sections_url: window.location.pathname }),
      });
      const json = await res.json();
      if (!res.ok) {
        this.dispatchError(source, json.description || json.message, json.status);
        if (deferred) deferred.reject(new Error(json.description || json.message));
        throw json;
      }
      this.render(json.sections);
      this.updateCount(json.item_count);
      if (deferred) {
        const { CartLinesUpdateEvent } = window.StandardEvents || {};
        if (CartLinesUpdateEvent && json.currency) {
          deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(json) });
        }
      }
      document.dispatchEvent(new CustomEvent('dj:cart:updated', { detail: { source: 'change', cart: json } }));
      return json;
    },

    async updateNote(note) {
      await fetch(cfg.routes.cartUpdate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ note }),
      });
    },

    async refresh() {
      const ids = this.sectionIds();
      const url = `${cfg.routes.cart}.js${ids.length ? `?sections=${ids.join(',')}` : ''}`;
      const json = await fetch(url, { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (json.sections) this.render(json.sections);
      this.updateCount(json.item_count);
      return json;
    },

    render(sections) {
      if (!sections) return;
      Object.entries(sections).forEach(([id, markup]) => {
        if (!markup) return;
        const doc = parseHTML(markup);
        const fresh = doc.querySelector(`[data-cart-section="${id}"]`);
        if (!fresh) return;
        $$(`[data-cart-section="${id}"]`).forEach((target) => {
          target.innerHTML = fresh.innerHTML;
          initReveal(target);
        });
      });
      const counter = $('[data-cart-section] [data-cart-count-value]');
      if (counter) this.updateCount(Number(counter.dataset.cartCountValue));
    },

    updateCount(count) {
      if (typeof count !== 'number' || Number.isNaN(count)) return;
      $$('[data-cart-count]').forEach((el) => {
        const changed = el.dataset.count !== String(count);
        el.textContent = count;
        el.dataset.count = count;
        if (changed && count > 0) {
          el.classList.remove('is-bumped');
          void el.offsetWidth;
          el.classList.add('is-bumped');
        }
      });
    },

    open(opener) {
      const drawer = document.getElementById('CartDrawer');
      if (drawer) Dialogs.open(drawer, opener);
      else window.location.href = cfg.routes.cart;
    },

    // Shopify Standard Events (statistik) — samma kontrakt som Dawn
    startLinesEvent(source, action, variantId, quantity, line) {
      const { CartLinesUpdateEvent } = window.StandardEvents || {};
      if (!CartLinesUpdateEvent || !source || !source.dispatchEvent) return null;
      try {
        const deferred = CartLinesUpdateEvent.createPromise();
        const lines = variantId ? [{ merchandiseId: variantId, quantity }] : [{ line, quantity }];
        source.dispatchEvent(
          new CartLinesUpdateEvent({ action, context: 'product', lines, promise: deferred.promise })
        );
        return deferred;
      } catch (e) {
        return null;
      }
    },

    resolveLinesEvent(deferred) {
      if (!deferred) return;
      const { CartLinesUpdateEvent } = window.StandardEvents || {};
      fetch(`${cfg.routes.cart}.js`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((cart) => {
          if (!cart || !cart.currency) throw new Error('Missing currency in cart response');
          deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart) });
        })
        .catch((e) => deferred.reject(e));
    },

    dispatchError(source, message, code) {
      const { CartErrorEvent } = window.StandardEvents || {};
      if (!CartErrorEvent || !source || !source.dispatchEvent) return;
      try {
        source.dispatchEvent(new CartErrorEvent({ error: message, code }));
      } catch (e) {
        /* statistik får aldrig stoppa köpet */
      }
    },
  };
  DJ.cart = Cart;

  const lineTimers = {};
  function changeLine(line, quantity, row) {
    if (!line) return;
    clearTimeout(lineTimers[line]);
    row?.classList.add('is-loading');
    lineTimers[line] = setTimeout(async () => {
      try {
        await Cart.change(line, quantity, row);
        announce(cfg.strings.cartUpdated);
      } catch (err) {
        row?.classList.remove('is-loading');
        const box = row && $('[data-line-error]', row);
        if (box) {
          box.hidden = false;
          box.textContent = err.description || err.message || cfg.strings.cartError;
        }
      }
    }, 320);
  }

  document.addEventListener('click', (e) => {
    const qtyBtn = e.target.closest('[data-qty-btn]');
    if (qtyBtn) {
      const input = $('input', qtyBtn.closest('.qty'));
      if (!input) return;
      const step = Number(input.step) || 1;
      const min = input.min !== '' ? Number(input.min) : 0;
      const max = input.max ? Number(input.max) : Infinity;
      let value = (Number(input.value) || 0) + (qtyBtn.dataset.qtyBtn === 'plus' ? step : -step);
      value = Math.max(min, Math.min(max, value));
      if (value !== Number(input.value)) {
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    const remove = e.target.closest('[data-cart-remove]');
    if (remove) {
      e.preventDefault();
      changeLine(Number(remove.dataset.line), 0, remove.closest('.cart-line'));
    }
  });

  document.addEventListener('change', (e) => {
    const qtyInput = e.target.closest('[data-cart-qty]');
    if (qtyInput) {
      changeLine(Number(qtyInput.dataset.line), Math.max(0, Number(qtyInput.value) || 0), qtyInput.closest('.cart-line'));
      return;
    }
    if (e.target.matches('[data-autosubmit]')) e.target.form?.submit();
  });

  document.addEventListener(
    'input',
    debounce((e) => {
      if (e.target.matches && e.target.matches('[data-cart-note]')) Cart.updateNote(e.target.value);
    }, 500)
  );

  // Shopify Standard Actions (t.ex. Shop-appar som uppdaterar varukorgen)
  const initStandardActions = () => {
    const actions = window.Shopify && window.Shopify.actions;
    if (!actions) return;
    try {
      actions.openCart?.configure({
        async handler(defaultHandler) {
          if (document.getElementById('CartDrawer')) return Cart.open();
          return defaultHandler();
        },
      });
      actions.updateCart?.configure({
        eventTarget: () => document,
        async handler(defaultHandler) {
          const result = await defaultHandler();
          try {
            await Cart.refresh();
          } catch (err) {
            window.location.reload();
          }
          return result;
        },
      });
    } catch (e) {
      /* ignoreras */
    }
  };
  if (window.Shopify && window.Shopify.actions) initStandardActions();
  else document.addEventListener('DOMContentLoaded', initStandardActions, { once: true });

  /* ------------------------------------------------------------------
     Produktformulär
     ------------------------------------------------------------------ */
  class ProductForm extends HTMLElement {
    connectedCallback() {
      this.form = $('form', this);
      if (!this.form) return;
      const idInput = $('[name="id"]', this.form);
      if (idInput) idInput.disabled = false;
      this.button = $('[name="add"]', this.form);
      this.errorBox = $('[data-form-error]', this);
      this.onSubmit = this.onSubmit.bind(this);
      this.form.addEventListener('submit', this.onSubmit);
    }

    disconnectedCallback() {
      this.form?.removeEventListener('submit', this.onSubmit);
    }

    async onSubmit(e) {
      if (cfg.cartType === 'page' && !document.getElementById('CartDrawer')) return; // vanlig POST → /cart
      e.preventDefault();
      if (!this.button || this.button.disabled || this.button.getAttribute('aria-disabled') === 'true') return;
      this.setError();
      this.setLoading(true);
      try {
        await Cart.add(new FormData(this.form), this);
        announce(cfg.strings.added);
        if (document.getElementById('CartDrawer')) Cart.open(this.button);
        else window.location.href = cfg.routes.cart;
      } catch (err) {
        this.setError(err.description || err.message || cfg.strings.cartError);
      } finally {
        this.setLoading(false);
      }
    }

    setLoading(on) {
      this.button?.classList.toggle('is-loading', on);
      this.button?.setAttribute('aria-busy', on ? 'true' : 'false');
      $$(`[form="${this.form.id}"][name="add"]`).forEach((b) => b.classList.toggle('is-loading', on));
    }

    setError(message) {
      if (!this.errorBox) return;
      this.errorBox.hidden = !message;
      const text = $('[data-form-error-text]', this.errorBox) || this.errorBox;
      text.textContent = message || '';
    }
  }
  customElements.define('product-form', ProductForm);

  /* ------------------------------------------------------------------
     Drop — tid i Europe/Stockholm, nedräkning, låsning av köp
     ------------------------------------------------------------------ */
  let stockholmFmt;
  const epochCache = new Map();
  const Drop = {
    toEpoch(date, time) {
      const key = `${date}|${time}`;
      if (!epochCache.has(key)) epochCache.set(key, this.computeEpoch(date, time));
      return epochCache.get(key);
    },
    computeEpoch(date, time) {
      const d = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(date || '').trim());
      const t = /^(\d{1,2})[:.](\d{2})$/.exec(String(time || '00:00').trim());
      if (!d || !t) return NaN;
      const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
      const offsetAt = (ts) => {
        stockholmFmt ||= new Intl.DateTimeFormat('en-US', {
          timeZone: 'Europe/Stockholm',
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const parts = stockholmFmt.formatToParts(new Date(ts));
        const get = (type) => Number(parts.find((p) => p.type === type).value);
        return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - ts;
      };
      try {
        const first = guess - offsetAt(guess);
        return guess - offsetAt(first);
      } catch (e) {
        return guess - 3600000;
      }
    },
    parts(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      return {
        days: Math.floor(s / 86400),
        hours: Math.floor((s % 86400) / 3600),
        minutes: Math.floor((s % 3600) / 60),
        seconds: s % 60,
      };
    },
  };
  DJ.drop = Drop;

  const Ticker = {
    subs: new Set(),
    timer: null,
    add(fn) {
      this.subs.add(fn);
      fn(Date.now());
      if (!this.timer) this.loop();
    },
    remove(fn) {
      this.subs.delete(fn);
      if (!this.subs.size) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
    loop() {
      this.timer = setTimeout(() => {
        const now = Date.now();
        this.subs.forEach((fn) => fn(now));
        if (this.subs.size) this.loop();
        else this.timer = null;
      }, 1000 - (Date.now() % 1000) + 8);
    },
  };

  class DropState extends HTMLElement {
    connectedCallback() {
      const date = this.dataset.date || cfg.drop?.date;
      const time = this.dataset.time || cfg.drop?.time;
      this.ts = Drop.toEpoch(date, time);
      this.scope = this.closest('[data-drop-scope]');
      if (Number.isNaN(this.ts)) {
        this.setState('invalid');
        return;
      }
      this.tick = this.tick.bind(this);
      Ticker.add(this.tick);
    }

    disconnectedCallback() {
      if (this.tick) Ticker.remove(this.tick);
    }

    tick(now) {
      const diff = this.ts - now;
      if (diff <= 0) {
        this.setState('live');
        Ticker.remove(this.tick);
        return;
      }
      this.setState('pre');
      this.render?.(diff);
    }

    setState(state) {
      if (this.dataset.dropState === state) return;
      const wasPre = this.dataset.dropState === 'pre';
      this.dataset.dropState = state;
      if (this.scope && this.scope !== this) this.scope.dataset.dropState = state;
      if (state === 'live' && wasPre) {
        announce(cfg.strings.live);
        document.dispatchEvent(new CustomEvent('dj:drop:live', { detail: { ts: this.ts } }));
      }
    }
  }
  customElements.define('drop-gate', class extends DropState {});

  class DropCountdown extends DropState {
    connectedCallback() {
      this.cards = {};
      $$('[data-unit]', this).forEach((unit) => {
        const card = $('.countdown__card', unit);
        if (!card) return;
        this.cards[unit.dataset.unit] = {
          card,
          topNew: $('.countdown__face--top-new', card),
          bottomOld: $('.countdown__face--bottom-old', card),
          flapTop: $('.countdown__flap--top', card),
          flapBottom: $('.countdown__flap--bottom', card),
          value: null,
        };
      });
      this.timerEl = $('[role="timer"]', this);
      this.lastLabelMinute = null;
      super.connectedCallback();
    }

    render(diff) {
      const p = Drop.parts(diff);
      Object.entries(this.cards).forEach(([unit, c]) => {
        const raw = p[unit];
        const next = unit === 'days' ? String(raw).padStart(2, '0') : String(raw).padStart(2, '0');
        if (c.value === next) return;
        const prev = c.value;
        c.value = next;
        if (prev === null || !motionOK || document.hidden) {
          [c.topNew, c.bottomOld, c.flapTop, c.flapBottom].forEach((el) => el && (el.textContent = next));
          return;
        }
        c.topNew.textContent = next;
        c.flapBottom.textContent = next;
        c.flapTop.textContent = prev;
        c.bottomOld.textContent = prev;
        c.card.classList.remove('is-flipping');
        void c.card.offsetWidth;
        c.card.classList.add('is-flipping');
        clearTimeout(c.timer);
        c.timer = setTimeout(() => {
          c.bottomOld.textContent = next;
          c.flapTop.textContent = next;
          c.card.classList.remove('is-flipping');
        }, 840);
      });
      const minuteKey = Math.floor(diff / 60000);
      if (this.timerEl && minuteKey !== this.lastLabelMinute) {
        this.lastLabelMinute = minuteKey;
        const s = cfg.strings;
        this.timerEl.setAttribute(
          'aria-label',
          `${p.days} ${s.days}, ${p.hours} ${s.hours}, ${p.minutes} ${s.minutes}`.toLowerCase()
        );
      }
    }
  }
  customElements.define('drop-countdown', DropCountdown);

  /* ------------------------------------------------------------------
     Sökförslag
     ------------------------------------------------------------------ */
  class PredictiveSearch extends HTMLElement {
    connectedCallback() {
      this.input = $('input[type="search"]', this);
      this.results = $('[data-predictive-results]', this);
      if (!this.input || !this.results || this.dataset.enabled === 'false') return;
      this.cache = new Map();
      this.onInput = debounce(() => this.search(), 240);
      this.input.addEventListener('input', this.onInput);
      this.addEventListener('keydown', (e) => this.onKey(e));
    }

    async search() {
      const q = this.input.value.trim();
      if (!q) {
        this.results.innerHTML = '';
        return;
      }
      if (this.cache.has(q)) {
        this.results.innerHTML = this.cache.get(q);
        return;
      }
      this.controller?.abort();
      this.controller = new AbortController();
      this.setAttribute('aria-busy', 'true');
      try {
        const params = new URLSearchParams({
          q,
          section_id: 'predictive-search',
          'resources[limit]': '6',
          'resources[limit_scope]': 'each',
        });
        const res = await fetch(`${cfg.routes.predictiveSearch}?${params}`, { signal: this.controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const doc = parseHTML(await res.text());
        const markup = doc.querySelector('#shopify-section-predictive-search')?.innerHTML || '';
        this.cache.set(q, markup);
        if (this.input.value.trim() === q) this.results.innerHTML = markup;
      } catch (err) {
        if (err.name !== 'AbortError') this.results.innerHTML = '';
      } finally {
        this.removeAttribute('aria-busy');
      }
    }

    onKey(e) {
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const options = $$('[data-predictive-option]', this);
      if (!options.length) return;
      e.preventDefault();
      const i = options.indexOf(document.activeElement);
      let next = e.key === 'ArrowDown' ? i + 1 : i - 1;
      if (next < -1) next = options.length - 1;
      if (next === -1 || next >= options.length) return this.input.focus();
      options[next].focus();
    }
  }
  customElements.define('predictive-search', PredictiveSearch);

  /* ------------------------------------------------------------------
     Scroll-reveal (IntersectionObserver, ingen GSAP krävs)
     ------------------------------------------------------------------ */
  let revealObserver;
  function initReveal(root = document) {
    const items = $$('[data-reveal]:not(.is-in)', root);
    if (!items.length) return;
    if (!motionOK || document.body.classList.contains('no-reveal') || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
      );
    }
    items.forEach((el) => revealObserver.observe(el));
  }
  DJ.initReveal = initReveal;

  /* ------------------------------------------------------------------
     Magnetiska knappar (endast mus/desktop)
     ------------------------------------------------------------------ */
  function initMagnetic(root = document) {
    if (!cfg.motion?.magnetic || !motionOK || !hasHover || isLite) return;
    $$('[data-magnetic]', root).forEach((el) => {
      if (el._magnetic) return;
      el._magnetic = true;
      const label = $('.btn__label', el);
      let raf = 0;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform = `translate3d(${x * 0.22}px, ${y * 0.32}px, 0)`;
          if (label) label.style.transform = `translate3d(${x * 0.1}px, ${y * 0.12}px, 0)`;
        });
      });
      el.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        el.style.transform = '';
        if (label) label.style.transform = '';
      });
    });
  }

  /* ------------------------------------------------------------------
     Uppskjuten video (laddas efter sidan, inte på svaga enheter)
     ------------------------------------------------------------------ */
  function initDeferredVideo(root = document) {
    $$('[data-deferred-video]', root).forEach((wrap) => {
      if (wrap._video || isLite || window.matchMedia('(max-width: 749px)').matches) return;
      wrap._video = true;
      const tpl = $('template', wrap);
      if (!tpl) return;
      onLoad(() =>
        idle(() => {
          wrap.appendChild(tpl.content.cloneNode(true));
          const video = $('video', wrap);
          if (!video) return;
          video.muted = true;
          video.playsInline = true;
          video.addEventListener('playing', () => wrap.classList.add('is-playing'), { once: true });
          if (motionOK) video.play?.().catch(() => {});
        })
      );
    });
  }

  // Korta, ljudlösa videor (t.ex. sociala inlägg) spelas bara när de syns
  let videoObserver;
  function initInviewVideos(root = document) {
    if (!motionOK || isLite || !('IntersectionObserver' in window)) return;
    const videos = $$('[data-inview-video] video', root);
    if (!videos.length) return;
    if (!videoObserver) {
      videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const v = entry.target;
            if (entry.isIntersecting) {
              v.muted = true;
              v.playsInline = true;
              v.play?.().catch(() => {});
            } else {
              v.pause?.();
            }
          });
        },
        { threshold: 0.35 }
      );
    }
    videos.forEach((v) => videoObserver.observe(v));
  }

  /* ------------------------------------------------------------------
     Laddningsskärm (första besöket per session)
     ------------------------------------------------------------------ */
  function initLoader() {
    if (!html.classList.contains('show-loader')) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      html.classList.add('loader-done');
      try {
        sessionStorage.setItem('dj-visited', '1');
      } catch (e) {
        /* privat läge */
      }
      setTimeout(() => html.classList.remove('show-loader'), 1000);
    };
    const minVisible = 900;
    const ready = () => setTimeout(finish, Math.max(0, minVisible - performance.now()));
    onLoad(ready);
    setTimeout(finish, Math.max(300, 1800 - performance.now()));
  }

  /* ------------------------------------------------------------------
     GSAP-effekter (motion.js laddas lat)
     ------------------------------------------------------------------ */
  function loadMotion() {
    const m = cfg.motion || {};
    if (!m.gsap || !motionOK || isLite || !m.script) return;
    if (!$('[data-gsap]')) return;
    if (DJ._motionRequested) return;
    DJ._motionRequested = true;
    // Effekterna är scrollstyrda — ladda GSAP först när besökaren interagerar,
    // så att det aldrig konkurrerar med sidladdningen.
    const events = ['scroll', 'pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel'];
    let fired = false;
    const go = () => {
      if (fired) return;
      fired = true;
      events.forEach((ev) => window.removeEventListener(ev, go, { passive: true }));
      idle(() => {
        const s = document.createElement('script');
        s.src = m.script;
        s.async = true;
        document.head.appendChild(s);
      });
    };
    onLoad(() => events.forEach((ev) => window.addEventListener(ev, go, { passive: true, once: true })));
  }

  /* ------------------------------------------------------------------
     Start
     ------------------------------------------------------------------ */
  function init(root = document) {
    initReveal(root);
    initMagnetic(root);
    initDeferredVideo(root);
    initInviewVideos(root);
  }

  initLoader();
  init();
  loadMotion();
  DJ.ready = true;

  // Temaeditorn
  document.addEventListener('shopify:section:load', (e) => {
    init(e.target);
    if (DJ.motion) DJ.motion.refresh(e.target);
    else loadMotion();
  });
  document.addEventListener('shopify:section:unload', (e) => DJ.motion?.cleanup(e.target));
  document.addEventListener('shopify:section:select', (e) => {
    $$('[data-reveal]', e.target).forEach((el) => el.classList.add('is-in'));
  });
  document.addEventListener('shopify:block:select', (e) => {
    $$('[data-reveal]', e.target).forEach((el) => el.classList.add('is-in'));
    e.target.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: motionOK ? 'smooth' : 'auto' });
  });
})();
