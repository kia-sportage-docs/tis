#!/usr/bin/env python3
import json
import re
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rapidfuzz import fuzz
from rapidocr_onnxruntime import RapidOCR

SITE_DIR = Path(__file__).resolve().parent
SOURCE_BASE = Path((__import__('os').environ.get('TIS_SOURCE_BASE') or (SITE_DIR.parent / 'variants' / '2_0_turbo' / 'raw'))).resolve()
TABLES_DIR = SOURCE_BASE / 'tables_md'
PAGES_DIR = SOURCE_BASE / 'pages'
DATA_DIR = SITE_DIR / 'data'
ASSETS_PAGES_DIR = SITE_DIR / 'assets' / 'pages'

META_SCHEME_RE = re.compile(r'^-\s*scheme_page:\s*(\d+)\s*$', re.M)
META_TABLE_RE = re.compile(r'^-\s*table_pages:\s*(.+?)\s*$', re.M)
ALNUM_RE = re.compile(r'[^A-Z0-9]+')
FOOTER_RE = re.compile(r'^\s*\d+\s*/\s*\d+\s*$')
DIRECTION_RE = re.compile(r'^(?:F|R|L|H|U|D){1,3}\.?$|^(?:FR|RR|FL|RL|LH|RH|UP|DN|REAR|FRONT)\.?$', re.I)
CROP_PAD = 18
FOOTER_ERASE_PAD = 24
MIN_COMPONENT_AREA = 80
MIN_COMPONENT_SIZE = 24


def normalize_code(value: str) -> str:
    return ALNUM_RE.sub('', (value or '').upper())


def is_headerish(cells):
    normalized = [re.sub(r'\s+', ' ', c.strip().lower()) for c in cells]
    header_tokens = {'код', 'код 1', 'код 2', 'номер детали', 'наименование', 'кол-во', 'кол.', 'поз.', 'поз'}
    hits = sum(1 for cell in normalized if cell in header_tokens)
    return hits >= 2


def parse_markdown_tables(text: str):
    tables = []
    current = []
    for line in text.splitlines():
        if line.strip().startswith('|') and line.strip().endswith('|'):
            current.append(line.rstrip())
        else:
            if current:
                tables.append(current)
                current = []
    if current:
        tables.append(current)
    return tables


def parse_table_block(lines):
    rows = []
    for line in lines:
        parts = [cell.strip() for cell in line.strip().strip('|').split('|')]
        if not parts:
            continue
        if all(re.fullmatch(r'[-: ]*', p) for p in parts):
            continue
        if is_headerish(parts):
            continue
        while parts and not parts[-1]:
            parts.pop()
        if len(parts) < 2:
            continue
        code = parts[0].strip()
        if not code or normalize_code(code) == '':
            continue
        rows.append(parts)
    return rows


def parse_document(md_path: Path):
    text = md_path.read_text(encoding='utf-8', errors='ignore')
    scheme_match = META_SCHEME_RE.search(text)
    table_match = META_TABLE_RE.search(text)
    if not scheme_match:
        return None
    scheme_page = int(scheme_match.group(1))
    table_pages = []
    if table_match:
        table_pages = [int(x.strip()) for x in table_match.group(1).split(',') if x.strip().isdigit()]

    parsed_rows = []
    for table in parse_markdown_tables(text):
        parsed_rows.extend(parse_table_block(table))

    grouped = defaultdict(list)
    for idx, row in enumerate(parsed_rows):
        code = row[0].strip()
        normalized = normalize_code(code)
        grouped[normalized].append({
            'id': f'{md_path.stem}-{idx + 1}',
            'code': code,
            'normalized_code': normalized,
            'part_number': row[1].strip() if len(row) > 1 else '',
            'name': row[2].strip() if len(row) > 2 else '',
            'qty': row[3].strip() if len(row) > 3 else '',
            'raw': row,
        })

    return {
        'id': md_path.stem,
        'title': md_path.stem.replace('_', ' '),
        'scheme_page': scheme_page,
        'table_pages': table_pages,
        'scheme_image': f'assets/pages/page_{scheme_page:03d}.jpg',
        'rows': parsed_rows,
        'parts_by_code': grouped,
    }


