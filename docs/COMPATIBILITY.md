# Hermes Compatibility Matrix

## Hermes Desktop Plugin SDK API usage

hermes-tackmark uses the following Hermes Desktop Plugin SDK APIs.
This matrix documents which APIs are used, their stability, and
which Hermes versions support them.

| API | Usage | Stability | Min Hermes Version |
|-----|-------|-----------|---------------------|
| `host.request('prompt.submit', ...)` | Send annotation to agent | Stable | all |
| `host.notify({ kind, message })` | Toast notifications | Stable | all |
| `host.state.focusedSessionId.get()` | Resolve current session (tile-aware) | Stable | ≥ 0.4 |
| `host.state.activeSessionId.get()` | Legacy fallback session | Stable | all (deprecated) |
| `host.state.busyBySession.get()` | Per-session busy state | Stable | ≥ 0.4 |
| `haptic()` | Haptic feedback on annotation | Stable | all |
| `ctx.i18n.register()` | Localization | Stable | all |
| `ctx.register({ area: 'panes' })` | Preview panel | Stable | all |
| `ctx.register({ area: 'statusBar.right' })` | Status bar chip | Stable | all |
| `ctx.storage.set/get/remove` | Plugin-scoped persistence | Stable | ≥ 0.4 |

## Feature support by Hermes version

| Feature | < 0.4 | ≥ 0.4 | Notes |
|---------|-------|-------|-------|
| Preview panel | ✅ | ✅ | `area: 'panes'` supported in all versions |
| Status bar chip | ✅ | ✅ | `area: 'statusBar.right'` supported in all versions |
| Focused session routing | ⚠️ | ✅ | Falls back to `activeSessionId` on older versions |
| Per-session busy state | ⚠️ | ✅ | Falls back to global `busy` state on older versions |
| `ctx.storage` persistence | ⚠️ | ✅ | Falls back to `localStorage` on older versions |
| Haptic feedback | ✅ | ✅ | No-op on unsupported platforms |
| i18n | ✅ | ✅ | English/Chinese provided |

## Session routing fallback

```js
// Session resolver priority:
// 1. focusedSessionId (tile-aware, ≥ 0.4) ← preferred
// 2. activeSessionId (legacy, all versions) ← fallback
// 3. null → send blocked with error
```

## `prompt.submit` return contract

Hermes `prompt.submit` returns `{"status": "streaming"}` on success.
The upstream tackmark's success detection (`result?.error || (result?.ok === false)`)
is broken because it checks for fields that don't exist in the actual
return shape. hermes-tackmark's `checkSubmitSuccess()` checks:

1. `result.status === 'streaming'` → success
2. `result.ok === true` → success (forward-compatible)
3. `result.error` present → failure
4. `result.ok === false` → failure
5. Unknown shape → failure (safe default)

## CSS variable tokens used

| Token | Component | Purpose |
|-------|-----------|---------|
| `--ui-bg-elevated` | AnnotationPopup | Popup background |
| `--ui-bg-chrome` | Toolbar | Toolbar background |
| `--ui-bg-input` | URL input, annotation input | Input background |
| `--ui-text-primary` | All text on dark/accent | Primary text |
| `--ui-text-secondary` | Cancel button | Secondary text |
| `--ui-text-tertiary` | Toolbar buttons | Tertiary text |
| `--ui-stroke-secondary` | Popup border, toolbar border | Secondary border |
| `--ui-stroke-tertiary` | Input border | Tertiary border |
| `--ui-accent-secondary` | Element label in popup | Accent color |
| `--ui-green` | Add button, Send button, Annotating toggle | Success/active |
| `--chrome-action-hover` | Status chip hover | Hover background |

These tokens are available in Hermes Desktop ≥ 0.3. On older versions
without these CSS variables, the browser will use fallback values
(typically transparent or inherited), which may not look ideal but
will not break functionality.
