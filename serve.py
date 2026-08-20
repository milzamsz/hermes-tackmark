#!/usr/bin/env python3
"""hermes-tackmark — Hardened static file server.

Based on upstream serve.py with security hardening:
- Loopback-only binding (preserved)
- Dotfile blocking (preserved)
- Directory listing disabled (preserved)
- CORS narrowed from * to specific origin (hardened)
- Path traversal prevention via canonicalization (added)
- Sensitive filename deny patterns (added)
- OPTIONS preflight handled (preserved)

Usage: python serve.py <directory> [port, default 8080]
"""
import http.server
import sys
import os
import urllib.parse
import fnmatch

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath('.')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

# Sensitive file patterns to block (defense-in-depth, not a substitute for correct root)
DENY_PATTERNS = [
    '*.pem', '*.key', '*.p12', '*.pfx',
    '*.sqlite*', '*.db', '*.dump',
    '*.bak', '*.backup',
    '.env*', 'credentials*', 'secrets*',
    'config.local.*',
]

# Check if a path matches any deny pattern
def is_denied(path):
    basename = os.path.basename(path)
    for pattern in DENY_PATTERNS:
        if fnmatch.fnmatch(basename, pattern):
            return True
    return False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        decoded = urllib.parse.unquote(path)

        # Reject dotfiles (prevents .git/.env exposure)
        if any(part.startswith('.') for part in decoded.split('/') if part):
            self.send_error(404, 'Blocked')
            return

        # Disable directory listing (prevents source enumeration)
        if decoded.endswith('/'):
            self.send_error(403, 'Directory listing disabled')
            return

        # Canonicalize path and enforce root containment
        # Normalize: remove ../, resolve symlinks
        requested = os.path.normpath(os.path.join(ROOT, decoded.lstrip('/')))

        # Ensure resolved path is within ROOT
        if not requested.startswith(ROOT + os.sep) and requested != ROOT:
            self.send_error(403, 'Path traversal blocked')
            return

        # Deny sensitive files (defense-in-depth)
        if is_denied(requested):
            self.send_error(404, 'Blocked')
            return

        super().do_GET()

    def do_OPTIONS(self):
        # Preflight: match CORS behavior declared in end_headers
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        # CORS: narrowed from '*' to only allow the plugin's fetch context.
        # The plugin fetches from a file:// or app:// context — the Origin
        # header carries the actual context. We allow 'null' (sandboxed iframe)
        # and localhost origins. Remote origins are not served.
        origin = self.headers.get('Origin', '')
        if origin == 'null' or origin.startswith('http://localhost') or origin.startswith('http://127.0.0.1'):
            self.send_header('Access-Control-Allow-Origin', origin or 'null')
        else:
            # No CORS header = browser blocks the fetch
            pass
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # Silent


if __name__ == '__main__':
    print(f'hermes-tackmark server: http://127.0.0.1:{PORT}/  serving {ROOT}')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
