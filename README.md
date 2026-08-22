# Hermes TackMark

> **Click an element. Leave a precise note. Review the draft in Hermes chat.**

Hermes TackMark is a visual UI annotation plugin for [Hermes Desktop](https://hermes-agent.nousresearch.com/docs). It opens a local web application in a floating browser, lets you select rendered elements, captures implementation evidence, and stages editable feedback in the focused Hermes chat composer.

Nothing is sent automatically. You review or rewrite the generated draft before submitting it to your coding agent.

[![CI](https://github.com/milzamsz/hermes-tackmark/actions/workflows/ci.yml/badge.svg)](https://github.com/milzamsz/hermes-tackmark/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Contents

- [Project status](#project-status)
- [Upstream credit](#upstream-credit)
- [Why this fork exists](#why-this-fork-exists)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Window controls](#window-controls)
- [URL and security model](#url-and-security-model)
- [Architecture](#architecture)
- [Development](#development)
- [CI](#ci)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Project status

Hermes TackMark is an independently maintained derivative, not an official Hermes Agent or upstream TackMark project. Version `0.1.0` targets the current Hermes Desktop plugin runtime and is developed publicly at <https://github.com/milzamsz/hermes-tackmark>.

The GitHub repository is not marked as a GitHub-native fork because development started from a source snapshot. Provenance is recorded in [`UPSTREAM_BASELINE`](UPSTREAM_BASELINE), the original remote is configured as `upstream`, and the original MIT copyright notice remains in [`LICENSE`](LICENSE).

## Upstream credit

Hermes TackMark is a substantially extended derivative of **[freehul/tackmark](https://github.com/freehul/tackmark)**, created by [freehul](https://github.com/freehul).

The original project established the core interaction model—open a preview, click an element, attach a note, and give an AI agent a concrete selector instead of an ambiguous screenshot description. This repository preserves that idea and the upstream MIT license while evolving the implementation for a native Hermes Desktop workflow.

Please visit and support the original project:

- Upstream repository: <https://github.com/freehul/tackmark>
- Upstream author: [freehul](https://github.com/freehul)
- Recorded fork baseline: [`UPSTREAM_BASELINE`](UPSTREAM_BASELINE)
- License attribution: [`LICENSE`](LICENSE)

## Why this fork exists

The upstream implementation loads fetched HTML through an iframe `srcdoc` document. That is lightweight, but real applications commonly break because of CORS, CSP, relative assets, scripts, authentication, and framework runtime behavior.

Hermes TackMark instead uses an isolated Electron `<webview>`, following Hermes Desktop's own browser-preview architecture. This makes the preview behave like a browser while keeping annotation data bounded and explicitly separated from user instructions.

| Area | Original TackMark | Hermes TackMark |
|---|---|---|
| Preview architecture | `fetch()` + iframe `srcdoc` | Isolated Electron webview |
| Window | Docked panel | Draggable, resizable floating browser |
| Window states | Panel visibility | Compact minimize, maximize/restore, hide |
| Launcher | Panel entry | Independently draggable floating launcher |
| Shortcut | Not central to workflow | `Ctrl/Cmd+Alt+A` show/hide, rebindable |
| Zoom | Page-dependent | Native 50–200% webview zoom + Ctrl/Cmd-wheel |
| Annotation delivery | Direct session submission after clicking Send | Editable draft in focused Hermes composer |
| Evidence | Selector and basic element details | Selector, strategy, DOM, styles, geometry, metadata, screenshot |
| URL policy | Broad local fetch behavior | Parsed loopback-first policy |
| Security framing | Basic payload | Bounded schema and explicit untrusted-page evidence |

## Features

### Floating browser

- Native Hermes floating pane; it does not consume chat layout width.
- Browser-style Back, Forward, Reload, address, and Open controls.
- Draggable browser window.
- Bottom-right resize grip with persisted dimensions.
- Maximize and restore to the previous geometry.
- **Minimize to a live 360 × 220 compact browser**, not a title-only line.
- Hide the browser without destroying its webview session.
- Last URL, window size, launcher position, and zoom survive plugin reloads.

### Floating launcher and shortcut

- A separate launcher remains available while the browser is hidden.
- Drag the launcher freely; its position is persisted and clamped to the Hermes viewport.
- Click the launcher to show or hide the full TackMark browser.
- Press **Ctrl+Alt+A** on Linux/Windows or **Cmd+Alt+A** on macOS to show/hide TackMark.
- Rebind the action in **Settings → Keyboard Shortcuts**.
- The same action is available from the Command Palette as **TackMark: Show or hide browser**.

### Browser zoom

- Toolbar Zoom Out, percentage/reset, and Zoom In controls.
- **Ctrl/Cmd + mouse wheel** works over the browser page and TackMark chrome.
- 10% steps, bounded to 50–200%.
- Zoom percentage is persisted.

### Precise visual annotations

Selecting an element captures bounded implementation evidence:

- Escaped CSS selector and selector strategy.
- Tag, ID, class list, and visible text.
- Element rectangle; click position is used only to place the annotation popup.
- Selected computed styles.
- Bounded element `outerHTML`.
- Bounded nearby/parent HTML.
- Safe semantic attributes such as `data-testid`, Astro/source hints, and optional Odoo metadata.
- A cropped screenshot of the selected element when Electron capture is available.

Selector generation prefers stable IDs and testing attributes, escapes Tailwind-style class names, and falls back to a bounded structural selector.

### Editable draft workflow

1. Add one or more annotations.
2. Click **Draft in chat**.
3. TackMark inserts structured Markdown into the currently focused Hermes composer.
4. Screenshots are attached to that same composer.
5. Review, rewrite, or remove anything you do not want.
6. Send manually when ready.

TackMark does **not** call `prompt.submit`, does not start agent processing automatically, and does not bypass your review.

## Requirements

- Hermes Desktop with desktop-plugin support.
- Node.js 20 or newer for building from source.
- npm.
- A local web application on a loopback address, for example `http://localhost:4321`.
- Python 3 only if you want to use the included optional static server.

## Installation

### Build and install from source

```bash
git clone https://github.com/milzamsz/hermes-tackmark.git
cd hermes-tackmark
npm install
npm run build
```

`npm run build` bundles the source and installs it under the active Hermes home:

```text
${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/hermes-tackmark/plugin.js
```

When `HERMES_HOME` is set (for example, for a named profile), the installer respects it. Otherwise it defaults to `~/.hermes`.

The plugin folder and declared plugin ID are both `hermes-tackmark`; they must remain identical.

Open the Hermes Command Palette and run **Reload desktop plugins**. Hermes normally hot-reloads desktop plugins, but the explicit reload is useful after first installation or a structural upgrade.

### Install the built artifact manually

If you already have `dist/plugin.js`:

```bash
HERMES_HOME=${HERMES_HOME:-$HOME/.hermes}
mkdir -p "$HERMES_HOME/desktop-plugins/hermes-tackmark"
cp dist/plugin.js "$HERMES_HOME/desktop-plugins/hermes-tackmark/plugin.js"
```

Do not copy `src/plugin.js` directly. The source imports local core modules and must be bundled first.

### Update

Pull the latest `main` branch, reinstall dependencies, and rebuild:

```bash
git pull --ff-only origin main
npm install
npm run build
```

Then run **Reload desktop plugins** from the Hermes Command Palette.

### Uninstall

Remove only the installed plugin directory, then reload desktop plugins:

```bash
rm -rf "${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/hermes-tackmark"
```

This does not remove your source checkout. TackMark preferences stored by Hermes may remain in plugin-scoped storage.

## Quick start

1. Start your local application, for example `npm run dev`.
2. Reload desktop plugins in Hermes.
3. Click the floating browser launcher or press `Ctrl/Cmd+Alt+A`.
4. Enter a loopback URL such as `localhost:4321` and press Enter.
5. Click **Select element**.
6. Hover to highlight an element, then click it.
7. Write the requested change and choose **Add feedback**.
8. Repeat for any other elements.
9. Click **Draft in chat**.
10. Review the generated composer draft and send it manually.

## Window controls

| Control | Behavior |
|---|---|
| Minimize | Shrinks to a live 360 × 220 compact browser; webview stays mounted |
| Restore | Returns to the exact width and height recorded before minimizing |
| Maximize | Fills the available Hermes workspace |
| Restore from maximize | Returns to the previous floating geometry |
| Hide | Removes the browser from view while preserving session state |
| Floating launcher | Restores hidden/minimized TackMark or hides an open browser |
| Resize grip | Resizes the floating browser, constrained to the viewport |

A migration clears the native Hermes legacy-collapse state that could otherwise leave only a thin “TackMark” line after upgrading.

## Optional static server

Most framework development servers already work directly with the native webview. For static files, this repository also includes a hardened loopback server:

```bash
python serve.py /absolute/path/to/site 8080
```

Then open an explicit file URL such as `http://localhost:8080/index.html` in TackMark. Directory URLs, including `/`, return `403` by design so the helper cannot enumerate directories.

The helper server includes path-containment checks, deny patterns, and narrowed CORS handling. It is optional; it is **not** required for Astro, Vite, Next.js, Odoo, or another application already serving itself.

## URL and security model

TackMark treats the previewed page as untrusted input.

- Default navigation is restricted to loopback hosts: `localhost`, `127.0.0.1`, and `[::1]`.
- Only HTTP and HTTPS URLs pass the preview policy.
- Credentials embedded in URLs are rejected.
- The webview uses context isolation, disabled Node integration, and sandboxing.
- Page-to-plugin messages pass through a bounded runtime schema.
- Captured text, HTML, styles, metadata, and selectors have size limits.
- Selected semantic metadata applies a best-effort deny list for secret-like attribute names. Captured text and bounded DOM excerpts are not comprehensively redacted and may still contain sensitive page data; review the draft before sending and do not annotate secret-bearing elements.
- Page-derived evidence is labeled **UNTRUSTED** in the generated draft.
- Page content is evidence, never an instruction for the agent.
- Drafting does not automatically submit or execute anything.

## Architecture

```text
hermes-tackmark/
├── src/
│   ├── plugin.js                 # Hermes contributions, floating browser, webview and annotation UI
│   └── core/
│       ├── annotation-schema.js  # Bounded runtime validation and annotation records
│       ├── composer-draft.js     # Editable composer insertion; never submits
│       ├── html.js               # HTML escaping helpers
│       ├── launcher-position.js  # Viewport-clamped launcher geometry
│       ├── metadata-adapter.js   # Safe semantic metadata adapters
│       ├── normalize-path.js     # Cross-platform path normalization
│       ├── payload.js            # Deterministic, untrusted-aware Markdown draft
│       ├── selectors.js          # Stable selector generation and CSS escaping
│       ├── session.js            # Session safety helpers retained for compatibility
│       ├── url-policy.js         # Parsed loopback-first navigation policy
│       └── zoom.js               # Persisted 50–200% zoom rules
├── scripts/
│   ├── bundle.mjs                # esbuild bundle → dist/plugin.js
│   └── install.mjs               # Install bundle into Hermes Desktop
├── tests/                        # Node architecture, security and behavior tests
├── serve.py                      # Optional hardened static server
├── dist/plugin.js                # Generated single-file desktop plugin
├── UPSTREAM_BASELINE             # Upstream provenance record
└── LICENSE                       # Upstream MIT license and attribution
```

### Runtime flow

```text
local web app
    ↓ Electron webview navigation
isolated guest page
    ↓ bounded annotation queue
Hermes TackMark
    ↓ schema validation + evidence formatting
focused Hermes composer
    ↓ user reviews and manually sends
coding agent
```

## Development

```bash
npm install
npm test
python -m unittest tests.test_server -v
npm run bundle
npm run build
```

Use `npm run bundle:watch` during development. After changing the plugin, use **Reload desktop plugins** from the Hermes Command Palette if hot reload does not remount it automatically.

## CI

GitHub Actions runs the Node test suite and Python static-server tests on pushes and pull requests to `main`. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Troubleshooting

### The launcher does not appear

1. Confirm the built file exists at `${HERMES_HOME:-$HOME/.hermes}/desktop-plugins/hermes-tackmark/plugin.js`.
2. Confirm the directory is named exactly `hermes-tackmark`.
3. Run **Reload desktop plugins** from the Hermes Command Palette or restart Hermes Desktop.
4. Re-run `npm run build` and check the installer output for the exact destination.

### A URL is blocked

Use an HTTP or HTTPS loopback URL such as `http://localhost:4321`, `http://127.0.0.1:8080`, or `http://[::1]:3000`. Remote hosts, non-web schemes, and URLs containing credentials are intentionally rejected by the default policy.

### The page does not load correctly

- Verify the application opens in a normal browser first.
- Confirm the development server is listening on a loopback interface and the displayed port.
- For plain static files, use `python serve.py /absolute/path/to/site 8080`; do not navigate the webview directly to a `file://` URL.
- Reload the page after restarting its development server.

### Draft in chat does nothing

- Focus the intended Hermes chat composer before clicking **Draft in chat**.
- Make sure at least one annotation has been added.
- If no text appears, reload desktop plugins and retry with the intended chat pane visibly focused.
- TackMark inserts a draft but never presses Send; this is intentional.

### Screenshots are missing

Screenshot capture is best-effort and depends on Electron `webview.capturePage` support and a visible, non-zero element rectangle. The selector, DOM excerpt, styles, geometry, and metadata remain available when image capture is unavailable.

## Limitations

- TackMark previews web applications only; it does not annotate native desktop UI outside its webview.
- The default URL policy is loopback-only and exposes no UI for adding remote hosts.
- Authentication state is separate from your normal browser but persists in the shared Hermes preview partition (`persist:hermes-preview`) and may be visible to other Hermes preview webviews.
- Cross-origin frames and closed shadow roots can prevent deep element inspection.
- Dynamic pages can invalidate a selector after navigation or a substantial rerender; capture a new annotation when that happens.
- Screenshot attachment and composer insertion depend on the Hermes Desktop plugin APIs available in the installed Hermes version.

## Contributing

Issues and pull requests are welcome. Please:

1. Keep the default URL policy loopback-first.
2. Do not add automatic prompt submission.
3. Preserve explicit untrusted-page framing.
4. Add regression tests for window-state, message-schema, selector, or payload changes.
5. Run both Node and Python test suites before opening a pull request.
6. Keep upstream attribution and the MIT license intact.

## Acknowledgements

- **[freehul/tackmark](https://github.com/freehul/tackmark)** by [freehul](https://github.com/freehul) — original project, interaction concept, and MIT-licensed foundation.
- [Hermes Agent](https://hermes-agent.nousresearch.com/docs) by Nous Research — desktop plugin host and coding-agent environment.
- [ORCA](https://github.com/stablyai/orca) — interaction inspiration for the movable launcher and floating-browser window states. No ORCA source code is included in this repository.

## License

MIT. See [`LICENSE`](LICENSE).

The copyright and permission notice from the original `freehul/tackmark` project are preserved.