def box_to_rect(box):
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    return {
        'x': round(float(left), 1),
        'y': round(float(top), 1),
        'w': round(float(right - left), 1),
        'h': round(float(bottom - top), 1),
    }


def clamp_box(box, width, height):
    left, top, right, bottom = box
    left = max(0, min(int(left), width - 1))
    top = max(0, min(int(top), height - 1))
    right = max(left + 1, min(int(right), width))
    bottom = max(top + 1, min(int(bottom), height))
    return left, top, right, bottom


def union_boxes(boxes, width, height, pad=CROP_PAD):
    if not boxes:
        return 0, 0, width, height
    left = min(box[0] for box in boxes) - pad
    top = min(box[1] for box in boxes) - pad
    right = max(box[2] for box in boxes) + pad
    bottom = max(box[3] for box in boxes) + pad
    return clamp_box((left, top, right, bottom), width, height)


def build_mask_from_image(img):
    gray = np.array(img.convert('L'))
    mask = ((255 - gray) > 10).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)


def find_footer_boxes(ocr_results):
    boxes = []
    for box, text, _score in ocr_results or []:
        if FOOTER_RE.match((text or '').strip()):
            rect = box_to_rect(box)
            boxes.append((
                int(rect['x']) - FOOTER_ERASE_PAD,
                int(rect['y']) - FOOTER_ERASE_PAD,
                int(rect['x'] + rect['w']) + FOOTER_ERASE_PAD,
                int(rect['y'] + rect['h']) + FOOTER_ERASE_PAD,
            ))
    return boxes


def find_protected_boxes(ocr_results):
    boxes = []
    for box, text, score in ocr_results or []:
        if score < 0.75:
            continue
        clean = (text or '').strip().upper()
        if DIRECTION_RE.match(clean):
            rect = box_to_rect(box)
            boxes.append((
                int(rect['x']) - 22,
                int(rect['y']) - 18,
                int(rect['x'] + rect['w']) + 42,
                int(rect['y'] + rect['h']) + 26,
            ))
    return boxes


def detect_crop_box(img, ocr_results):
    width, height = img.size
    mask = build_mask_from_image(img)

    for box in find_footer_boxes(ocr_results):
        left, top, right, bottom = clamp_box(box, width, height)
        mask[top:bottom, left:right] = 0

    protected_boxes = find_protected_boxes(ocr_results)
    for box in protected_boxes:
        left, top, right, bottom = clamp_box(box, width, height)
        mask[top:bottom, left:right] = 255

    num_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(mask, 8)
    content_boxes = []
    for idx in range(1, num_labels):
        x, y, w, h, area = stats[idx]
        if area >= MIN_COMPONENT_AREA or (w >= MIN_COMPONENT_SIZE and h >= MIN_COMPONENT_SIZE):
            content_boxes.append((int(x), int(y), int(x + w), int(y + h)))

    content_boxes.extend(clamp_box(box, width, height) for box in protected_boxes)
    return union_boxes(content_boxes, width, height)


def shift_rect(rect, crop_box):
    left, top, _, _ = crop_box
    return {
        'x': round(rect['x'] - left, 1),
        'y': round(rect['y'] - top, 1),
        'w': rect['w'],
        'h': rect['h'],
    }


def find_matches(ocr_results, parts_by_code, crop_box):
    exact_codes = set(parts_by_code.keys())
    markers = []
    seen = set()
    for item in ocr_results or []:
        box, text, score = item
        norm = normalize_code(text)
        if not norm:
            continue
        matched = None
        method = None
        if norm in exact_codes:
            matched = norm
            method = 'exact'
        else:
            best_code = None
            best_score = 0
            for code in exact_codes:
                if abs(len(code) - len(norm)) > 2:
                    continue
                score_ratio = fuzz.ratio(norm, code)
                if score_ratio > best_score:
                    best_score = score_ratio
                    best_code = code
            if best_code and best_score >= 86:
                matched = best_code
                method = f'fuzzy:{best_score}'
        if matched and matched not in seen:
            seen.add(matched)
            markers.append({
                'code': matched,
                'label': parts_by_code[matched][0]['code'],
                'text': text,
                'score': float(score),
                'match_method': method,
                'rect': shift_rect(box_to_rect(box), crop_box),
                'rows': parts_by_code[matched],
            })
    markers.sort(key=lambda m: (m['rect']['y'], m['rect']['x']))
    return markers


