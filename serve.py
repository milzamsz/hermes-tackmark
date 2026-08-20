#!/usr/bin/env python3
"""TackMark 静态文件服务器——带 CORS，支持插件 fetch 页面内容。
用法: python serve.py <目录> [端口，默认8080]
"""
import http.server
import sys
import os
import urllib.parse

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else '.'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        # 拒绝点文件（.git/.env 等）：防止本地敏感文件泄露
        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404, 'Blocked')
            return
        # 禁用目录列表：防止源码/文件枚举
        if path.endswith('/'):
            self.send_error(403, 'Directory listing disabled')
            return
        super().do_GET()

    def do_OPTIONS(self):
        # 预检请求：与 end_headers 声明的 CORS 行为一致（之前声明了但未实现 → 501）
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        # CORS：允许插件从 file:// 上下文 fetch 页面内容做 srcdoc 注入
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        # 禁用缓存：插件 fetch 需实时内容，否则改文件后刷新看不到
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # 静默


if __name__ == '__main__':
    print(f'TackMark server: http://127.0.0.1:{PORT}/  serving {ROOT}')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
