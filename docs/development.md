# Development

Running Python Arena on your own computer, every npm script, what CI does on each pull request, and the one-time domain setup. For how the site and the engine work, see [Architecture](architecture.md).

Paths written as code (such as `scripts/copy-engine.mjs`) are relative to the root of the repository.

## Run locally

Needs Node 22.18 or newer (the build scripts import some `.ts` files as they are) and CPython 3.14.2, the version Pyodide runs: the content build looks for it as `$PYTHON`, then `python3.14` on the PATH, then `uv python find 3.14.2` (install it with `uv python install 3.14.2`).

```bash
npm install        # also copies Pyodide into public/engine
npm run dev        # checks the lessons, then serves http://localhost:5173/
```

| Script | What it does |
|---|---|
| `npm run content` | Checks every lesson on the reference CPython and writes `src/generated/`, the lesson files in `public/lessons/` (one per step, loaded when the step is opened) and the images in `public/images/` |
| `npm run build` | Checks the lessons, type-checks and builds `dist/` (pre-rendered pages, service worker, sitemap) |
| `npm run content:pyodide` | Replays every lesson program in Pyodide on Node and compares with CPython (after `npm run content`), and times the big tests' model solutions there |
| `npm run pro-track-check` | The Pro Track's projects with Python 3.14 and pytest: each starter fails its tests, and with its model solution every test passes |
| `npm run check-links` | After a build: every internal link resolves, and every external link goes to a host on the list in [`scripts/check-links.mjs`](../scripts/check-links.mjs) |
| `npm run test:unit` | Unit tests without a browser (`scripts/**/*.test.mjs`) |
| `npm run test:e2e` | Browser tests of the built site in headless Chromium: pre-rendered pages, lessons, the engine, errors and crashes, endless loops, big tests, pygame windows, the mobile-data question, offline, moving progress, projects, the record, the Pro Track, topics, the interview prep page, and every page type at phone widths in both themes with axe (WCAG 2.2 AA). `-- --shots dir` saves screenshots |
| `node scripts/build-content.mjs --dry --module-file 05-conditionals.yaml` | Checks one module (and its drills) without writing anything, for writing lessons |
| `node scripts/make-sprites.mjs` | Draws the pygame lessons' images into `content/assets/` |

A plain `npm run build` (no variables set) makes the site as CI does for the live site: pages at `/`, with canonical links and the sitemap naming `SITE_URL`, by default `https://pythonarena.org`. `npm run check-links` checks it as it is. To build for a github.io project page instead (see Deploy), set `BASE_PATH` and `SITE_URL` for the build and for the checks. `node scripts/serve.mjs` serves `dist/` the way GitHub Pages does, at http://127.0.0.1:4173/ (under `BASE_PATH` when it is set).

## Deploy

`.github/workflows/deploy.yml` builds and tests every pull request, and publishes to GitHub Pages when a pull request merges into `main`:

| Job | What it does | Runs |
|---|---|---|
| `build` | `npm ci`, the unit tests, then `npm run build` (every lesson program checked on CPython 3.14.2, with the content build's cache of runs kept from the last workflow run; tsc, the site build, the pre-rendered pages) and the link check; keeps the build for the jobs below, and on `main` uploads `dist` for Pages | first |
| `content-pyodide` | every lesson program replayed in Pyodide and compared with CPython, in 2 shards side by side | after `build` |
| `e2e` | the browser tests in 2 jobs side by side, the phone pass and everything else, with screenshots in the artifacts `screenshots` and `screenshots-phone` | after `build` |
| `pro-track` | `npm run pro-track-check` with Python 3.14 | first, beside `build` |
| `lighthouse` | Lighthouse scores against `lighthouserc.cjs` | pull requests, after `build` |
| `deploy` | publishes exactly the `dist` the build job made | `main`, after all of the above |

In the repository's **Settings > Pages**, set **Source** to **GitHub Actions** once. `CUSTOM_DOMAIN` in the workflow is the site's own domain, `pythonarena.org`: the build makes the site for `/`, with its canonical links, sitemap and `robots.txt` at that domain. Left empty, the site is published at `https://<owner>.github.io/<repo>/` instead.

<details>
<summary><b>The domain, with Cloudflare DNS</b> (one-time setup)</summary>

The domain's DNS is at Cloudflare; GitHub Pages serves the site and gets its HTTPS certificate. Set it up once, in this order:

1. **Verify the domain with GitHub**, so no other GitHub Pages site can claim it: in your GitHub account's **Settings > Pages**, **Add a domain**, `pythonarena.org`. Add the TXT record GitHub shows in Cloudflare (**DNS > Records > Add record**), then **Verify**.
2. **Point the domain at GitHub Pages** in Cloudflare's **DNS > Records**. Delete any other A, AAAA or CNAME records for `pythonarena.org` and `www` first (a parking page, say), then add these, each with **Proxy status** set to **DNS only** (the grey cloud):

   | Type | Name | Content |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `antonyperez0.github.io` |

3. **Deploy**: merge the change that sets `CUSTOM_DOMAIN` into `main`, and wait for the workflow's `deploy` job.
4. **Give the repository its domain**: the repository's **Settings > Pages > Custom domain**, `pythonarena.org`, **Save**. GitHub checks the DNS and gets a certificate, which takes from a few minutes to an hour; then tick **Enforce HTTPS**. From then on `https://antonyperez0.github.io/pythonarena/` and `www.pythonarena.org` redirect to `https://pythonarena.org/`.

Between steps 3 and 4, the github.io address shows pages without their styles and scripts (they are built for `/`), so do step 4 right after the deploy.

The records stay **DNS only**: GitHub Pages checks that the domain points at it and gets the certificate itself, and Cloudflare's proxy hides both from it. GitHub Pages already serves the site over HTTPS from its own CDN.

With `CUSTOM_DOMAIN` set, `robots.txt` is at the top of the domain and names the sitemap, so search engines find it on their own. Submitting it in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) (`https://pythonarena.org/sitemap.xml`) gets the pages read sooner. Without a custom domain, search engines never see the site's `robots.txt` (it is at `/<repo>/robots.txt`, and they read it only at the top of a host), so submit `https://<owner>.github.io/<repo>/sitemap.xml` yourself.

</details>
