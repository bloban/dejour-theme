# De'Jour — Shopify-tema

Premiumtema för De'Jour, ombyggt från Dawn 16. Djupsvart, antracit och champagneguld,
Cormorant + Inter, filmkorn, GSAP-effekter och en drop-nedräkning i centrum.
All kärnfunktionalitet från Dawn finns kvar: varukorg, kassa, sök, varianter, filter,
Shopify Standard Events/Actions, kundkonton och lokalisering.

## Filstruktur

```
layout/      theme.liquid, password.liquid
sections/    alla sektioner (se nedan) + header-group.json, footer-group.json
snippets/    head-meta, head-styles, theme-config, product-card, price, countdown,
             drop-state, drop-compact, notify-form, buy-box, variant-picker,
             product-gallery, filter-drawer, results-toolbar, cart-line, icon …
templates/   index, product, collection, collection.arkiv, search, cart,
             list-collections, page, page.about, page.faq, page.contact,
             page.shipping, page.terms, page.privacy, page.drop, 404, blog,
             article, password, gift_card
assets/      dejour.css (designsystem), product.css, collection.css,
             theme.js (kärna), product.js, facets.js, motion.js (GSAP)
config/      settings_schema.json, settings_data.json
locales/     sv.json + en.default.json (svenska och engelska)
```

## Sektioner

| Sektion | Används till |
| --- | --- |
| `drop-countdown` | Nedräkning: fullskärmshero, smal banner (header) eller kompakt block |
| `hero` | Fullskärmshero med bild/video, långsam zoom, rubrik som animeras bokstav för bokstav |
| `marquee` | Löpande textband "DE'JOUR — THE BLACK EDITION —" |
| `brand-statement` | Kort varumärkesbudskap, orden tonas fram vid scroll |
| `featured-products` | Utvalda produkter med parallax |
| `horizontal-showcase` | Detaljer (material, sömmar, slim-profil) i horisontell scroll |
| `columns` | USP:er och värderingar |
| `testimonials` | Recensioner (manuella eller app-block) |
| `archive` | Arkivet / Tidigare drops |
| `social-feed` | Instagram/TikTok |
| `newsletter` | Nyhetsbrev (Shopifys kundformulär med taggar) |
| `main-product` | Produktsida: galleri, zoom, 3D, färgprover, drop-lås, bevakning, dragspel |
| `related-products` | "Passar bra med" |
| `main-collection` | Kollektion med filter och sortering (även arkivläge) |
| `page-hero`, `image-with-text`, `rich-text`, `faq`, `contact`, `info-list`, `legal-text`, `drop-teasers`, `main-404` | Innehållssidor |

## Förhandsgranska i Shopify

Koppla branchen som ett opublicerat tema: **Webbshop → Teman → Lägg till tema →
Anslut från GitHub** och välj repot och branchen. Det publicerade temat påverkas inte.

## Att ställa in i Shopify-admin

1. **Droppet** — Temainställningar → Drop: datum (ÅÅÅÅ-MM-DD) och klockslag (TT:MM) i
   svensk tid. Ge drop-produkten taggen `drop` (Obsidian Black har i dag taggen
   `kommer-snart`, som bara ger etiketten "Kommer snart").
2. **Arkivet** — Skapa en automatisk kollektion med handtaget `arkiv`
   (villkor: Produkttagg är lika med `arkiv`) och välj mallen `arkiv`.
   Flytta produkter till arkivet genom att ge dem taggen `arkiv`.
3. **Sidor** — Skapa sidorna och välj mall:
   `om-oss` → *about*, `faq` → *faq*, `contact` → *contact* (finns redan),
   `frakt-och-returer` → *shipping*, `kopvillkor` → *terms*,
   `integritetspolicy` → *privacy*, `drop` → *drop*.
4. **Menyer** — Lägg till sidorna i huvudmenyn och sidfotsmenyn.
5. **Bilder** — Ladda upp hero-bild/video (den svarta korthållaren), bilder till
   detaljsektionen, teaserbilder och sociala inlägg i temaeditorn.
6. **Filter och "Passar bra med"** — Appen Search & Discovery: aktivera filter
   (färg, tillgänglighet, pris) och ange kompletterande produkter.
7. **Fri frakt-gräns** — Temainställningar → Varukorg (standard 499 kr). Gränsen
   måste också finnas i fraktinställningarna.
8. **Fyll i** alla texter markerade med `[FYLL I]`.

### Metafält (valfria)

| Metafält | Typ | Effekt |
| --- | --- | --- |
| `custom.release_date` | Datum | Släppdatum i arkivet |
| `custom.swatch_color` | Färg | Färgprov för produkten |
| `custom.color_name` | Text | Färgnamn bredvid färgproverna |
| `custom.color_siblings` | Lista med produkter | Färgsyskon (separata produkter i andra färger) |
| `reviews.rating` / `reviews.rating_count` | Fylls av recensionsappar | Stjärnor på produktsidan |

## Bra att veta

- **Drop-låset** döljer köpknappen i webbläsaren fram till droppet och växlar till
  "LIVE NU – Köp här" utan omladdning. Det är ett lås i gränssnittet. Håll lagret på 0
  eller schemalägg publiceringen om ingen ska kunna köpa via direktanrop före droppet.
- **Påminn mig / Bevaka** använder Shopifys kundformulär med taggarna `drop-svart`
  respektive `bevaka` + `bevaka-<produkthandtag>`. Kunden får samtycke till
  marknadsföring. Finns e-postadressen redan som kund kan Shopify låta bli att lägga
  till taggen.
- **Effekter**: GSAP och ScrollTrigger laddas från jsDelivr (med cdnjs som reserv)
  först när sidan är färdigladdad. De laddas inte alls vid "minska rörelse" eller på
  svaga enheter. Rubrikanimationen, flip-siffrorna, guldglansen och scroll-reveal
  är ren CSS/JS utan bibliotek.
- **Språk**: svenska (`sv.json`) och engelska (`en.default.json`, även reserv för
  andra språk som är publicerade i butiken).
