# 025 — Server-side rendering assessment

Question: how hard is it to get HTML out of this site for text browsers (lynx) and
crawlers, instead of the current JS-only shell?

Short answer: **the hard part is already done; the remaining work is plumbing.**
The Markdown → HTML pipeline renders unchanged in Node today (verified below).
What has to change is routing (hash → path), the data-loading pattern, and the
server/build step. Estimate: **2–3 focused days** for a static-prerender version,
**~1 day more** for true per-request SSR. A framework migration is not needed.

---

## What the app is today

`app/` is a Vite + React 19 SPA:

- `index.html` ships an empty `<div id="root">` and one module script. Nothing is
  in the HTML — `curl` and `lynx` see a blank page.
- Routing is **hash-only**: `#/<uuid>/` and `#/<uuid>/#<heading-slug>`
  (`App.jsx:69`, `catalog.js:33`). A hash is never sent to the server, so the
  server cannot know which document a request is for.
- Data is fetched **in effects** (`api.js`, `useAsync` in `App.jsx:54`):
  `directory.json`, `articles/<uuid>.json`, `frontmatter/<cid>.json`,
  `backlinks/<uuid>.json`, `assets/*`.
- Rendering is a small amount of React around `react-markdown` + `remark-gfm`,
  plus a custom remark plugin that turns `[[wikilinks]]` into links and
  `![[embeds]]` into recursively rendered sections (`markdown.js`).
- `server.mjs` is a 80-line static file server whose only routing rule is
  "data paths go to `DATA_ROOT`, everything else falls back to `index.html`".

The data itself is fully static: one JSON file per document. 5,348 documents,
847 KB `directory.json`, 6.2 MB of article JSON, 47 MB of assets.

---

## Spike result (measured, throwaway script, not committed)

I rendered documents in plain Node with `renderToStaticMarkup`, importing
`src/markdown.js` and `src/catalog.js` **unmodified**, and a ~20-line
`fs`-backed replacement for `api.js`'s store:

| measurement | result |
| --- | --- |
| single small article | 0.8 ms, 0.3 KB HTML |
| single article with a transclusion | 47 ms, 11 KB HTML |
| largest article (55 KB JSON) | 181 ms, 60 KB HTML |
| **all 5,348 documents** | **6.9 s, 7.3 MB of HTML** |
| lynx `-dump` of a generated page | headings, lists, links and the nested embed all readable |

So the components, `remark-gfm`, the custom `remarkVault` plugin, heading-ID
slugging, section extraction, cycle guards and depth limits all work on the
server exactly as they do in the browser. Nothing about the Markdown pipeline
needs rewriting.

Note that the two heavy numbers above are cold-cache, single-document renders.
A request-time render of a normal page is low single-digit milliseconds plus
four small `readFile`s.

---

## The real work: five blockers

### 1. Hash routing must become path routing (biggest item)

The server can never see `#/uuid/`, so there is no URL to render for. Links
become `/<uuid>/` and `/<uuid>/#<slug>`. Touching:

- `markdown.js:97-98` and `:152` (wikilink and inline-embed hrefs)
- `App.jsx:69-76` (`useHash` → pathname + `popstate`/`pushState`)
- `App.jsx:125, 151, 228, 357, 382` (embed header, backlinks, nav, brand)
- `catalog.js:33` (`parseHash` → `parseLocation`)
- `App.test.jsx` (sets `window.location.hash`)

~8 small edits plus test updates. The one design cost: existing `#/uuid/` links
in the wild stop working, so you either accept that, redirect old hashes on
load, or keep both. The spec (`site-dir-spec.md:392`) already says the UUID is
the stable id and the renderer picks its own routes, so nothing in the data
model fights this.

### 2. Data loading happens in effects, which never run during `renderToString`

A naive `renderToString(<App/>)` prints "Loading…" for the sidebar and the
document. Two ways out:

- **Preload the route's data before rendering** and put it in the store/context
  so the first render is synchronous. `useAsync` grows a "already have it" fast
  path; effects keep working for later client-side navigation. ~60–100 lines,
  contained in `App.jsx` + `api.js`.
- Or adopt a framework's loader API (Next/Remix/TanStack Start). Don't — see
  "Options" below.

Serializing the preloaded JSON into the HTML (one `<script type="application/json">`)
keeps hydration from refetching and is straightforward.

### 3. Transclusions are recursive

`WikiEmbed` (`App.jsx:107`) fetches another article and renders it, up to depth
8, with cycle guards. On the server you must walk the same graph before
rendering (the spike did this synchronously against `fs`; the guards already
exist and are reusable). Alternatives: render embeds as plain links — the spec
explicitly permits this (`site-dir-spec.md:337`) — but then the server markup
and client markup differ, which is a hydration mismatch unless hydration also
starts in "link" mode.

### 4. Browser globals at first render

`useHash` reads `window.location.hash` in a `useState` initializer and throws
under SSR. `useNarrow`'s lazy `matchMedia` initializer doesn't throw but
produces a different tree on phones than the server (mobile top bar vs sidebar),
which will hydrate-mismatch. Both are fixed by passing the initial location in
from the server and letting `narrow` become true in an effect after mount.
Everything else (`document.title`, `scrollIntoView`, `localStorage`,
`documentElement.classList`) is already inside effects or try/catch.

