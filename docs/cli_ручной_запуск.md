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
9. по очереди выбирает 7 метрик графика: `Показы`, `CTR`, `Конверсия в корзину`, `Конверсия в заказ`, `Процент выкупа`, `Медианная цена покупателя`, `Средняя позиция`;
10. после каждой выбранной метрики читает дневные точки текущего SVG без hover по графику;
11. сохраняет точки в `wb_analytics.compare_card_report_chart_daily`.

Успешный лог выглядит так:

```text
[01/13] openCompareCardsPage success
[02/13] parseExistingComparisonList success
[03/13] saveVisibleComparisonReportToDb success
[04/13] openVisibleComparisonReport success
[05/13] selectComparisonQuarterPeriod success
[06/13] parseComparisonChartDaily:shows success
[07/13] parseComparisonChartDaily:ctr success
[08/13] parseComparisonChartDaily:cart_conversion success
[09/13] parseComparisonChartDaily:order_conversion success
[10/13] parseComparisonChartDaily:buyout_percent success
[11/13] parseComparisonChartDaily:median_buyer_price success
[12/13] parseComparisonChartDaily:avg_position success
[13/13] saveComparisonChartDailyToDb success
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
  -c "select count(*) as saved_rows, count(distinct nm_id) as distinct_nm_ids, count(*) - count(distinct nm_id) as duplicate_count from wb_analytics.compare_card_recommendations where run_id = '<RUN_ID>';"
```

Ожидаемый результат для `compare-cards`:

```text
saved_rows = 50
distinct_nm_ids = 50
duplicate_count = 0
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
