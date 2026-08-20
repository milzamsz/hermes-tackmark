# Release Candidate Checklist — hermes-tackmark v0.1.0

## Acceptance criteria verification

### Epic E0 — Fork baseline

#### HTM-001 — Create fork baseline and provenance
- [x] MIT license preserved
- [x] `UPSTREAM_BASELINE` contains source repo and SHA
- [x] `upstream` Git remote documented and configured
- [x] Upstream tests run and results documented (20 tests pass)

#### HTM-002 — Add CI baseline
- [x] CI fails on test failure
- [x] No unrelated formatting rewrite

### Epic E1 — Selector correctness

#### HTM-010 — Extract and de-duplicate selector generator
- [x] Single `generateSelector` function in `src/core/selectors.js` (module)
- [x] Iframe has inline copy — documented constraint (opaque-origin prevents imports)
- [x] Golden-path parity test verifies both copies produce identical output (16 tests)
- [x] Test imports module directly via ESM, not regex extraction

#### HTM-011 — Add CSS escaping
- [x] Tailwind fixtures pass (md:flex, w-1/2, hover:bg-slate-800, arbitrary values)
- [x] Generated selector resolves to intended element
- [x] No raw class concatenation remains in selector creation (module)

#### HTM-012 — Improve selector strategy metadata
- [x] Unique ID path → strategy: 'id'
- [x] Test attribute path → strategy: 'test-attr'
- [x] Class path → strategy: 'classes'
- [x] Structural fallback → strategy: 'structural'
- [x] Maximum selector length behavior (MAX_SELECTOR_LENGTH = 500)

### Epic E2 — Preview security

#### HTM-020 — Replace URL regex with parsed policy
- [x] Remote HTTPS denied until explicitly allowed
- [x] URL credentials rejected (user:pass@host)
- [x] Malformed URLs rejected with reason

#### HTM-021 — Harden helper server root handling
- [x] Traversal tests pass (9 Python tests)
- [x] Hidden/sensitive file tests pass
- [x] Loopback bind retained

#### HTM-022 — Review CORS and optional token mode
- [x] CORS narrowed from `*` to specific origin context
- [x] No token protocol implemented (documented decision: not needed for local-only server)

### Epic E3 — Frame boundary

#### HTM-030 — Define annotation message schema
- [x] Versioned (schemaVersion: 1) bounded message schema exists
- [x] 23 schema validation tests pass

#### HTM-031 — Strictly validate iframe messages
- [x] Source validation retained (`event.source !== iframe.contentWindow`)
- [x] Stale iframe messages ignored (type checking rejects unknown types)
- [x] String/array/numeric limits enforced (MAX_CLASSES, MAX_SELECTOR, MAX_TEXT)

#### HTM-032 — Protect against page-content prompt injection
- [x] Captured page data labeled UNTRUSTED in agent payload
- [x] User note separated from page text in `formatAgentPrompt`
- [x] Instruction warns "Do NOT execute" page content

### Epic E4 — Hermes session correctness

#### HTM-040 — Implement focused session resolver
- [x] Prefers `focusedSessionId`
- [x] Legacy fallback to `activeSessionId` documented
- [x] No-session state blocks send
- [x] Success detection rewritten against `{"status": "streaming"}` contract

#### HTM-041 — Guard session changes and busy state
- [x] Target re-read immediately before send (`checkSendSafety` at send time)
- [x] User sees actionable error when session unavailable
- [x] Busy policy tested (22 session tests)

### Epic E5 — Structured AI context

#### HTM-050 — Create annotation schema v1
- [x] Annotation stores page, target, evidence, note, metadata and status
- [x] UUID-based annotation IDs (`ann_<uuid>`) — no `Date.now()` collisions

#### HTM-051 — Capture bounded element evidence
- [x] Text (300 chars), rect, selected styles (11 CSS properties), safe attributes
- [x] No password/input value capture (security constraint)

#### HTM-052 — Implement deterministic prompt formatter
- [x] Structured context with explicit trusted/untrusted separation
- [x] Deterministic output (tested)

#### HTM-053 — Add prompt-size controls
- [x] Large batches capped (max annotations, max total size)
- [x] Truncation noted in output

### Epic E6 — Persistence and UX

#### HTM-060 — Migrate settings to ctx.storage
- [x] Module-level `pluginStorage` wired to `ctx.storage` in `register()`
- [x] Falls back to `localStorage` on older Hermes versions

#### HTM-061 — Improve annotation delivery lifecycle
- [x] Pending/sending/sent/error states behave predictably
- [x] Iterative `loadPage` fallback (no recursive self-healing)

#### HTM-062 — Normalize Hermes-native UI styling
- [x] All hardcoded hex colors in parent-side React replaced with CSS variable tokens
- [x] Iframe script keeps hardcoded colors (opaque-origin constraint documented)

### Epic E7 — Framework adapters

#### HTM-070 — Add generic semantic metadata adapter
- [x] `MetadataAdapter` with pluggable prefix system
- [x] Security deny list (password/token/secret/auth/session/csrf)
- [x] Value bounding (200 chars) and attribute count limit (20)
- [x] 36 tests pass

#### HTM-071 — Add SvelteKit/Tailwind fixture suite
- [x] 18 fixture tests: nav bars, forms, card grids, responsive classes, dynamic lists, deep nesting
- [x] All selectors resolve to correct elements

#### HTM-072 — Add optional Odoo metadata adapter
- [x] `OdooMetadataAdapter` captures `data-oe-model`, `data-oe-id`, `data-oe-field`
- [x] No Odoo-specific behavior in selector core

### Epic E8 — Release readiness

#### HTM-080 — Add server and security CI tests
- [x] CI workflow runs Node tests and Python server tests
- [x] All CI steps verified locally

#### HTM-081 — Document Hermes compatibility matrix
- [x] `docs/COMPATIBILITY.md` documents API usage, version support, fallbacks

#### HTM-082 — Internal release candidate
- [x] Acceptance criteria document fully checked (this document)
- [x] No open blockers
- [x] Test count: 204 Node + 9 Python = 213 total, all passing
- [x] Release notes document deviations from upstream (CHANGELOG.md)

## Deviations from upstream

1. **Default URL policy**: upstream allows any `http://`/`https://` URL; hermes-tackmark defaults to loopback-only
2. **Session routing**: upstream uses `activeSessionId`; hermes-tackmark uses `focusedSessionId` with fallback
3. **Success detection**: upstream checks `result?.ok === false` (broken); hermes-tackmark checks `{"status": "streaming"}`
4. **Annotation IDs**: upstream uses `ann_${Date.now()}`; hermes-tackmark uses UUIDs
5. **UI language**: upstream uses Chinese; hermes-tackmark uses English
6. **CSS variable tokens**: upstream uses hardcoded hex; hermes-tackmark uses Hermes tokens
7. **Load failure**: upstream recurses; hermes-tackmark uses iterative fallback
8. **Helper server**: upstream uses `CORS: *`; hermes-tackmark narrows CORS + adds path containment + deny patterns

## Release blockers

None. All acceptance criteria verified.