`main.jsx` also needs `hydrateRoot` instead of `createRoot` for the entry page.

### 5. Data layer is coupled to `fetch` and Vite env

`api.js` hardcodes `fetch` and `import.meta.env.VITE_DATA_BASE`. Extract a tiny
store interface (`getArticle`, `getFrontmatter`, `getBacklinks`) with two
implementations: `fetch` in the browser, `fs` on the server. ~30 lines. The
`import.meta.env` read also needs a guard so a plain Node entry doesn't trip on
it (or move the base URL to the injected config).

---

## Options

| option | work | when it wins |
| --- | --- | --- |
| **Static prerender (SSG)** — render every doc to `<uuid>/index.html` at publish time, hydrate on load | **2–3 days** | This site. Data is already immutable between publishes; 7 s build, 7.3 MB output; any static host works; lynx and crawlers get full HTML with no Node process involved. |
| **True SSR** — Node renders per request from `DATA_ROOT`, caches by mtime | **3–4 days** | Only if pages become per-request (auth, personalised, live data). Otherwise you take on a always-on server, cache invalidation and error handling for no benefit. |
| **Framework migration** (Next.js / Remix / TanStack Start / Vike) | **1.5–2 weeks** | Only if routing, data loading, bundling and SSR conventions are about to matter for other reasons. It does not remove blockers 1, 3 or 4; it just moves them into a new idiom and adds a migration. |
| **Let the Go publisher emit HTML** | 3–5 days, wrong layer | Would duplicate the Markdown flavor the spec deliberately leaves to the renderer (`site-dir-spec.md:45`, ADR 0006) and fork rendering between Go and the app. Avoid. |
| **One giant HTML page with all docs** | 1 day, bad | A single URL, one title, 7.3 MB per fetch. Crawlers index the wrong thing. |

Recommended: **SSG**, because the shipped artifact is already a static tree of
JSON per document. The app's own README-level model ("one vault scan produces
it, the frontend is a separate application that fetches these files") maps
directly onto "one prerender pass produces HTML beside the JSON".

A per-request SSR handler is a modest add-on to the same refactor if it is ever
needed: `server.mjs` already owns the data root and the static/fallback split,
so `/<uuid>/` becomes a render call plus an HTML response, with an in-memory
cache keyed on `articles/<uuid>.json` mtime.

---

## Phased plan (SSG)

1. **Routing** — path URLs everywhere, `useLocation`, `parseLocation`, update
   tests. *(4–6 h)*
2. **Data layer** — sync/async store, preloaded route data, prefetch the embed
   graph with the existing depth/cycle guards. *(3–4 h)*
3. **Render entry** — a Node script that walks `directory.json`, renders each
   document with the same component tree, writes `<uuid>/index.html`, plus `/`
   for the landing document. Reuse `renderToStaticMarkup`; `vite build --ssr`
   or a Vite SSR load of the JSX entry if the tree needs JSX. *(4–6 h)*
4. **Hydration + metadata** — `hydrateRoot`, per-page `<title>`, meta
   description, canonical, `robots.txt`, and a generated `sitemap.xml` from
   `directory.json`. Guard the narrow-layout state so the first paint matches.
   *(3–5 h)*
5. **Verify** — lynx/w3m dump on several pages including transclusions and
   backlinks; a crawler-shaped check (`curl` shows real text, unique titles,
   links resolve); existing vitest suite green; add one SSR smoke test. *(3–4 h)*

Total ~2–3 days. Nothing here is research; it is mechanical once the routing
decision is made.

## Things that will bite

- **Old links.** Any `#/uuid/` bookmark or previously published link dies with
  hash routing. Decide up front: redirect shim or accept breakage.
- **Hydration parity.** The server has no viewport. Render the desktop layout
  first and switch after mount, or the phone tree mismatches. Same for any
  `Date.now()`/randomness — there is none today, keep it that way.
- **Link bases.** `assets/...` is relative to the site root; prerendered pages
  live at `/<uuid>/`, so asset/image URLs must be rooted (`/assets/...`) or the
  server must serve `assets/` under every document path. The app's `dataURL`
  already exists for this; it just needs an absolute base in the static build.
- **Output volume.** 5,348 extra `index.html` files (~7.3 MB) next to 66 MB of
  JSON. Fine for a repo artifact or a static host, but regenerate the whole set
  per publish; no incremental build exists and none is needed at 7 s.
- **Search engines.** Google can render JS, but it has no per-document URL here
  to attach content to, so today there is effectively nothing to index. After
  SSG you get real URLs, real titles, and a sitemap; that is the actual win,
  not just lynx.
- **Bundle.** Hydration still ships the 401 KB / 124 KB gzip app. Text browsers
  never fetch it. If hydration cost matters later, keep the current bundle for
  interactive pages and serve plain static HTML for the rest — but that is
  optional polish, not a prerequisite.

## Bottom line

This is a **small-to-medium refactor, mostly in one file plus one new build
script**, with a proven rendering core. It is not a rewrite and it does not
require a framework. The only genuinely irreversible choice is hash → path
routing; everything else is additive. If the goal is "lynx and crawlers see the
words", static prerendering gets there in days and makes the Node server
unnecessary.
