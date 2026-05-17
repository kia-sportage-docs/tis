#!/usr/bin/env python3
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from catalog_utils import load_json, merge_catalog_with_overrides

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'data'
CATALOG_PATH = DATA_DIR / 'catalog.json'
OVERRIDES_PATH = DATA_DIR / 'overrides.json'
HOST = '127.0.0.1'
PORT = 8000


class CatalogHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == '/api/catalog':
            catalog = load_json(CATALOG_PATH, {'documents': [], 'document_count': 0})
            overrides = load_json(OVERRIDES_PATH, {'documents': {}})
            merged = merge_catalog_with_overrides(catalog, overrides)
            return self.send_json(merged)
        if self.path == '/api/overrides':
            return self.send_json(load_json(OVERRIDES_PATH, {'documents': {}}))
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/overrides':
            self.send_error(HTTPStatus.NOT_FOUND, 'Unknown API endpoint')
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, 'Invalid Content-Length')
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode('utf-8') or '{}')
        except json.JSONDecodeError as exc:
            self.send_error(HTTPStatus.BAD_REQUEST, f'Invalid JSON: {exc}')
            return
        if not isinstance(payload, dict) or not isinstance(payload.get('documents', {}), dict):
            self.send_error(HTTPStatus.BAD_REQUEST, 'Payload must be an object with documents map')
            return
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with OVERRIDES_PATH.open('w', encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        self.send_json({'ok': True, 'path': str(OVERRIDES_PATH.relative_to(ROOT))})

    def send_json(self, payload: dict, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    server = ThreadingHTTPServer((HOST, PORT), CatalogHandler)
    print(f'Serving catalog editor on http://{HOST}:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
    finally:
        server.server_close()
