# TIS parts catalog site

Локальный variant-aware editor/viewer и publish-сборка для каталога KIA Sportage NQ5c.

## Что внутри

- `server.py` — локальный HTTP/API сервер для editor режима
- `build_publish.py` — сборка статической read-only publish-версии
- `generate_catalog.py` — генерация и пересборка каталожных данных
- `data/variants.json` — реестр комплектаций
- `data/catalogs/*.catalog.json` — базовые каталоги по variant id
- `data/overrides/*.overrides.json` — ручные правки по variant id
- `assets/variants/<variant>/pages/` — JPG схем по комплектациям
- `js/shared/catalog-app.js` — общая логика viewer/editor/publish
- `js/editor/app.js` — editor bootstrap
- `js/publish/app.js` — publish bootstrap
- `index.html` — локальный editor/viewer
- `publish_index.html` — read-only publish entry
- `styles.css` — общие стили
- `serve.sh` — запуск локального backend/editor
- `serve_publish.sh` — локальная раздача собранного publish

## Как это работает

### Editor
- UI загружает список комплектаций через `GET /api/variants`
- затем загружает:
  - `GET /api/catalog?variant=<id>`
  - `GET /api/overrides?variant=<id>`
- сервер накладывает ручные правки поверх базового каталога
- сохранение идёт через:
  - `POST /api/overrides?variant=<id>`

### Publish
- `build_publish.py` собирает read-only static output в `../publish`
- publish использует только viewer-код и обработанные merged-данные
- publish не содержит editor API и не должен сохранять overrides

## Запуск editor
```bash
cd site
./serve.sh
```

Открыть в браузере:
- `http://127.0.0.1:8000`

## Что проверить в editor
- виден selector комплектации
- переключение между `2_0_turbo` и `1_5_turbo` работает
- список схем меняется по варианту
- схема открывается
- детали отображаются
- `Edit mode` работает
- `Сохранить overrides` пишет в правильный файл `data/overrides/<variant>.overrides.json`

## Локальная сборка publish
```bash
cd site
python3 build_publish.py
```

Результат:
- `../publish/index.html`
- `../publish/js/shared/*`
- `../publish/js/publish/*`
- `../publish/data/variants.json`
- `../publish/data/catalogs/*`
- `../publish/assets/variants/*`

## Локальная проверка publish
```bash
cd site
bash ./serve_publish.sh
```

Открыть:
- `http://127.0.0.1:8001`

## Что не должно попадать в publish
- `js/editor/*`
- `server.py`
- `data/overrides/*` как редактируемый источник API
- raw OCR / raw PDF / служебные локальные файлы

## GitHub Pages

Рекомендуемая схема:
- основная разработка идёт в `main` / `master`
- GitHub Action запускает `python site/build_publish.py`
- содержимое `publish/` отправляется в ветку `publish-app`
- GitHub Pages публикуется из ветки `publish-app`

## Ограничения текущего этапа
- старый `site/app.js` пока может лежать в дереве как legacy-хвост, даже если уже не используется
- полноценный browser smoke-test с кликами по UI нужно делать в окружении с доступным Chromium
- документацию по workflow участников можно дальше расширять отдельно в `docs/`
