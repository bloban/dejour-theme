/* ==========================================================================
   DE'JOUR — motion.js
   Laddas lat av theme.js efter sidladdning (aldrig vid 'minska rörelse'
   eller på svaga enheter). Hämtar GSAP + ScrollTrigger från CDN.
   Effekter: parallax, hero-utzoomning, horisontell scroll, ord-reveal.
   ========================================================================== */
(() => {
  const DJ = (window.DJ = window.DJ || {});
  if (DJ.motion) return;

  const SOURCES = [
    {
      gsap: 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js',
      st: 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/ScrollTrigger.min.js',
    },
    {
      gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js',
      st: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/ScrollTrigger.min.js',
    },
  ];

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

  async function loadGsap() {
    for (const src of SOURCES) {
      try {
        if (!window.gsap) await loadScript(src.gsap);
        if (!window.ScrollTrigger) await loadScript(src.st);
        if (window.gsap && window.ScrollTrigger) return true;
      } catch (e) {
        /* prova nästa CDN */
      }
    }
    return false;
  }

  const registry = new Map(); // element -> revert()

  // Delar upp text i ord men behåller <em>, <strong> m.m.
  function splitWords(el) {
    if (el.dataset.split === 'done') return Array.from(el.querySelectorAll('.w'));
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parts = node.textContent.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      parts.forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = part;
          frag.appendChild(span);
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.dataset.split = 'done';
    return Array.from(el.querySelectorAll('.w'));
  }

  const effects = {
    parallax(el, gsap) {
      const amount = Number(el.dataset.speed || 7);
      const trigger = el.closest('[data-parallax-trigger]') || el.parentElement;
      const tween = gsap.fromTo(
        el,
        { yPercent: -amount },
        {
          yPercent: amount,
          ease: 'none',
          scrollTrigger: { trigger, start: 'top bottom', end: 'bottom top', scrub: true },
        }
      );
      return () => tween.scrollTrigger?.kill() || tween.kill();
    },

    hero(el, gsap) {
      const media = el.querySelector('[data-hero-media]');
      const content = el.querySelector('[data-hero-content]');
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });
      if (media) tl.to(media, { yPercent: 16, scale: 1.06, ease: 'none' }, 0);
      if (content) tl.to(content, { yPercent: -18, opacity: 0, ease: 'none' }, 0);
      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
        gsap.set([media, content].filter(Boolean), { clearProps: 'all' });
      };
    },

    horizontal(el, gsap, ScrollTrigger) {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 990px)', () => {
        const track = el.querySelector('[data-hscroll-track]');
        const viewport = el.querySelector('[data-hscroll-viewport]');
        if (!track || !viewport) return undefined;
        const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
        if (distance() < 40) return undefined;
        el.classList.add('is-pinned');
        viewport.scrollLeft = 0;
        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        const bar = el.querySelector('[data-hscroll-progress]');
        if (bar) {
          gsap.fromTo(
            bar,
            { scaleX: 0 },
            {
              scaleX: 1,
              ease: 'none',
              scrollTrigger: { trigger: el, start: 'top top', end: () => `+=${distance()}`, scrub: true },
            }
          );
        }
        el.querySelectorAll('[data-hscroll-img]').forEach((img) => {
          gsap.fromTo(
            img,
            { xPercent: -6 },
            {
              xPercent: 6,
              ease: 'none',
              scrollTrigger: {
                trigger: img.closest('[data-hscroll-panel]') || img,
                containerAnimation: tween,
                start: 'left right',
                end: 'right left',
                scrub: true,
              },
            }
          );
        });
        return () => {
          el.classList.remove('is-pinned');
          gsap.set(track, { clearProps: 'transform' });
        };
      });
      return () => mm.revert();
    },

    words(el, gsap) {
      const words = splitWords(el);
      if (!words.length) return () => {};
      el.classList.add('is-split');
      const tween = gsap.fromTo(
        words,
        { opacity: 0.16 },
        {
          opacity: 1,
          ease: 'none',
          stagger: 0.08,
          scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 52%', scrub: true },
        }
      );
      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(words, { clearProps: 'opacity' });
      };
    },
  };

  function setup(root, gsap, ScrollTrigger) {
    root.querySelectorAll('[data-gsap]').forEach((el) => {
      if (registry.has(el)) return;
      const fn = effects[el.dataset.gsap];
      if (!fn) return;
      try {
        registry.set(el, fn(el, gsap, ScrollTrigger));
      } catch (e) {
        /* en trasig effekt får aldrig stoppa sidan */
      }
    });
  }

  function cleanup(root) {
    registry.forEach((revert, el) => {
      if (root === document || root.contains(el)) {
        try {
          revert && revert();
        } catch (e) {
          /* ignoreras */
        }
        registry.delete(el);
      }
    });
  }

  loadGsap().then((ok) => {
    if (!ok) return;
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ overwrite: 'auto' });
    ScrollTrigger.config({ ignoreMobileResize: true });
    document.documentElement.classList.add('has-gsap');
    setup(document, gsap, ScrollTrigger);
    ScrollTrigger.refresh();

    DJ.motion = {
      refresh(root = document) {
        setup(root, gsap, ScrollTrigger);
        ScrollTrigger.refresh();
      },
      cleanup(root = document) {
        cleanup(root);
        ScrollTrigger.refresh();
      },
    };

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  });
})();
