#!/usr/bin/env python3
"""
Tiny static server that ensures correct MIME types for JavaScript modules and WebAssembly.
Usage:
  python serve.py [PORT]

This is a drop-in replacement for `python -m http.server` that registers `.js` and `.wasm`
MIME types before serving files to avoid the browser refusing to load ES modules.
"""
import http.server
import socketserver
import sys
import mimetypes

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# Ensure common types are present
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('application/wasm', '.wasm')

class FixedMimeHandler(http.server.SimpleHTTPRequestHandler):
  """SimpleHTTPRequestHandler that forces correct MIME types for JS/WASM modules.

  Overriding `guess_type` makes sure we return application/javascript for
  `.js`/`.mjs` files and application/wasm for `.wasm` files regardless of
  the underlying platform's mime database.
  """

  def guess_type(self, path):
    import posixpath
    base, ext = posixpath.splitext(path)
    ext = ext.lower()
    if ext in ('.js', '.mjs'):
      return 'application/javascript'
    if ext == '.wasm':
      return 'application/wasm'
    t = mimetypes.guess_type(path)[0]
    return t or 'application/octet-stream'


Handler = FixedMimeHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
  print(f"Serving HTTP on 0.0.0.0 port {PORT} (http://localhost:{PORT}/) ...")
  try:
    httpd.serve_forever()
  except KeyboardInterrupt:
    print('\nShutting down')
    httpd.server_close()
