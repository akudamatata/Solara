# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Solara 2.0 is a web music player (search, playlist, favorites, lyrics, "radar" from NetEase top charts, aurora background colored from album art). It aggregates the third-party GD Music API (`https://music-api.gdstudio.xyz/api.php`) through a thin backend proxy. UI text and code comments are primarily Chinese; English is provided by a runtime translation layer.

There is **no build step, no bundler, no framework, no test suite, and no linter**. The frontend is plain static files using native ES modules (`<script type="module">`) and native CSS `@import`. jQuery, Font Awesome and Google Fonts are loaded from CDNs in `index.html`.

## Running locally

Two interchangeable backends serve the same static root and the same routes (`/login`, `/api/login`, `/api/storage`, `/proxy`, `/palette`):

```bash
# Express standalone server (Node >= 22.5 required: uses built-in node:sqlite)
cd server && npm install && npm start          # http://localhost:8787, SQLite at ./data/solara.db
# env: PORT, HOST, PASSWORD, API_BASE_URL, DATA_DIR, WRANGLER_API_URL

# Cloudflare Pages Functions emulation
wrangler pages dev . --d1 DB                    # reads env vars from .dev.vars (gitignored)

# Docker (what the published image runs)
docker compose up -d                            # host 8080 -> container 8787
```

CI (`.github/workflows/docker-publish.yml`) only builds and pushes `ghcr.io/<repo>` on `v*` tags or manual dispatch.

## Architecture

### Dual backend — keep them in sync
- `functions/` — Cloudflare Pages Functions (TypeScript, Workers runtime). `_middleware.ts` does cookie auth (`auth` cookie must equal `btoa(PASSWORD)`; static extensions and `/login` are public; API paths return 401 JSON instead of redirecting) and, when `env.language`/`env.LANGUAGE === "ENG"`, injects `window.SITE_LANGUAGE = "ENG"` into HTML via `HTMLRewriter`. `proxy.ts` proxies the music API with Cloudflare Cache API (skips caching empty/error search results) and streams Kuwo audio. `palette.ts` extracts album-art colors server-side (uses `functions/lib/vendor/jpeg-decoder.js`). `api/storage.ts` is a KV store on D1 binding `DB`.
- `server/` — CommonJS Express port of the same functions. Each file in `server/routes/` is documented as "移植自 functions/…" and mirrors the Cloudflare logic (in-memory 5‑min cache in `cache.js` instead of the Cache API; `node:sqlite` with WAL in `db.js` instead of D1). **A behavior change in one backend usually needs the matching change in the other.**
- Docker hybrid (`docker-entrypoint.sh`): writes env vars into `.dev.vars`, starts `wrangler pages dev` on internal `127.0.0.1:8788` (persisting D1 to `/data`), then runs the Express server on `8787` with `WRANGLER_API_URL` set. Express handles static files, storage and audio streaming itself, but forwards music-API `/proxy` calls to Wrangler (for its TLS fingerprint against Cloudflare challenges). `_middleware.ts` lets loopback-host requests bypass auth for this reason. Note the Express server does not perform the `SITE_LANGUAGE` HTML injection itself.

### Storage model
Both backends store key/value JSON in two tables: `favorites_store` for keys `favoriteSongs`, `currentFavoriteIndex`, `favoritePlayMode`, `favoritePlaybackTime`, and `playback_store` for everything else. That key set is duplicated in `server/db.js` and `functions/api/storage.ts`. Frontend `js/core/storage.js` probes `GET /api/storage?status=1` (`d1Available`) and syncs only keys listed in `STORAGE_KEYS_TO_SYNC` (`js/constants.js`); otherwise it falls back to `localStorage`.

### Frontend (`js/`)
- `index.html` contains an inline head script that sets `window.__SOLARA_IS_MOBILE` (UA + `max-width: 820px`) and loads either `css/desktop.css` or `css/mobile.css` on top of `css/style.css`. At the end of the body it loads `js/app.js` and, only on mobile, `js/mobile.js`.
- `js/app.js` is the orchestrator: imports and wires all modules and binds events. Shared mutable state is the single `state` object in `js/state.js`; cached element references are in `js/dom.js` (also exposed on `window` for `mobile.js`). Layers: `core/` (audio engine, quality/source negotiation, storage, MediaSession), `features/` (search, playlist, favorites, lyrics, settings panel), `visual/` (aurora background, palette extraction with backend `/palette` + Canvas fallback, `spotlight.js` debug console toggled by Ctrl+D).
- Desktop ↔ mobile communication goes through `window.SolaraMobileBridge.handlers` (e.g. `openSearch`/`closeSearch`), registered by `js/mobile.js` and called optionally from `app.js`.
- All music API access goes through the frozen `API` object in `js/constants.js` (`/proxy?types=search|playlist|url|lyric|pic&source=…&s=<random>`). The random `s` param is cache-busting; backends strip `s`/`nocache` when building cache keys. Radar chart playlist IDs live in `RADAR_PLAYLISTS`.
- `js/i18n.js` is a classic (non-module) script with a Chinese→English string dictionary applied when `window.SITE_LANGUAGE === "ENG"`. New user-facing Chinese strings need an entry there to be translated.
- `js/index.js` is a legacy shim that just imports `app.js`.

### CSS (`css/`)
`style.css` aggregates `tokens/theme.css` (design tokens, light/dark), `layout/`, and `components/`; `mobile.css` aggregates `css/mobile/*`. Scrollbars are hidden globally by design.

## Configuration
- `PASSWORD` — enables login gate (unset = open access).
- `API_BASE_URL` — upstream music API (alternatives: `music-api-cn.gdstudio.xyz`, `music-api-hk.gdstudio.xyz`).
- `LANGUAGE=ENG` on Cloudflare; lowercase `language=ENG` in Docker.
- Cloudflare D1 must be bound as `DB`; table DDL is in README.md.

## License
CC BY-NC-SA — no commercial use; derivatives must keep attribution and the same license.
