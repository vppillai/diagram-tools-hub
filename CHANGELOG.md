# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[semver](https://semver.org/).

For commit-level detail, see the auto-generated body of each
[GitHub Release](https://github.com/vppillai/diagram-tools-hub/releases).

## [Unreleased]

## [1.4.0] — 2026-05-11

### Added

- **Right-click quick-pick context menu on TLDraw.** A custom Radix-backed
  panel with a 4×3 swatch grid (12 most-used colors) plus a 3×3 icon-only
  tool grid (draw / eraser / select / text / arrow / line / laser /
  rectangle / ellipse). A "More tools…" submenu carries the long-tail
  (highlighter, sticky note, frame, hand). Mirrors the
  [vppillai/whiteboard](https://github.com/vppillai/whiteboard) pen-driven
  UX so a Wacom Intuos side-button right-click → tap a swatch is the
  fastest path to "now I'm drawing in green".
- **Sticky tools by default.** `editor.updateInstanceState({ isToolLocked: true })`
  is set on mount so the tool you pick from the quick-pick stays active
  after each shape/text commit, instead of auto-reverting to "select".
  Still toggleable via the tldraw toolbar pin mid-session.
- **TLAssetStore.remove** — when a shape referencing an uploaded asset is
  deleted, the client now fires `DELETE /tldraw-sync/uploads/<id>`. Asset
  cleanup is event-driven; the server's periodic sweep is the safety net.
- **getUserPresence** restored — peer presence carries `isTabActive` again
  (was lost in the v2→v5 migration), so collaborators see a 💤 indicator
  when your tab is idle.
- **post-build smoke test in `release.yml`** — pulls each freshly-tagged
  image and starts it for 5 seconds. Catches a class of bug where the
  image builds but the container can't start (broken CMD, missing perms,
  bad entrypoint).
- **`CHANGELOG.md`** itself — previously the release notes were the only
  user-facing history; the changelog now lives in-repo.

### Changed

- **Hub nginx config is now templated.** `engine/nginx.conf.template` is
  the single source of truth for HTTP, HTTPS, and CI modes; previously
  three near-identical 130-line heredocs in `manage-config.sh` had
  drifted. `manage-config.sh` shed 454 lines.
- **TLDraw Dockerfile is now multi-stage.** Production runtime is
  `nginx:alpine` (not `serve -s dist`, the Node dev tool that v1.3
  shipped to prod). Adds X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, gzip, 1-year immutable cache on `/assets/*`, and a
  non-root container. Image size 605 MB → 98 MB.
- **Sync backend Dockerfile** — non-root user, `npm ci` with a
  `package-lock.json` (deterministic builds), exec-form `CMD ["node",
  "server.js"]` so SIGTERM reaches Node directly.
- **`drawapp.service` installation no longer mutates the tracked file.**
  Renders into `mktemp` first, installs the temp; `git diff` stays clean
  after `install-service`.
- **Hub README** — corrected GHCR image paths (uses `-tldraw` and
  `-whiteboard` namespaces, not `/tldraw` and `/engine`), updated the
  tech-stack block to React 19 + Vite 8 + tldraw v5 + Node 22, added a
  LAN-only auth warning (see below).
- **TLDraw frontend `onMount` extracted to `setupCanvasDefaults(editor)`.**
  ~140 lines of duplicated code between `SyncTldraw` and `LocalTldraw`
  collapsed — bug fixes now land in one place instead of one-of-two.
  Tool changes use `editor.sideEffects.registerAfterChangeHandler`
  reactive notifications instead of a 100 ms polling interval.
- **Color hotkeys (1–9) call `editor.setStyleForNextShapes` directly**
  instead of scraping the DOM for matching buttons and synthetic-clicking
  them. The 60-line `findColorButton` fallback chain is gone.

### Security

- **Path traversal closed on `/tldraw-sync/uploads/<id>`** (PUT, GET,
  DELETE) and on the WebSocket `roomId` from `/connect/<roomId>`. Both
  routes now require `/^[A-Za-z0-9_.\-]{1,200}$/` (with explicit `..`
  reject as defense-in-depth) and return 400 / WS close-1008 otherwise.
- **Atomic snapshot writes** — `saveSnapshot` writes to `<id>.tmp` and
  renames over the live file. A SIGKILL mid-write previously left a
  truncated file that the next load couldn't parse, silently zeroing
  the whole room. Stale `.tmp` orphans are skipped by cleanup.
- **PUT body size limit (10 MB).** Matches the frontend's `maxAssetSize`.
  Bigger requests get 413 + the socket is destroyed before the buffer
  fills memory.
- **SSRF guard on `/unfurl`** — rejects loopback, RFC-1918, link-local
  (incl. `169.254.169.254` cloud IMDS), ULA, and IPv6 link-local. Note:
  hostnames are not DNS-resolved per request, so a controlled hostname
  resolving to a private IP can still bypass — full mitigation needs a
  per-request resolve + IP-range check (tracked for follow-up).
- **Concurrent-room-load race fixed.** Two simultaneous WebSocket
  connects to a new room no longer both build a `TLSocketRoom`, leaving
  one orphaned with its persistInterval still firing. The map now
  stashes the load Promise immediately so the second caller awaits the
  first.
- **SIGTERM handler flushes pending snapshots before exit.** `docker
  stop` would previously lose up to 500 ms of unsaved work (the
  onDataChange debounce window).
- **Request-header logging removed** — every HTTP request and WS upgrade
  was dumping `req.headers` (incl. `Cookie`, `Authorization`,
  `X-Forwarded-For`) to stdout.
- **Third-party GitHub Actions pinned to release tags.**
  `aquasecurity/trivy-action@master` and `trufflesecurity/trufflehog@main`
  are now `@0.28.0` and `@v3.82.0`. A compromised upstream commit can no
  longer be silently pulled into CI runs with security-events: write.
- **`continue-on-error: true` removed from Snyk** — the high-severity
  threshold now actually fails the job.
- **Unsafe Dependabot auto-merge workflow removed.** The previous
  `.github/workflows/dependabot.yml` auto-approved and auto-merged every
  Dependabot PR after an `echo "tests passed"` stub. Real CI
  (`ci-cd.yml`) runs on PRs and humans review/merge.
- **`deployment-verification.yml`** — user-supplied `endpoint_url`
  reached curl/ab/node script args via raw `${{ }}` interpolation
  (workflow-injection vector); now flows through `env: ENDPOINT_URL`.

### Fixed

- **Color hotkey `8` was bound to `'indigo'`** — not a valid v5
  `DefaultColorStyle` token, so the keypress silently did nothing. Now
  `'light-violet'`.
- **`LocalTldraw` store-listener leak** — `editor.store.listen` returned
  an unsubscribe that was never captured. Every HMR cycle / StrictMode
  double-mount registered a fresh listener forever, doubling
  localStorage writes indefinitely.
- **Local-only mode load-then-clobber race** — the save listener was
  attached BEFORE the persisted snapshot was loaded inside a 100 ms
  `setTimeout`. Any tldraw-internal store change in that window could
  overwrite the saved canvas with the blank initial store.
- **Status badge** — `store.connectionStatus` doesn't exist on the v5
  sync store, so the green/red emojis never rendered. Now uses
  `store.status` with the actual v5 enum.
- **CI nginx config routed sync at `/tldraw/sync/`** while the frontend
  (and HTTPS + HTTP-only configs) used `/tldraw-sync/`. Real-time collab
  quietly broke in CI mode for anyone who hit that path. The template
  refactor (see Changed) eliminates that class of drift.
- **`docker-compose.dev.yml` bind-mounted `./tldraw/main.jsx`** — that
  path doesn't exist (the real file is `./tldraw/src/main.jsx`). Docker
  silently created an empty directory at the mount point, so dev-mode
  live-reload never worked.
- **`useCallback(useMemo())` debounce in user-name updates** — recreated
  the timeoutId closure on every render so the 800 ms debounce never
  actually debounced.
- **Dead App scaffolding** — the 50 ms LocalTldraw→SyncTldraw handoff
  (mount Local for one frame, throw it away when isReady flips) is gone.
  SyncTldraw now mounts immediately when a `roomId` is present.

### Removed

- `tldraw/docker-entrypoint.sh` — the shell wrapper that picked between
  `serve` and `vite dev`. nginx is the runtime now; dev uses the
  `target: dev` compose entry directly.
- The 60-line `findColorButton` DOM-scrape fallback (×2 — was duplicated
  between `SyncTldraw` and `LocalTldraw`).
- `COLOR_SHORTCUTS.colorRgbMap` and `colorAliases` — dead code that
  supported the DOM-scrape fallback.
- The 100 ms `setInterval` polling for tool changes (×2). Replaced with
  reactive `editor.sideEffects` handlers.
- Three inline 130-line nginx config heredocs in `manage-config.sh`,
  collapsed into one template.

### Known limitations

> ⚠️ **No authentication on the sync backend.** Anyone who can reach
> `/tldraw-sync/` on the network can open any room, read its contents,
> and upload assets. v1.4.0 ships with path-traversal + SSRF + size-limit
> guards but the authorization layer is deferred to v1.5.0. Do not
> expose this stack to the public internet without an authenticating
> reverse proxy (Cloudflare Access, Tailscale, basic auth in nginx, …)
> in front of it.

---

[Unreleased]: https://github.com/vppillai/diagram-tools-hub/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/vppillai/diagram-tools-hub/releases/tag/v1.4.0
