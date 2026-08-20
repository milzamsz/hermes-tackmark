# Changelog

All notable changes to this fork will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-20

### Changed
- Forked from `freehul/tackmark` upstream snapshot (2026-08-20)
- Repository renamed to `hermes-tackmark` for OCloud-maintained hardened fork

### Security
- Replaced regex URL validation with parsed local-first URL policy (loopback default)
- Added CSS escaping for all IDs and class names (Tailwind-safe)
- Replaced `activeSessionId` with `focusedSessionId` (tile-aware)
- Rewrote success detection against actual `{"status":"streaming"}` contract
- Added strict frame message validation with size/type limits
- Hardened serve.py: path traversal prevention, sensitive file deny patterns, CORS narrowing
- Added untrusted-content framing in agent payload (page text labeled, separated from user note)

### Added
- Extracted core modules: selectors, url-policy, session, annotation-schema, payload, html, normalize-path
- Deterministic payload formatter with bounded size caps
- UUID-based annotation IDs (replacing collision-prone `Date.now()`)
- 134 Node tests + 9 Python tests
- CI workflow (GitHub Actions)

### Fixed
- De-duplicated selector generation (two diverged upstream copies → one module)
- Iterative loadPage fallback (replacing recursive self-healing)
- Migrated tests from regex source-text extraction to proper ESM imports
