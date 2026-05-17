# tis1.5 starter kit

Набор файлов для повторного прогона на другом PDF.

## Что внутри
- `docs/ocr-prompt-template.md` — промпты для OCR
- `docs/ocr-result-schema.json` — схема результата OCR
- `scripts/` — скрипты обработки каталога и сборки publish
- `site-template/` — шаблон editor/publish сайта
- `examples/example_chunk.json` — пример OCR chunk JSON

## Как использовать на новом PDF
1. Создать новую рабочую папку рядом с этим набором.
2. Положить туда новый PDF.
3. Сгенерировать page JPG.
4. Делать OCR по страницам в формате из `docs/ocr-prompt-template.md`.
5. Собирать `chunk_*.json` по схеме `docs/ocr-result-schema.json`.
6. Из OCR-результатов собрать markdown-таблицы и каталог.
7. Использовать `site-template/` + `scripts/` для editor/publish сайта.

## Важно
Эта папка — заготовка для нового цикла, без привязки к старому PDF.
