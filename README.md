# TIS Result

Единый репозиторий каталога запчастей KIA Sportage NQ5c для двух комплектаций:
- 2.0 Turbo
- 1.5 Turbo

Репозиторий хранит одновременно:
- сырые исходники по каждой комплектации;
- код генерации и локального editor/viewer;
- обработанные variant-aware данные каталога;
- статическую publish-сборку для GitHub Pages.

## Структура

- `variants/` — исходные данные по комплектациям
  - `2_0_turbo/`
  - `1_5_turbo/`
- `site/` — основной код проекта
  - `server.py` — локальный variant-aware backend для editor
  - `build_publish.py` — сборка read-only publish-версии
  - `generate_catalog.py` — генерация/пересборка каталожных данных
  - `data/variants.json` — список комплектаций и метаданные
  - `data/catalogs/*.catalog.json` — базовые каталоги по комплектациям
  - `data/overrides/*.overrides.json` — ручные правки по комплектациям
  - `assets/variants/<variant>/pages/` — изображения схем
  - `js/shared/` — общий фронтенд-код
  - `js/editor/` — editor bootstrap
  - `js/publish/` — publish bootstrap
- `publish/` — локально генерируемый результат static-сборки для публикации (служебный build-артефакт, в Git обычно не коммитится)
- `.github/workflows/publish-pages.yml` — автопубликация в ветку `publish-app`
- `docs/` — документация проекта для участников и сопровождения

## Модель веток

Рекомендуемая схема публикации:
- `main` / `master` — исходники, raw-данные, код, editor, pipeline
- `publish-app` — только собранная read-only версия сайта

GitHub Actions делает следующее:
1. при push в `main` или `master`;
2. запускает `python site/build_publish.py`;
3. публикует содержимое `publish/` в ветку `publish-app`;
4. GitHub Pages должен быть настроен на публикацию именно из ветки `publish-app`.

## Что попадает в publish

В publish-ветку/папку должны попадать только статические артефакты просмотра:
- `index.html`
- `styles.css`
- `js/shared/*`
- `js/publish/*`
- `data/variants.json`
- `data/catalogs/*`
- `assets/variants/*`

Не должны попадать:
- editor bootstrap `js/editor/*`
- `server.py`
- raw OCR / raw PDF / исходные промежуточные данные
- editor API и локальные служебные файлы

## Лицензирование

- `LICENSE` — код репозитория лицензирован по MIT
- `LICENSE-DATA` — данные и производные каталожные артефакты опубликованы под CC0 1.0

Практический смысл:
- код можно свободно использовать, модифицировать и распространять по MIT;
- данные можно использовать максимально свободно, включая коммерческое использование, по CC0.

Важно: если отдельные исходные материалы происходят из сторонних источников с собственными ограничениями, пользователю нужно самостоятельно учитывать происхождение этих исходников при внешнем переиспользовании.

## Локальная работа

### Запуск editor
```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis-result/site
./serve.sh
```

Открыть:
- `http://127.0.0.1:8000`

### Локальная сборка publish
```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis-result/site
python3 build_publish.py
```

### Локальная проверка publish
```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis-result/site
bash ./serve_publish.sh
```

Открыть:
- `http://127.0.0.1:8001`

## Документация для участников

- `site/README.md` — подробности по editor/publish workflow
- `docs/github-contribution-workflow.md` — как сделать fork/clone, запустить editor, внести правки и открыть pull request
- `docs/` — прочие инструкции по пересборке и публикации
- GitHub Pages settings — источник должен быть ветка `publish-app`
