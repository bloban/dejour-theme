/* ==========================================================================
   DE'JOUR — product.js
   Galleri (svep, zoom, ljuslåda), varianter, 3D/video, fast köpknapp,
   rekommendationer ("Passar bra med").
   ========================================================================== */
(() => {
  const DJ = window.DJ || {};
  const { $, $$ } = DJ.utils || {
    $: (s, r = document) => r.querySelector(s),
    $$: (s, r = document) => Array.from(r.querySelectorAll(s)),
  };
  const cfg = DJ.config || { strings: {}, routes: {} };
  const hasHover = document.documentElement.classList.contains('has-hover');
  const motionOK = document.documentElement.classList.contains('motion-ok');
  const isDesktop = () => window.matchMedia('(min-width: 990px)').matches;

  /* ---------- Galleri ---------- */
  if (!customElements.get('product-gallery')) {
    customElements.define(
      'product-gallery',
      class ProductGallery extends HTMLElement {
        connectedCallback() {
          this.list = $('[data-gallery-list]', this);
          if (!this.list) return;
          this.items = $$('.pgallery__item', this.list);
          this.current = $('[data-gallery-current]', this);
          this.progress = $('[data-gallery-progress]', this);
          this.lightbox = $('dialog.lightbox', this);

          this.onScroll = () => {
            if (isDesktop()) return;
            const i = Math.round(this.list.scrollLeft / this.list.clientWidth);
            if (this.current) this.current.textContent = i + 1;
            if (this.progress) this.progress.style.setProperty('--index', i);
          };
          this.list.addEventListener('scroll', this.onScroll, { passive: true });

          this.addEventListener('click', (e) => {
            const opener = e.target.closest('[data-lightbox-open]');
            if (!opener || !this.lightbox || !DJ.dialogs) return;
            if (this.dataset.zoom !== 'true') return;
            e.preventDefault();
            DJ.dialogs.open(this.lightbox, opener);
            const target = $(`[data-lightbox-index="${opener.dataset.lightboxOpen}"]`, this.lightbox);
            requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
          });

          if (this.dataset.zoom === 'true' && hasHover) this.initZoom();
        }

        initZoom() {
          $$('button.pgallery__media', this).forEach((media) => {
            const img = $('img', media);
            if (!img) return;
            media.addEventListener('pointerenter', () => {
              if (!isDesktop()) return;
              // Be webbläsaren om en större bild första gången
              if (!img.dataset.zoomReady) {
                img.sizes = '(min-width: 990px) 120vw, 200vw';
                img.dataset.zoomReady = '1';
              }
              media.classList.add('is-zooming');
            });
            media.addEventListener('pointermove', (e) => {
              if (!isDesktop()) return;
              const r = media.getBoundingClientRect();
              media.style.setProperty('--zx', `${((e.clientX - r.left) / r.width) * 100}%`);
              media.style.setProperty('--zy', `${((e.clientY - r.top) / r.height) * 100}%`);
            });
            media.addEventListener('pointerleave', () => media.classList.remove('is-zooming'));
          });
        }

        goTo(mediaId) {
          const item = this.items.find((el) => el.dataset.mediaId === String(mediaId));
          if (!item) return;
          this.items.forEach((el) => el.classList.toggle('is-active', el === item));
          if (isDesktop()) {
            if (this.list.firstElementChild !== item) this.list.prepend(item);
            this.items = $$('.pgallery__item', this.list);
          } else {
            this.list.scrollTo({ left: item.offsetLeft - this.list.offsetLeft, behavior: motionOK ? 'smooth' : 'auto' });
          }
        }
      }
    );
  }

  /* ---------- Uppskjuten media (video) ---------- */
  if (!customElements.get('deferred-media')) {
    customElements.define(
      'deferred-media',
      class DeferredMedia extends HTMLElement {
        connectedCallback() {
          $('[data-load-media]', this)?.addEventListener('click', () => this.load(), { once: true });
        }

        load() {
          const tpl = $('template', this);
          if (!tpl || this.loaded) return;
          this.loaded = true;
          this.appendChild(tpl.content.cloneNode(true));
          this.classList.add('is-loaded');
          const video = $('video', this);
          if (video) video.play?.().catch(() => {});
        }
      }
    );
  }

  /* ---------- 3D-modell ---------- */
  if (!customElements.get('product-model')) {
    customElements.define(
      'product-model',
      class ProductModel extends HTMLElement {
        connectedCallback() {
          $('[data-load-model]', this)?.addEventListener('click', () => this.load(), { once: true });
        }

        load() {
          const tpl = $('template', this);
          if (!tpl || this.loaded) return;
          this.loaded = true;
          this.appendChild(tpl.content.cloneNode(true));
          this.classList.add('is-loaded');
          window.Shopify?.loadFeatures?.([
            {
              name: 'model-viewer-ui',
              version: '1.0',
              onLoad: (errors) => {
                if (errors) return;
                const viewer = $('model-viewer', this);
                if (viewer && window.Shopify.ModelViewerUI) this.ui = new window.Shopify.ModelViewerUI(viewer);
              },
            },
          ]);
        }
      }
    );
  }

  // AR-knapp ("Visa i ditt rum")
  const setupXR = (errors) => {
    if (errors) return;
    if (!window.ShopifyXR) {
      document.addEventListener('shopify_xr_initialized', () => setupXR(), { once: true });
      return;
    }
    $$('[id^="ProductJSON-"]').forEach((el) => {
      try {
        window.ShopifyXR.addModels(JSON.parse(el.textContent));
      } catch (e) {
        /* ignoreras */
      }
      el.remove();
    });
    window.ShopifyXR.setupXRElements();
  };
  const loadXR = () => {
    if (!$('[id^="ProductJSON-"]') || !window.Shopify?.loadFeatures) return;
    window.Shopify.loadFeatures([{ name: 'shopify-xr', version: '1.0', onLoad: setupXR }]);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadXR, { once: true });
  else loadXR();

  /* ---------- Varianter ---------- */
  if (!customElements.get('variant-picker')) {
    customElements.define(
      'variant-picker',
      class VariantPicker extends HTMLElement {
        connectedCallback() {
          try {
            this.variants = JSON.parse($('[data-variants]', this).textContent);
          } catch (e) {
            this.variants = [];
          }
          this.section = this.closest('.product') || document;
          this.groups = $$('fieldset[data-option-index]', this);
          this.addEventListener('change', () => this.onChange());
          this.updateAvailability();
        }

        selectedOptions() {
          return this.groups.map((g) => $('input:checked', g)?.value);
        }

        onChange() {
          const selected = this.selectedOptions();
          this.dispatchSelectEvent(selected);
          this.groups.forEach((g, i) => {
            const label = $('[data-selected-value]', g);
            if (label) label.textContent = selected[i] || '';
          });
          const variant = this.variants.find((v) => v.options.every((o, i) => o === selected[i]));
          this.updateAvailability();
          this.render(variant);
          this.resolveSelectEvent(variant);
        }

        updateAvailability() {
          const selected = this.selectedOptions();
          this.groups.forEach((g, gi) => {
            $$('input', g).forEach((input) => {
              const test = selected.slice();
              test[gi] = input.value;
              const ok = this.variants.some(
                (v) => v.available && v.options.every((o, i) => test[i] === undefined || o === test[i])
              );
              input.parentElement.classList.toggle('is-unavailable', !ok);
            });
          });
        }

        render(variant) {
          const scope = this.section;
          const idInput = $('[data-variant-id]', scope);
          const addButtons = $$('[data-add-button], [data-sticky-add]', scope);
          const restock = $('[data-restock]', scope);
          const dynamic = $('[data-dynamic-checkout]', scope);
          const s = cfg.strings || {};

          if (!variant) {
            addButtons.forEach((b) => {
              b.disabled = true;
              const l = $('[data-add-label]', b);
              if (l) l.textContent = s.unavailable;
            });
            if (dynamic) dynamic.hidden = true;
            return;
          }

          if (idInput) {
            idInput.value = variant.id;
            idInput.dispatchEvent(new Event('change', { bubbles: true }));
          }

          addButtons.forEach((b) => {
            b.disabled = !variant.available;
            const l = $('[data-add-label]', b);
            if (l) l.textContent = variant.available ? s.addToCart : s.soldOut;
          });
          if (restock) restock.hidden = variant.available;
          if (dynamic) dynamic.hidden = !variant.available;

          const priceHTML = this.priceHTML(variant);
          $$('[data-price], [data-sticky-price]', scope).forEach((el) => (el.innerHTML = priceHTML));

          if (variant.media) $('product-gallery', scope)?.goTo(variant.media);

          const url = new URL(window.location.href);
          url.searchParams.set('variant', variant.id);
          window.history.replaceState({}, '', url.toString());
          this.dataset.selectedPriceAmount = (variant.price / 100).toFixed(2);
        }

        priceHTML(v) {
          const s = cfg.strings || {};
          const sale = v.compare && v.compare > v.price;
          const hidden = (t) => (t ? `<span class="visually-hidden">${t}</span>` : '');
          return `<span class="price${sale ? ' price--sale' : ''}"><span class="price__current">${
            sale ? hidden(s.salePrice) : ''
          }${v.price_fmt}</span>${sale ? `<s class="price__compare">${hidden(s.regularPrice)}${v.compare_fmt}</s>` : ''}</span>`;
        }

        // Shopify Standard Events (statistik)
        dispatchSelectEvent(selected) {
          const { ProductSelectEvent } = window.StandardEvents || {};
          if (!ProductSelectEvent) return;
          try {
            this.pending = ProductSelectEvent.createPromise();
            this.dispatchEvent(
              new ProductSelectEvent({
                product: { id: this.dataset.productId, title: this.dataset.productTitle, handle: this.dataset.productHandle },
                selectedOptions: this.groups.map((g, i) => ({ name: $('legend .label', g)?.textContent.trim() || '', value: selected[i] })),
                promise: this.pending.promise,
              })
            );
          } catch (e) {
            this.pending = null;
          }
        }

        resolveSelectEvent(variant) {
          const deferred = this.pending;
          this.pending = null;
          if (!deferred) return;
          if (!variant) return deferred.reject(new Error('Variant unavailable'));
          deferred.resolve({
            variant: {
              id: variant.id,
              title: variant.title,
              availableForSale: variant.available,
              price: { amount: (variant.price / 100).toFixed(2), currencyCode: this.dataset.currency },
            },
          });
        }
      }
    );
  }

  /* ---------- Fast köpknapp på mobil ---------- */
  if (!customElements.get('sticky-buy')) {
    customElements.define(
      'sticky-buy',
      class StickyBuy extends HTMLElement {
        connectedCallback() {
          const target = document.getElementById(this.dataset.target);
          if (!target || !('IntersectionObserver' in window)) return;
          this.observer = new IntersectionObserver(
            ([entry]) => {
              const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
              this.classList.toggle('is-visible', past);
              this.setAttribute('aria-hidden', past ? 'false' : 'true');
              $$('a, button', this).forEach((el) => (el.tabIndex = past ? 0 : -1));
            },
            { threshold: 0 }
          );
          this.observer.observe(target);
        }

        disconnectedCallback() {
          this.observer?.disconnect();
        }
      }
    );
  }

  /* ---------- Rekommendationer ("Passar bra med") ---------- */
  if (!customElements.get('product-recommendations')) {
    customElements.define(
      'product-recommendations',
      class ProductRecommendations extends HTMLElement {
        connectedCallback() {
          if (this.dataset.loaded) return;
          const load = () => this.load(this.dataset.intent || 'complementary');
          if (!('IntersectionObserver' in window)) return load();
          this.observer = new IntersectionObserver(
            ([entry]) => {
              if (!entry.isIntersecting) return;
              this.observer.disconnect();
              load();
            },
            { rootMargin: '0px 0px 600px 0px' }
          );
          this.observer.observe(this);
        }

        async load(intent) {
          const url = `${this.dataset.url}&intent=${intent}`;
          try {
            const res = await fetch(url);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const fresh = doc.querySelector('product-recommendations [data-recs-content]');
            const hasProducts = fresh && fresh.querySelector('.card');
            if (!hasProducts && intent === 'complementary') return this.load('related');
            this.dataset.loaded = '1';
            if (!hasProducts) {
              this.closest('.shopify-section')?.classList.add('is-empty');
              return;
            }
            $('[data-recs-content]', this).innerHTML = fresh.innerHTML;
            DJ.initReveal?.(this);
          } catch (e) {
            /* rekommendationer är valfria */
          }
        }
      }
    );
  }
})();
