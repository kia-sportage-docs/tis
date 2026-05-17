#!/usr/bin/env python3
import json
import re
from pathlib import Path
from typing import List, Dict, Any

BASE = Path('/home/hellsman/.openclaw/workspace/tmp/tis1.5')
OUT_DIR = BASE / 'tables_md'

SAFE_RE = re.compile(r'[^A-Za-z0-9._-]+')


def slugify(name: str) -> str:
    name = (name or '').strip()
    if not name:
        return 'untitled'
    name = name.replace(' ', '_')
    name = SAFE_RE.sub('_', name)
    name = re.sub(r'_+', '_', name).strip('._')
    return name or 'untitled'


def load_pages() -> List[Dict[str, Any]]:
    pages = []
    for path in sorted(BASE.glob('chunk_*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        pages.extend(data.get('pages', []))
    pages.sort(key=lambda p: p.get('page', 0))
    return pages


def normalize_table(md: str) -> str:
    md = (md or '').strip()
    if not md:
        return ''
    lines = [line.rstrip() for line in md.splitlines() if line.strip()]
    return '\n'.join(lines)


def build_documents(pages: List[Dict[str, Any]]):
    docs = []
    pending_tables: List[Dict[str, Any]] = []
    unattached_counter = 0

    i = 0
    while i < len(pages):
        page = pages[i]
        ptype = page.get('type')
        if ptype == 'table':
            pending_tables.append(page)
        elif ptype == 'scheme':
            name = page.get('name') or f"scheme-{page.get('page')}"
            docs.append({
                'title': name,
                'scheme_page': page.get('page'),
                'table_pages': [p.get('page') for p in pending_tables],
                'tables': pending_tables[:],
            })
            pending_tables = []
        i += 1

    if pending_tables:
        for table in pending_tables:
            unattached_counter += 1
            docs.append({
                'title': f'unattached_table_{table.get("page")}',
                'scheme_page': None,
                'table_pages': [table.get('page')],
                'tables': [table],
            })
    return docs


def render_doc(doc: Dict[str, Any]) -> str:
    lines = []
    lines.append(f"# {doc['title']}")
    lines.append('')
    if doc['scheme_page'] is not None:
        lines.append(f"- scheme_page: {doc['scheme_page']}")
    else:
        lines.append(f"- scheme_page: ")
    lines.append('')
    table_pages = ', '.join(str(x) for x in doc['table_pages'])
    lines.append(f"- table_pages: {table_pages}")
    lines.append('')
    for table in doc['tables']:
        lines.append('')
        lines.append(f"## Table page {table.get('page')}")
        lines.append('')
        body = normalize_table(table.get('ocr_md', ''))
        if body:
            lines.append(body)
        else:
            lines.append('')
    lines.append('')
    return '\n'.join(lines)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pages = load_pages()
    docs = build_documents(pages)

    used = {}
    written = []
    for doc in docs:
        base_name = slugify(doc['title'])
        final_name = base_name
        n = 2
        while final_name in used:
            final_name = f'{base_name}_{n}'
            n += 1
        used[final_name] = True
        path = OUT_DIR / f'{final_name}.md'
        path.write_text(render_doc(doc), encoding='utf-8')
        written.append(path.name)

    print(f'WROTE {len(written)} files to {OUT_DIR}')
    for name in written[:20]:
        print(name)
    if len(written) > 20:
        print(f'... and {len(written)-20} more')


if __name__ == '__main__':
    main()
