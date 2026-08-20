# hermes-tackmark

> **Click an element. Drop a note. Let AI fix the code.**
> Hardened fork of [freehul/tackmark](https://github.com/freehul/tackmark) for Hermes Desktop.

## What it does

hermes-tackmark is a visual annotation plugin for Hermes Desktop that turns UI feedback into structured technical context for an AI coding agent.

1. Load a local preview page in the plugin's iframe
2. Click an element → get a precise CSS selector (Tailwind-safe)
3. Add a note describing the issue
4. Send → the agent receives structured context with explicit untrusted/ trusted separation

## Hardening changes from upstream

| Area | Upstream | hermes-tackmark |
|------|----------|-----------------|
| CSS selectors | Raw class concatenation (`.${c}`) | CSS.escape for all identifiers |
| Selector duplication | Two diverged copies | Single shared module |
| URL validation | Regex-only (`/^https?:\/\//`) | Parsed local-first policy (loopback default) |
| Session routing | `activeSessionId` | `focusedSessionId` (tile-aware) |
| Success detection | `result?.ok === false` (broken) | Checks `{"status":"streaming"}` contract |
| Frame messages | Partial validation | Strict schema with size/type limits |
| Payload | Selector + tag + classes only | Full evidence: styles, rect, text, strategy, untrusted framing |
| Annotation IDs | `ann_${Date.now()}` (collision-prone) | UUID |
| Load failure | Recursive self-healing | Iterative fallback |
| Persistence | localStorage | ctx.storage (with localStorage fallback) |
| Helper server | CORS `*`, no traversal protection | Narrowed CORS, path containment, deny patterns |

## Installation

```bash
git clone <repo-url>
cp src/plugin.js ~/.hermes/desktop-plugins/tackmark/plugin.js
```

### Local server (optional)

```bash
python serve.py <your-project-dir> 8080
```

## Development

```bash
npm test          # Run all Node tests
python -m unittest tests.test_server  # Run Python server tests
```

## Architecture

```
src/
├── plugin.js                    # Main plugin entry (ESM)
├── core/
│   ├── selectors.js             # CSS escaping + selector strategy
│   ├── url-policy.js            # Local-first URL validation
│   ├── session.js               # Focused session + success detection
│   ├── annotation-schema.js     # Bounded message validation
│   ├── payload.js               # Deterministic prompt formatter
│   ├── html.js                  # HTML attribute escaping
│   └── normalize-path.js        # MSYS path conversion (Windows)
├── serve.py                     # Hardened static file server
└── tests/
    ├── selectors.test.js        # 34 tests
    ├── url-policy.test.js       # 21 tests
    ├── schema.test.js           # 23 tests
    ├── payload.test.js          # 20 tests
    ├── session.test.js           # 22 tests
    ├── security.test.js         # 14 tests
    ├── normalize-path.test.js   # 7 tests
    ├── test_server.py           # 9 Python tests
    └── fixtures/mock-dom.js     # Zero-dependency DOM shim
```

## Security invariants

- Preview iframe: `sandbox="allow-scripts"` (no `allow-same-origin`)
- Default preview: loopback only (`localhost`, `127.0.0.1`, `[::1]`)
- Frame messages: validated by schema with size limits
- Page text: labeled UNTRUSTED in agent payload
- No password/token/cookie capture
- Helper server: loopback-bound, path containment, deny patterns

## License

MIT — preserved from upstream.
