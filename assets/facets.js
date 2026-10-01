/* ==========================================================================
   DE'JOUR — facets.js
   Filter och sortering utan sidladdning (Section Rendering API).
   Utan JavaScript fungerar formuläret som ett vanligt GET-formulär.
   ========================================================================== */
(() => {
  if (customElements.get('facet-results')) return;
  const DJ = window.DJ || {};

  customElements.define(
    'facet-results',
    class FacetResults extends HTMLElement {
      connectedCallback() {
        this.sectionId = this.dataset.section;
        this.cache = new Map();
        this.onChange = this.onChange.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onPop = this.onPop.bind(this);
        this.bind();
        this.addEventListener('click', this.onClick);
        window.addEventListener('popstate', this.onPop);
      }

      disconnectedCallback() {
        window.removeEventListener('popstate', this.onPop);
      }

      get form() {
        return this.querySelector('[data-facet-form]');
      }

      bind() {
        const form = this.form;
        if (!form || form._bound) return;
        form._bound = true;
        form.addEventListener('change', this.onChange);
        form.addEventListener('submit', this.onSubmit);
        // Sorteringen ligger utanför formuläret men hör till det via form="…"
        this.addEventListener('change', (e) => {
          if (e.target.matches('[data-sort]')) this.refresh();
        });
        form.addEventListener('input', (e) => {
          if (!e.target.matches('[data-price-input]')) return;
          clearTimeout(this.priceTimer);
          this.priceTimer = setTimeout(() => this.refresh(), 800);
        });
      }

      onChange(e) {
        if (e.target.matches('[data-price-input]')) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.refresh(), 350);
      }

      onSubmit(e) {
        e.preventDefault();
        this.refresh();
        const dialog = this.form.closest('dialog');
        if (dialog && DJ.dialogs) DJ.dialogs.close(dialog);
      }

      onClick(e) {
        const link = e.target.closest('[data-facet-link]');
        if (!link) return;
        e.preventDefault();
        const url = new URL(link.href, window.location.origin);
        this.render(url.search.slice(1));
      }

      onPop() {
        this.render(window.location.search.slice(1), false);
      }

      query() {
        const form = this.form;
        if (!form) return '';
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(form)) {
          if (value === '' && key.includes('price')) continue;
          params.append(key, value);
        }
        return params.toString();
      }

      refresh() {
        this.render(this.query());
      }

      async render(search, push = true) {
        const url = `${window.location.pathname}?${search}`;
        const ev = this.startUpdateEvent(search);
        this.setAttribute('aria-busy', 'true');
        this.classList.add('is-loading');
        try {
          let markup = this.cache.get(search);
          if (!markup) {
            const sep = search ? '&' : '';
            const res = await fetch(`${window.location.pathname}?${search}${sep}section_id=${this.sectionId}`);
            markup = await res.text();
            this.cache.set(search, markup);
          }
          const doc = new DOMParser().parseFromString(markup, 'text/html');
          this.swap(doc);
          if (push) window.history.pushState({ facets: true }, '', url);
          ev?.resolve(Number(this.querySelector('[data-count]')?.dataset.count || 0));
        } catch (err) {
          ev?.reject(err);
          window.location.href = url;
        } finally {
          this.removeAttribute('aria-busy');
          this.classList.remove('is-loading');
        }
      }

      swap(doc) {
        const fresh = doc.querySelector('facet-results');
        if (!fresh) return;

        // Resultat, verktygsrad och sidnumrering
        const wrap = this.querySelector('[data-facets-wrap]');
        const freshWrap = fresh.querySelector('[data-facets-wrap]');
        if (wrap && freshWrap) wrap.innerHTML = freshWrap.innerHTML;

        // Filterlistan (uppdaterade antal) — behåll öppna grupper och fokus
        const body = this.querySelector('[data-facets-body]');
        const freshBody = fresh.querySelector('[data-facets-body]');
        if (body && freshBody) {
          const open = new Set([...body.querySelectorAll('details[open]')].map((d) => d.id));
          const focusId = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : null;
          body.innerHTML = freshBody.innerHTML;
          body.querySelectorAll('details').forEach((d) => {
            if (open.has(d.id)) d.setAttribute('open', '');
            else d.removeAttribute('open');
          });
          if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
        }
        const foot = this.querySelector('.facet-drawer__foot');
        const freshFoot = fresh.querySelector('.facet-drawer__foot');
        if (foot && freshFoot) foot.innerHTML = freshFoot.innerHTML;

        DJ.initReveal?.(this);
        DJ.motion?.refresh?.(this);
        DJ.utils?.announce?.(this.querySelector('.toolbar__count')?.textContent.trim());
      }

      // Shopify Standard Events (statistik) — samma kontrakt som Dawn
      startUpdateEvent(search) {
        const { SearchUpdateEvent, CollectionUpdateEvent } = window.StandardEvents || {};
        const params = new URLSearchParams(search);
        const isSearch = this.dataset.template === 'search';
        try {
          let deferred;
          if (isSearch && SearchUpdateEvent) {
            deferred = SearchUpdateEvent.createPromise();
            this.dispatchEvent(
              new SearchUpdateEvent({
                search: {
                  query: params.get('q') || '',
                  productFilters: SearchUpdateEvent.parseProductFilters(params),
                  sortKey: SearchUpdateEvent.getSortKey(params),
                },
                promise: deferred.promise,
              })
            );
          } else if (!isSearch && CollectionUpdateEvent) {
            deferred = CollectionUpdateEvent.createPromise();
            this.dispatchEvent(
              new CollectionUpdateEvent({
                collection: {
                  id: this.dataset.collectionId || null,
                  handle: this.dataset.collectionHandle || '',
                  productsCount: Number(this.querySelector('[data-count]')?.dataset.count || 0),
                },
                productFilters: CollectionUpdateEvent.parseProductFilters(params),
                sortKey: CollectionUpdateEvent.getSortKey(params),
                promise: deferred.promise,
              })
            );
          }
          if (!deferred) return null;
          return {
            resolve: (count) => deferred.resolve({ [isSearch ? 'totalCount' : 'productsCount']: count }),
            reject: (e) => deferred.reject(e),
          };
        } catch (e) {
          return null;
        }
      }
    }
  );
})();
