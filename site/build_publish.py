#!/usr/bin/env python3
import json
import shutil
from pathlib import Path

from catalog_utils import load_json, merge_catalog_with_overrides

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'data'
VARIANTS_PATH = DATA_DIR / 'variants.json'
CATALOGS_DIR = DATA_DIR / 'catalogs'
OVERRIDES_DIR = DATA_DIR / 'overrides'
PUBLISH_DIR = ROOT.parent / 'publish'
ASSETS_DIR = ROOT / 'assets'
JS_DIR = ROOT / 'js'


def write_json(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write('\n')


def reset_dir(path: Path):
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_publish_js():
    shared_src = JS_DIR / 'shared'
    publish_src = JS_DIR / 'publish'
    shared_dst = PUBLISH_DIR / 'js' / 'shared'
    publish_dst = PUBLISH_DIR / 'js' / 'publish'

    if shared_src.exists():
        shutil.copytree(shared_src, shared_dst)
    if publish_src.exists():
        shutil.copytree(publish_src, publish_dst)


def main():
    variants_payload = load_json(VARIANTS_PATH, {'variants': []})
    publish_variants = []

    reset_dir(PUBLISH_DIR)
    shutil.copy2(ROOT / 'publish_index.html', PUBLISH_DIR / 'index.html')
    shutil.copy2(ROOT / 'styles.css', PUBLISH_DIR / 'styles.css')
    copy_publish_js()
    shutil.copytree(ASSETS_DIR, PUBLISH_DIR / 'assets')

    for item in variants_payload.get('variants', []):
        variant_id = item.get('id')
        if not variant_id:
            continue
        catalog = load_json(CATALOGS_DIR / f'{variant_id}.catalog.json', {'documents': [], 'document_count': 0})
        overrides = load_json(OVERRIDES_DIR / f'{variant_id}.overrides.json', {'documents': {}})
        merged = merge_catalog_with_overrides(catalog, overrides)
        publish_catalog_path = Path('data/catalogs') / f'{variant_id}.catalog.json'
        write_json(PUBLISH_DIR / publish_catalog_path, merged)
        publish_variants.append({
            'id': variant_id,
            'title': item.get('title', variant_id),
            'engine': item.get('engine', ''),
            'catalogPath': str(publish_catalog_path).replace('\\', '/'),
            'assetsBase': item.get('assetsBase', ''),
        })

    write_json(PUBLISH_DIR / 'data' / 'variants.json', {'variants': publish_variants})

    print(f'Publish build created at: {PUBLISH_DIR}')
    print('Publish this directory as a static site.')


if __name__ == '__main__':
    main()
