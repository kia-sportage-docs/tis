#!/usr/bin/env python3
import json
import shutil
from pathlib import Path

from catalog_utils import load_json, merge_catalog_with_overrides

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'data'
CATALOG_PATH = DATA_DIR / 'catalog.json'
OVERRIDES_PATH = DATA_DIR / 'overrides.json'
PUBLISH_DIR = ROOT.parent / 'publish'
PUBLISH_DATA_DIR = PUBLISH_DIR / 'data'
ASSETS_DIR = ROOT / 'assets'


def write_json(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write('\n')


def reset_dir(path: Path):
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def main():
    catalog = load_json(CATALOG_PATH, {'documents': [], 'document_count': 0})
    overrides = load_json(OVERRIDES_PATH, {'documents': {}})
    merged = merge_catalog_with_overrides(catalog, overrides)

    reset_dir(PUBLISH_DIR)
    shutil.copy2(ROOT / 'publish_index.html', PUBLISH_DIR / 'index.html')
    shutil.copy2(ROOT / 'app.js', PUBLISH_DIR / 'app.js')
    shutil.copy2(ROOT / 'styles.css', PUBLISH_DIR / 'styles.css')
    shutil.copy2(ROOT / 'serve_publish.sh', PUBLISH_DIR / 'serve.sh')
    shutil.copytree(ASSETS_DIR, PUBLISH_DIR / 'assets')
    write_json(PUBLISH_DATA_DIR / 'catalog.json', merged)

    print(f'Publish build created at: {PUBLISH_DIR}')
    print('Publish this directory as a static site.')


if __name__ == '__main__':
    main()
