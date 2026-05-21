#!/usr/bin/env python3
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from catalog_utils import load_json, merge_catalog_with_overrides

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'data'
VARIANTS_PATH = DATA_DIR / 'variants.json'
CATALOGS_DIR = DATA_DIR / 'catalogs'
OVERRIDES_DIR = DATA_DIR / 'overrides'
HOST = '0.0.0.0'
PORT = 8001


def get_variants_payload():
    return load_json(VARIANTS_PATH, {'variants': []})


def get_variant_meta(variant_id: str):
    payload = get_variants_payload()
    for item in payload.get('variants', []):
        if item.get('id') == variant_id:
            return item
    return None


def catalog_path_for(variant_id: str) -> Path:
    return CATALOGS_DIR / f'{variant_id}.catalog.json'


def overrides_path_for(variant_id: str) -> Path:
    return OVERRIDES_DIR / f'{variant_id}.overrides.json'


class CatalogHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/variants':
            return self.send_json(get_variants_payload())
        if parsed.path == '/api/catalog':
            variant_id = self.require_variant(parsed.query)
            if not variant_id:
                return
            catalog = load_json(catalog_path_for(variant_id), {'documents': [], 'document_count': 0})
            overrides = load_json(overrides_path_for(variant_id), {'documents': {}})
            merged = merge_catalog_with_overrides(catalog, overrides)
            return self.send_json(merged)
        if parsed.path == '/api/overrides':
            variant_id = self.require_variant(parsed.query)
            if not variant_id:
                return
            return self.send_json(load_json(overrides_path_for(variant_id), {'documents': {}}))
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/overrides':
            self.send_error(HTTPStatus.NOT_FOUND, 'Unknown API endpoint')
            return
        variant_id = self.require_variant(parsed.query)
        if not variant_id:
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
        OVERRIDES_DIR.mkdir(parents=True, exist_ok=True)
        path = overrides_path_for(variant_id)
        with path.open('w', encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        self.send_json({'ok': True, 'path': str(path.relative_to(ROOT)), 'variant': variant_id})

    def require_variant(self, query: str):
        params = parse_qs(query)
        variant_id = (params.get('variant') or [''])[0].strip()
        if not variant_id:
            self.send_error(HTTPStatus.BAD_REQUEST, 'Missing variant query param')
            return None
        if not get_variant_meta(variant_id):
            self.send_error(HTTPStatus.NOT_FOUND, f'Unknown variant: {variant_id}')
            return None
        return variant_id

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
