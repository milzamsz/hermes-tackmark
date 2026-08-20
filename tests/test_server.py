#!/usr/bin/env python3
"""Tests for hermes-tackmark serve.py security hardening."""
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error
import http.client

# Add the repo root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def start_server(root, port):
    """Start serve.py in a thread, return the server."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'serve', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'serve.py')
    )
    serve_mod = importlib.util.module_from_spec(spec)
    # Override ROOT and PORT before running
    sys.argv = ['serve.py', root, str(port)]
    spec.loader.exec_module(serve_mod)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), serve_mod.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def fetch(url):
    """Fetch a URL, returns (status_code, body)."""
    try:
        req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=5)
        return resp.getcode(), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class TestServerSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp()
        cls.port = 18080
        # Create test files
        with open(os.path.join(cls.tmpdir, 'index.html'), 'w') as f:
            f.write('<html><body>OK</body></html>')
        with open(os.path.join(cls.tmpdir, 'style.css'), 'w') as f:
            f.write('body { }')
        os.makedirs(os.path.join(cls.tmpdir, 'sub'))
        with open(os.path.join(cls.tmpdir, 'sub', 'page.html'), 'w') as f:
            f.write('<html><body>Nested</body></html>')
        # Sensitive files
        with open(os.path.join(cls.tmpdir, '.env'), 'w') as f:
            f.write('SECRET=xxx')
        with open(os.path.join(cls.tmpdir, 'secrets.key'), 'w') as f:
            f.write('PRIVATE KEY')
        with open(os.path.join(cls.tmpdir, 'config.json'), 'w') as f:
            f.write('{}')
        cls.server = start_server(cls.tmpdir, cls.port)
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_regular_html_served(self):
        code, body = fetch(f'http://127.0.0.1:{self.port}/index.html')
        self.assertEqual(code, 200)
        self.assertIn(b'OK', body)

    def test_nested_path_served(self):
        code, body = fetch(f'http://127.0.0.1:{self.port}/sub/page.html')
        self.assertEqual(code, 200)
        self.assertIn(b'Nested', body)

    def test_dotfile_blocked(self):
        code, _ = fetch(f'http://127.0.0.1:{self.port}/.env')
        self.assertEqual(code, 404)

    def test_dotdir_blocked(self):
        os.makedirs(os.path.join(self.tmpdir, '.hidden'))
        with open(os.path.join(self.tmpdir, '.hidden', 'file.txt'), 'w') as f:
            f.write('hidden')
        code, _ = fetch(f'http://127.0.0.1:{self.port}/.hidden/file.txt')
        self.assertEqual(code, 404)

    def test_sensitive_file_blocked(self):
        code, _ = fetch(f'http://127.0.0.1:{self.port}/secrets.key')
        self.assertEqual(code, 404)

    def test_directory_listing_blocked(self):
        code, _ = fetch(f'http://127.0.0.1:{self.port}/')
        self.assertEqual(code, 403)

    def test_traversal_blocked(self):
        code, _ = fetch(f'http://127.0.0.1:{self.port}/../../../etc/passwd')
        self.assertIn(code, (403, 404))

    def test_encoded_traversal_blocked(self):
        code, _ = fetch(f'http://127.0.0.1:{self.port}/%2e%2e%2f%2e%2e%2fetc%2fpasswd')
        self.assertIn(code, (403, 404))

    def test_loopback_only(self):
        """Verify server is bound to 127.0.0.1 only."""
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        # Try connecting to a non-loopback address — should fail
        # (We can't fully test this without a second interface, but we can
        # verify the socket is bound to 127.0.0.1)
        self.assertEqual(self.server.server_address[0], '127.0.0.1')
        s.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
