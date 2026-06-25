# Ручной запуск через CLI

Этот файл нужен, чтобы вручную прогнать две автоматизации из терминала:

1. сбор статистики ниши через прямой URL;
2. сравнение карточек;
3. чтение готовых сравнений карточек.

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
8. берет первые 5 неиспользованных ID из БД и добавляет их через ручной ввод;
9. нажимает верхнюю кнопку `Сравнить карточки`;
10. помечает эти 5 ID как использованные для созданного сравнения.

Успешный лог выглядит так:

```text
[1/10] openCompareCardsPage success
[2/10] startCompareCards success
[3/10] selectRecommendationsBySubject success
[4/10] searchAndSelectCompareSubject success
[5/10] selectTopByRevenue success
[6/10] parseCompareCardIds success
[7/10] saveCompareCardIdsToDb success
[8/10] addManualCompareCards success
[9/10] submitCompareCards success
[10/10] markCompareCardsUsedForComparison success
[compare-cards] saved 50 unique card IDs to DB run_id=...
[compare-cards] submitted 5 cards comparison_request_id=...
```

## 3. Готовые сравнения карточек

Команда:

```bash
HEADLESS=false pnpm run existing-compare-reports
```

Что делает:

1. открывает страницу `Сравнение карточек`;
2. не нажимает `Сравнить карточки`;
3. без скролла и кликов парсит видимый список готовых сравнений;
4. выбирает первый сверху видимый блок, где есть ровно 5 SKU;
5. сохраняет сам блок в `wb_analytics.compare_card_reports`;
6. сохраняет 5 SKU этого блока в `wb_analytics.compare_card_report_items`;
7. одним кликом входит в этот отчет сравнения;
8. нажимает период `Квартал`;
9. берет captured WB response `salesFunnel.byDay`, который фронт уже загрузил для открытого отчета и периода `Квартал`;
10. раскладывает 15 полей графика в long-format по `metric_name`, `nm_id`, `metric_date`;
11. сохраняет точки в `wb_analytics.compare_card_report_chart_daily` с `source = api_sales_funnel`.

Успешный лог выглядит так:

```text
[01/07] openCompareCardsPage success
[02/07] parseExistingComparisonList success
[03/07] saveVisibleComparisonReportToDb success
[04/07] openVisibleComparisonReport success
[05/07] selectComparisonQuarterPeriod success
[06/07] parseComparisonChartDailyFromApi success
[07/07] saveComparisonChartDailyToDb success
[existing-compare-reports] saved 1 report rows 5 card rows ... chart daily rows opened comparison report run_id=... report_id=...
```

Сохраняет:

```text
wb_analytics.compare_card_reports
wb_analytics.compare_card_report_items
wb_analytics.compare_card_report_chart_daily
automation.runs
automation.step_logs
```

## Быстрый полный прогон

Если конфиг уже настроен и авторизация есть:

```bash
HEADLESS=false pnpm run niche-report
HEADLESS=false pnpm run compare-cards
HEADLESS=false pnpm run existing-compare-reports
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
  -c "select count(*) as saved_rows, count(distinct nm_id) as distinct_nm_ids, count(*) - count(distinct nm_id) as duplicate_count, count(*) filter (where used_for_comparison) as used_rows from wb_analytics.compare_card_recommendations where run_id = '<RUN_ID>';"
```

Ожидаемый результат для `compare-cards`:

```text
saved_rows = 50
distinct_nm_ids = 50
duplicate_count = 0
used_rows = 5
```

Проверка готовых сравнений:

```bash
PGPASSWORD=${PGPASSWORD:-wb_niche_local} psql \
  --host "${PGHOST:-127.0.0.1}" \
  --port "${PGPORT:-7777}" \
  --username "${PGUSER:-wb_niche}" \
  --dbname "${PGDATABASE:-wb_niche_analysis}" \
  -P pager=off \
  -c "select r.run_id, count(*) as reports, count(i.item_id) as items from wb_analytics.compare_card_reports r left join wb_analytics.compare_card_report_items i on i.report_id = r.report_id group by r.run_id order by max(r.created_at) desc limit 5;"
```
