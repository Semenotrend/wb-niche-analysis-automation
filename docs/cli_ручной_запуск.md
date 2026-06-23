# Ручной запуск через CLI

Этот файл нужен, чтобы вручную прогнать две автоматизации из терминала:

1. сбор статистики ниши через прямой URL;
2. сравнение карточек.

## Перед запуском

Проверь `config/scenario.json`.

Важные поля:

```json
{
  "period": "Месяц",
  "topBy": "По выручке",
  "fallbackEnabled": true,
  "niches": [
    {
      "category": "Обувь",
      "subject": "Пропитки для обуви",
      "nicheReportUrl": "https://seller.wildberries.ru/platform-analytics/niche-analysis/item?id=649"
    }
  ]
}
```

Каждый элемент `niches` - отдельная ниша, которую команды обходят по очереди.

## Авторизация

Если сессия WB Partners истекла или файла авторизации нет, сначала запусти:

```bash
pnpm run login
```

В открывшемся браузере войди в WB Partners вручную. После этого CLI сохранит сессию в `.auth/wb.json`.

## Видимый браузер

Чтобы видеть, что происходит в браузере, запускай команды с:

```bash
HEADLESS=false
```

Во время прогона лучше не кликать в браузере руками, чтобы не сбить Playwright.

## 1. Сбор статистики ниши

Команда:

```bash
HEADLESS=false pnpm run niche-report
```

Что делает:

1. для каждой ниши из `config/scenario.json` открывает ее `nicheReportUrl`;
2. выбирает период `Месяц`;
3. парсит метрики и поисковые запросы;
4. сохраняет результат в PostgreSQL.

Успешный лог выглядит так:

```text
[1/4] openNicheReportByUrl success
[2/4] setNichePeriodMonth success
[3/4] parseNicheReport success
[4/4] saveNicheReportToDb success
[niche-report] saved 18 metrics and 50 search queries
```

## 2. Сравнение карточек

Команда:

```bash
HEADLESS=false pnpm run compare-cards
```

Что делает:

1. открывает страницу `Сравнение карточек`;
2. нажимает `Сравнить карточки`;
3. выбирает `Выбрать из рекомендаций по предмету`;
4. вводит `subject` текущей ниши из `config/scenario.json`;
5. выбирает топ карточек по `topBy`;
6. собирает 50 уникальных ID карточек;
7. сохраняет эти ID в `wb_analytics.compare_card_recommendations`;
8. берет первые 5 ID из БД и добавляет их через ручной ввод.

Успешный лог выглядит так:

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

## Быстрый полный прогон

Если конфиг уже настроен и авторизация есть:

```bash
HEADLESS=false pnpm run niche-report
HEADLESS=false pnpm run compare-cards
```

## Проверка результата в БД

Последние запуски:

```bash
PGPASSWORD=${PGPASSWORD:-wb_niche_local} psql \
  --host "${PGHOST:-127.0.0.1}" \
  --port "${PGPORT:-7777}" \
  --username "${PGUSER:-wb_niche}" \
  --dbname "${PGDATABASE:-wb_niche_analysis}" \
  -P pager=off \
  -c "select run_id, scenario_name, status, scenario_config->>'nicheReportUrl' as niche_url, scenario_config->>'subject' as subject, created_at from automation.runs order by created_at desc limit 5;"
```

Проверка карточек по конкретному `run_id`:

```bash
PGPASSWORD=${PGPASSWORD:-wb_niche_local} psql \
  --host "${PGHOST:-127.0.0.1}" \
  --port "${PGPORT:-7777}" \
  --username "${PGUSER:-wb_niche}" \
  --dbname "${PGDATABASE:-wb_niche_analysis}" \
  -P pager=off \
  -c "select count(*) as saved_rows, count(distinct nm_id) as distinct_nm_ids, count(*) - count(distinct nm_id) as duplicate_count from wb_analytics.compare_card_recommendations where run_id = '<RUN_ID>';"
```

Ожидаемый результат для `compare-cards`:

```text
saved_rows = 50
distinct_nm_ids = 50
duplicate_count = 0
```
