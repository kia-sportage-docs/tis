#!/usr/bin/env python3
import copy
import json
from pathlib import Path


def load_json(path: Path, default):
    if not path.exists():
        return copy.deepcopy(default)
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def merge_catalog_with_overrides(catalog: dict, overrides: dict) -> dict:
    merged = copy.deepcopy(catalog)
    docs_overrides = overrides.get('documents', {}) if isinstance(overrides, dict) else {}
    for doc in merged.get('documents', []):
        doc_override = docs_overrides.get(doc.get('id'))
        if not isinstance(doc_override, dict):
            continue
        if 'title' in doc_override:
            doc['title'] = doc_override['title']
        if 'markers' in doc_override and isinstance(doc_override['markers'], list):
            doc['markers'] = doc_override['markers']

    categories = overrides.get('categories') if isinstance(overrides, dict) else None
    if isinstance(categories, list):
        merged['categories'] = categories
    elif 'categories' not in merged:
        merged['categories'] = []

    return merged
