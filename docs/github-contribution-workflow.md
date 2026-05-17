# Как внести правки через GitHub

Короткая инструкция для внешних участников, которые хотят поправить каталоги KIA Sportage NQ5c и прислать изменения через pull request.

## 1. Fork или clone

Если у вас нет прав на запись в основной репозиторий, сделайте **Fork** на GitHub и работайте в своей копии:

```bash
git clone https://github.com/<your-user>/<repo>.git
cd <repo>
git remote add upstream https://github.com/<owner>/<repo>.git
```

Если права на запись есть, можно просто клонировать основной репозиторий:

```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>
```

## 2. Рабочая ветка

Перед правками создайте отдельную ветку от актуального `main` или `master`:

```bash
git fetch --all
git checkout main      # или master, если основная ветка называется master
git pull
git checkout -b fix/catalog-titles
```

Название ветки лучше делать коротким и понятным: `fix/part-markers`, `data/1-5-turbo-overrides`, `docs/contribution-workflow`.

## 3. Локальный запуск editor

Editor запускается из папки `site` и использует локальный backend `site/server.py`:

```bash
cd site
./serve.sh
```

Откройте в браузере:

```text
http://127.0.0.1:8000
```

Если `serve.sh` недоступен для запуска, используйте:

```bash
python3 server.py
```

## 4. Переключение комплектаций и правки

В editor есть selector комплектации. Сейчас основные variant id:

- `2_0_turbo` — KIA Sportage NQ5c 2.0 Turbo
- `1_5_turbo` — KIA Sportage NQ5c 1.5 Turbo

Данные комплектаций описаны в:

- `site/data/variants.json` — список комплектаций, title, пути к каталогам, overrides и assets;
- `site/data/catalogs/*.catalog.json` — базовые сгенерированные каталоги;
- `site/data/overrides/*.overrides.json` — ручные правки, которые накладываются поверх базового каталога.

Обычный сценарий:

1. выберите нужную комплектацию в editor;
2. откройте нужную схему;
3. включите режим редактирования, если он нужен;
4. поправьте `title`, markers/позиции или другие доступные поля;
5. сохраните overrides.

Проверяйте, что сохранение попало в файл нужной комплектации, например:

- `site/data/overrides/2_0_turbo.overrides.json`
- `site/data/overrides/1_5_turbo.overrides.json`

Если нужно поменять название комплектации или путь к данным, правьте `site/data/variants.json`. Если нужно исправить именно ручную правку конкретной схемы/детали — обычно правится соответствующий файл в `site/data/overrides/`.

## 5. Что обычно попадает в commit

Чаще всего в pull request попадают:

- `site/data/overrides/<variant>.overrides.json` — исправления title, markers, подписей, ручных уточнений;
- `site/data/variants.json` — если менялись названия комплектаций или metadata;
- `site/data/catalogs/<variant>.catalog.json` — если вы осознанно пересобирали/исправляли базовый каталог;
- `site/js/editor/*`, `site/js/shared/*`, `site/server.py` — только если меняли поведение editor/backend;
- `site/build_publish.py`, `site/js/publish/*`, `site/publish_index.html` — только если меняли publish-сборку или read-only viewer;
- `docs/*` — если меняли документацию.

Перед commit посмотрите diff:

```bash
git status
git diff
```

## 6. Локальная пересборка publish, если нужно

Обычно GitHub Actions сам пересобирает publish при merge/push в основную ветку. Но для проверки можно собрать локально:

```bash
cd site
python3 build_publish.py
```

Результат появится в `publish/` в корне репозитория. Локально проверить read-only publish можно так:

```bash
cd site
bash ./serve_publish.sh
```

Откройте:

```text
http://127.0.0.1:8001
```

Workflow `.github/workflows/publish-pages.yml` при push в `main`/`master` запускает `python site/build_publish.py` и публикует содержимое `publish/` в ветку `publish-app`.

## 7. Commit, push и pull request

```bash
git status
git add site/data/overrides/2_0_turbo.overrides.json   # пример; добавляйте только нужные файлы
git commit -m "Fix 2.0 Turbo catalog markers"
git push -u origin fix/catalog-titles
```

После push откройте pull request на GitHub в основную ветку проекта (`main` или `master`). В описании PR укажите:

- какую комплектацию правили (`2_0_turbo` или `1_5_turbo`);
- какие схемы/детали затронуты;
- проверяли ли локальный editor;
- пересобирали ли publish локально, если это важно.

## 8. Что будет ревьюиться перед merge

Перед merge будут смотреть:

- что правки относятся к правильной комплектации;
- что `overrides` не ломают структуру JSON и корректно применяются в editor;
- что title/markers/позиции соответствуют исходной схеме;
- что selector комплектаций продолжает работать;
- что изменения не добавляют editor/API в publish-ветку;
- что `site/build_publish.py` по-прежнему собирает статический `publish/`;
- что workflow публикации в `publish-app` не сломан;
- что в PR нет случайных временных, логов, backup-файлов и больших исходников без необходимости.

## 9. Что не нужно коммитить

Не добавляйте в commit:

- `site/__pycache__/`, `.pyc`, `.venv/`;
- `site/server.log`, `site/generation.log`, временные логи;
- backup-файлы вроде `*.bak`, `*.bak-*`, `*.bak.YYYY...`;
- локальные временные папки `tmp/`;
- случайно пересобранный `publish/`, если PR только про editor/overrides и maintainers не просили включать publish diff;
- ветку или содержимое `publish-app` вручную — её обновляет GitHub Actions;
- raw PDF/OCR/промежуточные исходники из `variants/*/raw/`, если задача не была именно в обновлении raw-данных.

Главное правило: commit должен содержать только осознанные изменения, которые нужны для конкретной правки.