def build_scaled_image(src: Path, max_width: int = 1600):
    img = Image.open(src).convert('RGB')
    width, height = img.size
    scale = 1.0 if width <= max_width else max_width / width
    if scale < 1.0:
        img = img.resize((int(width * scale), int(height * scale)), Image.Resampling.LANCZOS)
    return img, scale, (width, height)


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_PAGES_DIR.mkdir(parents=True, exist_ok=True)

    engine = RapidOCR()
    docs = []
    scheme_pages = set()
    md_files = sorted(TABLES_DIR.glob('*.md'))
    for md_path in md_files:
        doc = parse_document(md_path)
        if not doc:
            continue
        scheme_pages.add(doc['scheme_page'])
        docs.append(doc)

    page_meta_by_num = {}
    for page_num in sorted(scheme_pages):
        src = PAGES_DIR / f'page_{page_num:03d}.jpg'
        dst = ASSETS_PAGES_DIR / src.name
        if not src.exists():
            continue

        img, scale, original_size = build_scaled_image(src)
        tmp_full = ASSETS_PAGES_DIR / f'.tmp_full_{src.name}'
        img.save(tmp_full, quality=88)
        ocr_results, _ = engine(str(tmp_full))
        crop_box = detect_crop_box(img, ocr_results)
        cropped = img.crop(crop_box)
        cropped.save(dst, quality=88)
        tmp_full.unlink(missing_ok=True)

        page_meta_by_num[page_num] = {
            'scale': scale,
            'original_size': original_size,
            'full_render_size': img.size,
            'render_size': cropped.size,
            'crop_box': {
                'left': crop_box[0],
                'top': crop_box[1],
                'right': crop_box[2],
                'bottom': crop_box[3],
            },
            'ocr_results': ocr_results,
        }

    result_docs = []
    for i, doc in enumerate(docs, start=1):
        page_meta = page_meta_by_num[doc['scheme_page']]
        markers = find_matches(page_meta['ocr_results'], doc['parts_by_code'], (
            page_meta['crop_box']['left'],
            page_meta['crop_box']['top'],
            page_meta['crop_box']['right'],
            page_meta['crop_box']['bottom'],
        ))
        matched_codes = {m['code'] for m in markers}
        unmatched_codes = []
        for code, rows in sorted(doc['parts_by_code'].items()):
            if code not in matched_codes:
                unmatched_codes.append({
                    'code': code,
                    'label': rows[0]['code'],
                    'rows': rows,
                })
        result_docs.append({
            'id': doc['id'],
            'title': doc['title'],
            'scheme_page': doc['scheme_page'],
            'table_pages': doc['table_pages'],
            'scheme_image': doc['scheme_image'],
            'image_size': {'width': page_meta['render_size'][0], 'height': page_meta['render_size'][1]},
            'image_crop': page_meta['crop_box'],
            'markers': markers,
            'unmatched_codes': unmatched_codes,
            'stats': {
                'total_codes': len(doc['parts_by_code']),
                'matched_codes': len(markers),
                'unmatched_codes': len(unmatched_codes),
            },
        })
        print(
            f'[{i}/{len(docs)}] {doc["id"]}: matched {len(markers)}/{len(doc["parts_by_code"])} '
            f'crop={page_meta["crop_box"]} size={page_meta["render_size"]}'
        )

    catalog = {
        'source_base': str(SOURCE_BASE.relative_to(SITE_DIR.parent.parent)) if SOURCE_BASE.is_relative_to(SITE_DIR.parent.parent) else str(SOURCE_BASE),
        'document_count': len(result_docs),
        'documents': result_docs,
    }
    (DATA_DIR / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {DATA_DIR / "catalog.json"}')


if __name__ == '__main__':
    main()
