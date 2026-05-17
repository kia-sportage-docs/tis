from pathlib import Path
import fitz

pdf = Path('/home/hellsman/.openclaw/workspace/tmp/tis1.5/TIS1.5.pdf')
out = Path('/home/hellsman/.openclaw/workspace/tmp/tis1.5/pages_311_320')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
for page_no in range(311, 321):
    page = doc.load_page(page_no - 1)
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pix.save(out / f'page-{page_no}.png')
    print(out / f'page-{page_no}.png')
