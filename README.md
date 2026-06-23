# WB Niche Analysis Automation

Playwright-автоматизация для WB Partners:

1. собирает статистику ниши по прямому URL отчета;
2. собирает ID карточек в разделе `Сравнение карточек`;
3. сохраняет результаты и step-log в локальную PostgreSQL;
4. добавляет первые 5 найденных карточек через ручной ввод в сравнении карточек.

## Что нужно установить

- Node.js 20 или новее;
- pnpm;
- Docker и Docker Compose;
- доступ к аккаунту WB Partners.

Если `pnpm` не установлен:

```bash
npm install -g pnpm
```

## Быстрый старт

Из корня проекта:

```bash
pnpm install
pnpm run playwright:install
docker compose -f database/docker-compose.yml up -d
bash database/scripts/apply-migrations.sh
pnpm run login
```

После `pnpm run login` откроется браузер. Нужно вручную войти в WB Partners, дождаться загрузки кабинета, вернуться в терминал и нажать `Enter`. Сессия сохранится в `.auth/wb.json`.

Файл `.auth/wb.json` не должен попадать в git.

## Настройка сценария

Перед запуском проверь `config/scenario.json`:

```json
{
  "category": "Обувь",
  "subject": "Пропитки для обуви",
  "period": "Месяц",
  "topBy": "По выручке",
  "nicheReportUrl": "https://seller.wildberries.ru/platform-analytics/niche-analysis/item?id=649",
  "fallbackEnabled": true
}
```

Главное:

- `nicheReportUrl` используется для сбора статистики ниши;
- `subject` используется в сценарии `compare-cards`, когда автоматизация выбирает рекомендации по предмету;
- `topBy` задает способ отбора топа карточек;
- `fallbackEnabled` разрешает fallback через UI-фильтры, если прямой URL отчета не открылся.

Важно: `compare-cards` сейчас не вытаскивает предмет автоматически из `nicheReportUrl`. Если меняешь URL ниши, проверь, что `subject` соответствует этой же нише.

## Запуск автоматизаций

Чтобы видеть браузер во время работы Playwright, запускай команды с `HEADLESS=false`.

Сбор статистики ниши:

```bash
HEADLESS=false pnpm run niche-report
```

Сравнение карточек:

```bash
HEADLESS=false pnpm run compare-cards
```

Полный ручной прогон:

```bash
HEADLESS=false pnpm run niche-report
HEADLESS=false pnpm run compare-cards
```

Во время прогона лучше не кликать в браузере руками, чтобы не сбить действия Playwright.

## Что делают команды

### `pnpm run login`

Открывает WB Partners в видимом браузере и сохраняет авторизованную сессию в `.auth/wb.json`.

### `pnpm run niche-report`

Сценарий:

```text
openNicheReportByUrl
setNichePeriodMonth
parseNicheReport
saveNicheReportToDb
```

Результат сохраняется в:

- `automation.runs`;
- `automation.step_logs`;
- `wb_analytics.niche_snapshots`;
- `wb_analytics.niche_metrics`;
- `wb_analytics.niche_search_queries`.

Успешный лог выглядит так:

```text
[1/4] openNicheReportByUrl success
[2/4] setNichePeriodMonth success
[3/4] parseNicheReport success
[4/4] saveNicheReportToDb success
[niche-report] saved 18 metrics and 50 search queries
```

### `pnpm run compare-cards`

Сценарий:

```text
openCompareCardsPage
startCompareCards
selectRecommendationsBySubject
searchAndSelectCompareSubject
selectTopByRevenue
parseCompareCardIds
saveCompareCardIdsToDb
addManualCompareCards
```

Что происходит:

1. открывается раздел `Сравнение карточек`;
2. выбирается режим `Выбрать из рекомендаций по предмету`;
3. вводится `subject` из `config/scenario.json`;
4. выбирается топ по `topBy`;
5. из DOM собираются 50 уникальных `nm_id`;
6. ID сохраняются в `wb_analytics.compare_card_recommendations`;
7. первые 5 ID текущего запуска берутся из БД и добавляются через режим `Ввести вручную`.

Успешный лог выглядит примерно так:

```text
[1/8] openCompareCardsPage success
[2/8] startCompareCards success
[3/8] selectRecommendationsBySubject success
[4/8] searchAndSelectCompareSubject success
[5/8] selectTopByRevenue success
[6/8] parseCompareCardIds success
[7/8] saveCompareCardIdsToDb success
[8/8] addManualCompareCards success
[compare-cards] saved 50 unique card IDs to DB run_id=...
```

## База данных

Локальная PostgreSQL поднимается через Docker:

```bash
docker compose -f database/docker-compose.yml up -d
```

Параметры подключения по умолчанию:

```text
host: 127.0.0.1
port: 7777
database: wb_niche_analysis
user: wb_niche
password: wb_niche_local
```

Применить миграции вручную:

```bash
bash database/scripts/apply-migrations.sh
```

Подключиться к БД:

```bash
bash database/scripts/connect.sh
```

Проверить последние запуски:

```bash
PGPASSWORD=${PGPASSWORD:-wb_niche_local} psql \
  --host "${PGHOST:-127.0.0.1}" \
  --port "${PGPORT:-7777}" \
  --username "${PGUSER:-wb_niche}" \
  --dbname "${PGDATABASE:-wb_niche_analysis}" \
  -P pager=off \
  -c "select run_id, scenario_name, status, scenario_config->>'nicheReportUrl' as niche_url, scenario_config->>'subject' as subject, created_at from automation.runs order by created_at desc limit 5;"
```

Проверить карточки по `run_id` из `compare-cards`:

```bash
PGPASSWORD=${PGPASSWORD:-wb_niche_local} psql \
  --host "${PGHOST:-127.0.0.1}" \
  --port "${PGPORT:-7777}" \
  --username "${PGUSER:-wb_niche}" \
  --dbname "${PGDATABASE:-wb_niche_analysis}" \
  -P pager=off \
  -c "select count(*) as saved_rows, count(distinct nm_id) as distinct_nm_ids, count(*) - count(distinct nm_id) as duplicate_count from wb_analytics.compare_card_recommendations where run_id = '<RUN_ID>';"
```

Ожидаемый результат:

```text
saved_rows = 50
distinct_nm_ids = 50
duplicate_count = 0
```

## Полезные команды

Проверить TypeScript:

```bash
pnpm run typecheck
```

Установить Chromium для Playwright:

```bash
pnpm run playwright:install
```

Перезапустить авторизацию:

```bash
pnpm run login
```

## Структура проекта

```text
config/      параметры сценария и runtime
database/    Docker Compose, миграции, SQL-скрипты
docs/        подробная документация
src/cli/     CLI-точки входа
src/flows/   сценарии автоматизации
src/steps/   отдельные Playwright-шаги
```

Подробнее:

- `docs/cli_ручной_запуск.md` — ручной запуск через CLI;
- `docs/архитектура_автоматизации.md` — структура автоматизации;
- `docs/playwright_гранулярность.md` — пошаговая гранулярность сценариев;
- `docs/авторизация.md` — авторизация WB Partners;
- `database/README.md` — устройство локальной БД.
