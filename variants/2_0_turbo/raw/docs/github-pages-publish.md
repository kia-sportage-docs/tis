# Как разместить проект в GitHub и публиковать `publish/` через GitHub Pages

## Что есть сейчас

В проекте используются две разные версии:

- `site/` — локальная редакторская версия
- `publish/` — read-only версия для публикации

Рабочий цикл такой:

1. Редактировать схемы и данные в `site/`
2. Сохранять правки в `site/data/overrides.json`
3. Пересобирать publish-версию
4. Публиковать содержимое `publish/` через GitHub Pages

---

## 1. Подготовить publish-версию локально

Из каталога проекта:

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis/site
python3 build_publish.py
```

После этого будет готова папка:

```bash
/home/hellsman/.openclaw/workspace/tmp/tis/publish
```

Проверь локально:

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis/site
./serve_publish.sh
```

Открыть:

- `http://127.0.0.1:8001`

---

## 2. Вариант структуры репозитория на GitHub

Рекомендуемый вариант: хранить весь проект в репозитории, а GitHub Pages публиковать только из папки `publish/`.

Пример структуры:

```text
repo-root/
  site/
  publish/
  chunk_*.json
  tables_md/
  docs/
```

Если не хочешь выкладывать лишнее, можно сделать отдельный репозиторий только под публикацию содержимого `publish/`.

---

## 3. Создать git-репозиторий локально

Если репозиторий ещё не создан:

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis
git init
git branch -M main
```

Добавить `.gitignore`:

```bash
cat > .gitignore <<'EOF2'
site/.venv/
site/__pycache__/
site/server.log
site/generation.log
*.pyc
EOF2
```

Добавить файлы и сделать первый коммит:

```bash
git add .
git commit -m "Initial TIS catalog editor and publish site"
```

---

## 4. Создать репозиторий на GitHub

На GitHub:

1. Создать новый repository
2. Скопировать URL репозитория

Подключить remote локально:

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
```

Если используешь SSH:

```bash
git remote add origin git@github.com:<USERNAME>/<REPO>.git
git push -u origin main
```

---

## 5. Настроить GitHub Pages

### Вариант A — публиковать из ветки `main` и папки `/publish`

На GitHub:

1. Открыть `Settings`
2. Открыть `Pages`
3. В разделе `Build and deployment` выбрать:
   - `Source` → `Deploy from a branch`
4. Выбрать:
   - Branch: `main`
   - Folder: `/publish`
5. Нажать `Save`

После этого GitHub опубликует сайт из папки `publish/`.

Адрес будет примерно такой:

```text
https://<USERNAME>.github.io/<REPO>/
```

---

## 6. Как публиковать обновления после правок

Каждый раз после изменений в редакторе:

### Шаг 1 — сохранить правки в редакторе

В UI нажать:

- `Сохранить overrides`

### Шаг 2 — пересобрать publish

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis/site
python3 build_publish.py
```

### Шаг 3 — закоммитить и отправить изменения на GitHub

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis
git add publish site/data/overrides.json
git commit -m "Update published catalog"
git push
```

После этого GitHub Pages обновит опубликованную версию.

---

## 7. Что именно нужно публиковать

Для GitHub Pages нужна только папка `publish/`.

Внутри неё уже есть всё нужное:

- `index.html`
- `app.js`
- `styles.css`
- `data/catalog.json`
- `assets/pages/...`

То есть опубликованная версия будет:

- без редактора
- без сохранения правок
- только для просмотра

---

## 8. Рекомендуемый рабочий процесс

### Локально

Редактирование:

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis/site
./serve.sh
```

Проверка publish-версии:

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis/site
python3 build_publish.py
./serve_publish.sh
```

### Публикация

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis
git add publish site/data/overrides.json
git commit -m "Publish updated catalog"
git push
```

---

## 9. Если нужен отдельный public-репозиторий только под сайт

Можно сделать проще:

- рабочий репозиторий держать локально или приватно
- а содержимое `publish/` выкладывать в отдельный публичный репозиторий

Тогда структура public-репозитория будет просто такой:

```text
repo-root/
  index.html
  app.js
  styles.css
  data/
  assets/
```

В этом случае нужно копировать содержимое папки `publish/` в корень отдельного репозитория.

---

## 10. Что проверить, если GitHub Pages не открылся

Проверить:

1. В `Settings -> Pages` выбрана правильная ветка и папка `/publish`
2. В репозитории действительно есть папка `publish/` после `git push`
3. `index.html` лежит внутри `publish/`
4. Пути к `app.js`, `styles.css`, `data/catalog.json` относительные и не сломаны
5. GitHub Pages успел пересобраться — иногда нужно подождать 1-2 минуты

---

## 11. Коротко

Минимальная команда обновления публикации после правок:

```bash
cd /home/hellsman/.openclaw/workspace/tmp/tis/site && python3 build_publish.py
cd /home/hellsman/.openclaw/workspace/tmp/tis && git add publish site/data/overrides.json && git commit -m "Publish update" && git push
```

