# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[semver](https://semver.org/).

For commit-level detail, see the auto-generated body of each
[GitHub Release](https://github.com/vppillai/diagram-tools-hub/releases).

## [Unreleased]

## [1.6.1] — 2026-05-15

Submodule patch bump — picks up whiteboard `v1.4.2` → `v1.4.3`. Single-commit fix that defers a `clearFlow` reference in the tool menu so opening / restoring the menu doesn't trip a Temporal Dead Zone `ReferenceError`. The crash was reachable on first right-click after page load OR on the auto-reopen of a pinned menu after refresh. DTH proper is unchanged.

### Fixed

- **Whiteboard submodule bumped to [v1.4.3](https://github.com/vppillai/whiteboard/releases/tag/v1.4.3).** Pulls in the TDZ crash fix in the right-click tool menu — `clearFlow` is now read lazily inside the click handler instead of eagerly at menu-content build time, so it's never accessed before its `const` binding initializes.

## [1.6.0] — 2026-05-14

Submodule bump — picks up whiteboard `v1.3.0` → `v1.4.2`. The bundled `/whiteboard/` instance gains the v1.4 Shape tool (rectangle / ellipse / line / arrow), a comprehensive right-click menu overhaul (icon-only pills with hover tooltips, shared swatch palette with custom-color "+" and ×-delete, pinned-menu persistence across sessions), a Factory Reset button in the settings panel (recovery from stuck IDB / service-worker states), plus two follow-up patches (empty-text guard, factory-reset URL cleanup). DTH proper is unchanged: same services, same networking, same env contract.

### Changed

- **Whiteboard submodule bumped to [v1.4.2](https://github.com/vppillai/whiteboard/releases/tag/v1.4.2).** Users of the bundled `/whiteboard/` instance gain:

  **From whiteboard v1.4.0:**
  - **Shape tool** — drag-to-create rectangle / ellipse / line / arrow. One unified tool with four sub-modes (`R` / `O` / `A` / `L`); Shift constrains (square / circle / 45° lines). Sticky color, stroke width, fill toggle, fill-opacity slider. Lines and arrows use endpoint-based resize so dragging past origin flips direction naturally. Round-trips through clipboard + PNG / SVG / PDF exports as native vector primitives.
  - **Right-click menu overhaul** — icon-only pills with hover tooltips revealing the name + shortcut. Tool row split into two rows of three. Shared swatch palette (curated colors + custom + "+") across every COLOR section. Hover-revealed × badge deletes custom swatches inline. Pinned menu persists across browser sessions (localStorage), survives Esc, auto-rebuilds when settings change, and auto-reappears at its anchor on page refresh. Tool / selection / settings changes broadcast to the pinned menu's contextual section.
  - **Factory Reset** — destructive recovery in the settings panel that wipes all per-origin browser state (IndexedDB, localStorage, caches, service workers) and reloads. Replaces the DevTools-console snippet that was the previous recovery path for stuck states (multi-tab IDB-upgrade blocks, stale service workers).
  - **Block-eraser scope** — wipe mode remains strokes-only (pixel-cut); object mode tap deletes any kind (strokes / shapes / texts / images). Prevents the prior "erasing strokes off an image also nukes the image" footgun.
  - **Fine-grained text size** — `Cmd/Ctrl+Shift+,` / `Cmd/Ctrl+Shift+.` decrement / increment the active text's font size by 1 px. Works in both edit mode and Select mode.
  - **Keymap rebinds** — `R` / `O` / `A` / `L` activate the Shape tool sub-modes; `P` is laser pointer (was `L`); `Shift+P` is pen-default brush (was `P`); `Shift+C` opens the color picker (was `C`); `Shift+O` opens the options menu (was `O`).

  **From whiteboard v1.4.1:**
  - **Empty-text guard** — whitespace-only text objects no longer get persisted; pressing Esc on an empty new-text discards instead of saving.

  **From whiteboard v1.4.2:**
  - **Factory-reset URL cleanup** — the cache-busting `?factoryReset=…` query param is removed from the URL after the post-reset reload so subsequent navigation / share isn't carrying a one-shot diagnostic flag.

  IDB schema upgrades automatically from v4 → v5 (additive: new `shapes` store; existing strokes / images / texts data is untouched). The upgrade now surfaces the multi-tab-blocked case loudly via a console warning instead of hanging boot silently.

### Notes

- 📜 **TLDraw license reminder** — tldraw v5 (still bundled at the same version as v1.5.0) requires `TLDRAW_LICENSE_KEY` in `.env` for any deployment on a hostname OTHER than `localhost` / `127.0.0.1`. On non-localhost without a key, the tldraw canvas is blocked by a license-required overlay. A free WatermarkOnly key is available at [tldraw.dev/community/license](https://tldraw.dev/community/license); see [README.md → "TLDraw Licensing"](https://github.com/vppillai/diagram-tools-hub/blob/main/README.md#tldraw-licensing) for the full table of options. **The `.env.example` template now includes a commented `TLDRAW_LICENSE_KEY=` line** so the gap is harder to miss for new operators.

## [1.5.0] — 2026-05-14

Submodule bump — picks up whiteboard `v1.1.0` → `v1.3.0` (skipping the v1.2.0 release; this DTH release rolls both whiteboard minors into a single deployment). The bundled `/whiteboard/` instance gains the entire v1.2 batch (text tool, dedicated Select tool, laser pointer, mouse synthetic pressure, idle / jiggle pen halo, double-Esc tool toggle) plus the v1.3 batch (Lasso → Select absorption with marquee + multi-select, whiteboard-native clipboard round-trip for strokes + texts). DTH proper is unchanged: same services, same networking, same env contract.

Minor-bumped instead of patch because the bundled-tool UX expansion is substantial enough (two whiteboard minors worth) that calling it a v1.4.4 patch would understate it.

### Changed

- **Whiteboard submodule bumped to [v1.3.0](https://github.com/vppillai/whiteboard/releases/tag/v1.3.0).** Users of the bundled `/whiteboard/` instance now have everything from v1.2 + v1.3:

  **From whiteboard v1.2.0:**
  - **Text tool (`T`)** — multi-line text objects, mono / 12 px defaults, `Cmd/Ctrl+B/I/U` for bold / italic / underline. Right-click menu for font / size / color. Wrap-width via E/W edge drag.
  - **Laser pointer (`L`)** — fading polyline trail for presentations. Color via curated palette; nothing persists.
  - **Mouse-mode synthetic pressure** — velocity-shaped pressure for mouse strokes (faster = thinner), opt-in via settings.
  - **Idle pen halo + jiggle-to-find** — pointer halo brightens after 5 s of inactivity or back-and-forth jiggle, helping Wacom Intuos users locate the cursor.
  - **`Esc Esc` toggles Draw ↔ Select** within a 350 ms window.
  - **Auto-switch to Select on image paste** so the pasted image can be repositioned immediately.

  **From whiteboard v1.3.0 (BREAKING in the whiteboard interface; transparent to DTH):**
  - **Lasso tool absorbed into Select (`V` or `S`).** Single, multi, and marquee selection all live in one tool now. `Cmd/Ctrl+A` selects every non-deleted object (strokes + images + texts). `Shift+click` toggles objects in / out of the selection. Marquee drag on empty canvas multi-selects. Drag any selected object → the whole group moves.
  - **Whiteboard-native clipboard round-trip.** `Cmd/Ctrl+C` / `Cmd/Ctrl+X` writes both a transparent-background PNG and a structured `data-whiteboard-v1` JSON bundle. Pasting back inside the whiteboard restores strokes + texts as live vectors (relative layout preserved); pasting into Google Docs / Slack / Confluence still lands as PNG.
  - **Universal `Cmd/Ctrl+V`** — image / text / whiteboard bundle, each routed to the right paste handler.

  Storage upgrades in place — IDB schema reaches v4 (v2 added images, v3 added texts, v4 is a corrective re-upgrade that recovers users whose v3 upgrade silently missed the `texts` store). Existing stroke + image data is preserved across all upgrades. Existing DTH users have nothing to migrate on the DTH side; the upgrade happens transparently in the user's browser on first visit to `/whiteboard/` after pulling the new container.
- **`manage-config.sh`** in-file compose template: the inline `# pinned at v1.1.0` comment next to the whiteboard service is now `# pinned at v1.3.0`. Cosmetic only — the submodule SHA recorded by `git submodule status` is the load-bearing reference; the generated `docker-compose.yml` is gitignored and regenerated from this template on the next `manage-config.sh` invocation.

## [1.4.3] — 2026-05-12

Submodule bump only — picks up whiteboard `v1.0.0` → `v1.1.0` so the bundled `/whiteboard/` instance gains image paste / move / resize / rotate and the dedicated Select tool. DTH proper is unchanged: same services, same networking, same env contract.

### Changed

- **Whiteboard submodule bumped to [v1.1.0](https://github.com/vppillai/whiteboard/releases/tag/v1.1.0).** Users of the bundled `/whiteboard/` instance now have:
  - **Image paste / drag-drop** — `Ctrl/Cmd + V` clipboard or drag-drop a PNG / JPEG / WebP / GIF onto the canvas.
  - **Select tool (`V`)** with move / resize (Shift = aspect-lock) / rotate (double-click handle resets to 0°) / delete.
  - **PNG / SVG / PDF exports** include images in z-order with rotation preserved.
  - **`Cmd/Ctrl+A`** now batch-marks images for delete alongside strokes.
  - **Export filename gains seconds** so back-to-back exports within the same minute don't collide.

  Storage upgrades in place — IDB schema bumps to v2 with two new object stores (`images` + `images-blob`); existing stroke data is preserved. Existing v1.4.x DTH users have nothing to migrate on the DTH side; the upgrade happens transparently in the user's browser on first visit to `/whiteboard/` after pulling the new container.
- **`manage-config.sh`** in-file compose template: the inline `# pinned at v1.0.0` comment next to the whiteboard service is now `# pinned at v1.1.0`. Cosmetic only — the submodule SHA recorded by `git submodule status` is the load-bearing reference; the generated `docker-compose.yml` is gitignored and regenerated from this template on the next `manage-config.sh` invocation.

## [1.4.2] — 2026-05-12

Single-fix patch closing a release-upgrade trap surfaced by a user
upgrading v1.4.0 → v1.4.1.

### Fixed

- **`manage-config.sh rebuild <service>` now picks up template
  changes after a release upgrade.** Both `docker-compose.yml` and
  `engine/nginx.conf` are gitignored artifacts of the script's
  in-file templates. The previous `ensure_configs_exist` ran
  `if [ ! -f … ]; then create_…`, which left stale files in place
  whenever the upgrade-from version had already bootstrapped them.
  Concrete repro: v1.4.1's compose template added a
  `VITE_TLDRAW_LICENSE_KEY` build arg under the tldraw service;
  `./manage-config.sh rebuild tldraw` against an upgraded checkout
  rebuilt the image against the stale v1.4.0 compose file, the new
  build arg never reached docker build, and the license key in
  `.env` never made it into the bundle. `ensure_configs_exist`
  now always regenerates from templates, and all three rebuild
  paths (`rebuild_services` single-service, `rebuild_dev_services`
  single-service, `rebuild_only`) call it before building.

## [1.4.1] — 2026-05-12

Post-v1.4.0 follow-up: a fictional action version pin had broken the
Security Scan workflow for every push since the release, and two
real deployment paths (systemd unit + submodule upgrade) tripped
users upgrading existing installs. Also exposes the tldraw license
key as an env var so non-localhost deployments are unblocked.

### Added

- **Optional `TLDRAW_LICENSE_KEY` env var** threaded through to the
  tldraw bundle at image-build time. Empty (default) keeps the
  current WatermarkOnly behavior; on `localhost` that's fine, but
  non-localhost deployments must set this — tldraw v5 blocks the
  canvas with a license-required overlay otherwise.

### Fixed

- **`aquasecurity/trivy-action@0.28.0`** was a tag that doesn't exist
  on the upstream action. Security Scan failed to resolve the action
  on every push since v1.4.0 and blocked every open PR's CI. Bumped
  to `v0.36.0` along with the other Dependabot-flagged outdated
  pins (`trufflehog`, `codeql-action`, `upload-artifact`,
  `setup-node`, `github-script`, `action-gh-release`).
- **Snyk step in `security.yml`** never ran cleanly. It called
  `npx snyk test` without first installing tldraw's deps (Snyk
  errored "Missing node_modules folder") and assumed a `SNYK_TOKEN`
  secret that isn't configured. Now runs `npm install` first and
  skips with a workflow notice when the token isn't present.
- **`drawapp.service`'s `ProtectHome=true`** blocked the docker CLI's
  access to `/root/.docker/config.json` for registry auth. Changed
  to `ProtectHome=read-only` and added `/root/.docker` to
  `ReadWritePaths`.
- **Submodule auto-init on upgrade.** `git pull` on a pre-v1.4 clone
  left the whiteboard submodule path unpopulated, breaking the next
  build. `manage-config.sh` now runs `git submodule update --init
  --recursive` from every start/rebuild path when an existing
  submodule directory has no `.git` pointer.

### Changed

- README documents the tldraw v5 license-key requirement for
  non-localhost deployments with the three options (free
  WatermarkOnly / trial-commercial / stay on localhost) and the
  end-to-end flow from `.env` to bundle.

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
- **Per-tool style defaults and persistence.** Draw/highlight default to
  size `'s'`; text/note default to size `'m'` and font `'mono'`. When
  you change a font or size from the style panel, the new value sticks
  across tool switches and across page reloads (localStorage).
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
- **Reactive tool-change handler was reading the wrong field.** The
  current tool ID lives on the editor's state machine (`editor.root`),
  not on the `instance` record — the previous handler checked
  `next.currentToolId` which was always undefined, so per-tool
  preferences (font for text/note, size for draw/highlight) only got
  applied on initial mount, never on later tool switches.

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
> and upload assets. Path-traversal, SSRF, and per-upload size limits
> are enforced, but the authorization layer is not implemented. Do not
> expose this stack to the public internet without an authenticating
> reverse proxy (Cloudflare Access, Tailscale, basic auth in nginx, …)
> in front of it. Auth is on the roadmap.

---

[Unreleased]: https://github.com/vppillai/diagram-tools-hub/compare/v1.4.2...HEAD
[1.4.2]: https://github.com/vppillai/diagram-tools-hub/releases/tag/v1.4.2
[1.4.1]: https://github.com/vppillai/diagram-tools-hub/releases/tag/v1.4.1
[1.4.0]: https://github.com/vppillai/diagram-tools-hub/releases/tag/v1.4.0
