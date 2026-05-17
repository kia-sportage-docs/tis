# TIS Parts Catalog

Локальный проект каталога запчастей на основе OCR TIS/PDF.

## Структура

- `site/` — локальная editor-версия сайта
- `publish/` — read-only версия для публикации
- `tables_md/` — итоговые markdown-таблицы
- `chunk_*.json` — промежуточные OCR-чанки
- `docs/` — инструкции и сопроводительная документация

## Основной workflow

### 1. Редактирование

Запуск editor-версии:

```bash
cd site
./serve.sh
```

Открыть:

- `http://127.0.0.1:8000`

В editor-версии можно:
- исправлять названия схем
- добавлять недостающие метки
- двигать и удалять метки
- сохранять правки в `site/data/overrides.json`

### 2. Сборка publish-версии

После правок:

```bash
cd site
python3 build_publish.py
```

Это пересоберёт папку:

- `publish/`

### 3. Проверка publish-версии

```bash
cd site
./serve_publish.sh
```

Открыть:

- `http://127.0.0.1:8001`

### 4. Публикация на GitHub Pages

Подробная инструкция:

- `docs/github-pages-publish.md`

Коротко:

```bash
cd site
python3 build_publish.py
cd ..
git add publish site/data/overrides.json
git commit -m "Publish update"
git push
```

## Что публиковать

Для публичного сайта используется только:

- `publish/`

Это read-only версия без редактора.

## Примечания

- Editor и publish разделены специально.
- Правки делаются в `site/`, публикация идёт из `publish/`.
- Перед существенными изменениями желательно делать backup.
