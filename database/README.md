# Локальная БД WB Niche Analysis

База хранит результаты Playwright-сценариев: запуск автоматизации, step-log, срез ниши после открытия прямого URL отчета, метрики, поисковые запросы и ID карточек из сценария `compare-cards`.

## Подключение

```text
host: 127.0.0.1
port: 7777
database: wb_niche_analysis
user: wb_niche
password: wb_niche_local
```

Строка подключения:

```text
postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis
```

## Запуск

Из корня проекта:

```bash
docker compose -f database/docker-compose.yml up -d
```

Применить миграции вручную:

```bash
bash database/scripts/apply-migrations.sh
```

Подключиться:

```bash
bash database/scripts/connect.sh
```

Проверить таблицы:

```bash
PGPASSWORD=wb_niche_local psql -h 127.0.0.1 -p 7777 -U wb_niche -d wb_niche_analysis -f database/queries/smoke_check.sql
```

## Схемы

```text
automation
```

Служебный слой автоматизации: запуски, шаги, ошибки.

```text
wb_analytics
```

Данные, которые получаем со страниц WB Partners.

## Таблицы

| Таблица | Назначение |
|---|---|
| `automation.runs` | Один запуск сценария Playwright |
| `automation.step_logs` | Логи каждого шага: start/success/failed, длительность, incident_type |
| `wb_analytics.niche_snapshots` | Главный срез ниши: категория, предмет, период, URL, `snapshot_date` |
| `wb_analytics.niche_metrics` | Метрики ниши в long-format |
| `wb_analytics.niche_search_queries` | Поисковые запросы из блока `Поисковые запросы` |
| `wb_analytics.niche_dynamics_daily` | Дневная динамика графиков, если получим ее из DOM/API |
| `wb_analytics.compare_card_recommendations` | 50 уникальных ID карточек из рекомендаций `Сравнение карточек` |
| `wb_analytics.compare_card_reports` | Список уже готовых сравнений карточек с датой, сроком доступности и raw payload |
| `wb_analytics.compare_card_report_items` | 5 SKU из видимого готового сравнения |
| `wb_analytics.compare_card_report_chart_daily` | Дневные точки графика открытого готового сравнения карточек |

## Почему метрики в long-format

WB может менять состав показателей. Поэтому метрики не храним широкой таблицей вида `revenue_rub`, `avg_check_rub`, `buyout_pct` в колонках.

Вместо этого:

```text
subject_name
wb_subject_id
metric_code
metric_name
value_numeric
value_text
unit
delta_value
delta_unit
delta_direction
```

Так можно добавить новый показатель без миграции схемы.

Сырой текст метрик не храним в `wb_analytics.niche_metrics`: в рабочих таблицах оставляем только нормализованные значения.

`delta_value` хранится со знаком: если в интерфейсе WB красная стрелка вниз `27 %`, в БД пишем `-27`.
`delta_direction` хранит исходное направление из интерфейса: `up`, `down`, `neutral`, `unknown`.

Для поисковых запросов действует то же правило:

```text
cart_conversion_delta_pct
cart_conversion_delta_direction
order_conversion_delta_pct
order_conversion_delta_direction
```

Если WB показывает красную динамику `5 %`, в `*_delta_pct` пишем `-5`.
Если зеленую — `5`. Если серую/нулевую — `0` и `neutral`.

Примеры `metric_code`:

```text
seasonality_title
monopolization_sellers_pct
avg_stock_qty
turnover_days
availability_status
avg_rating
avg_reviews_count
avg_check_rub
buyout_pct
revenue_rub
ordered_qty
bought_out_qty
cards_with_orders_qty
cards_with_buyouts_qty
sellers_with_orders_qty
sellers_with_buyouts_qty
brands_with_orders_qty
brands_with_buyouts_qty
```

Агрегаты из блока `Динамика по предмету` храним в `wb_analytics.niche_metrics`.
Заголовок блока сезонности, например `Слабо выраженная сезонность`, тоже храним в `wb_analytics.niche_metrics`: `metric_code = seasonality_title`, `value_text = <заголовок>`.
В `wb_analytics.niche_dynamics_daily` пойдут только дневные точки графика, если позже начнем собирать API/series-данные.

## Поток записи

```text
Playwright flow
  -> openNicheReportByUrl
  -> setNichePeriodMonth
  -> parseNicheReport
  -> automation.runs
  -> automation.step_logs
  -> wb_analytics.niche_snapshots
  -> wb_analytics.niche_metrics
  -> wb_analytics.niche_search_queries
```

Для сценария `compare-cards`:

```text
Playwright flow
  -> openCompareCardsPage
  -> startCompareCards
  -> selectRecommendationsBySubject
  -> searchAndSelectCompareSubject
  -> selectTopByRevenue
  -> parseCompareCardIds
  -> automation.runs
  -> automation.step_logs
  -> wb_analytics.compare_card_recommendations
  -> addManualCompareCards
```

В `wb_analytics.compare_card_recommendations` дубли внутри одного запуска запрещены:

```text
UNIQUE (run_id, nm_id)
UNIQUE (run_id, rank_position)
```

Для сценария `existing-compare-reports`:

```text
Playwright flow
  -> openCompareCardsPage
  -> parseExistingComparisonList
  -> выбирает первый видимый блок с 5 SKU
  -> wb_analytics.compare_card_reports
  -> wb_analytics.compare_card_report_items
  -> openVisibleComparisonReport
  -> selectComparisonQuarterPeriod
  -> parseComparisonChartDaily для 7 метрик
  -> wb_analytics.compare_card_report_chart_daily
  -> automation.step_logs
```

Этот сценарий read-only по отношению к созданию сравнений в WB: он не нажимает `Сравнить карточки`, не скроллит список и не создает новое сравнение. После сохранения видимого блока он одним кликом входит в выбранный отчет и выбирает период `Квартал`.

## Incident layer

Если сценарий падает, `automation.step_logs.incident_type` принимает один из классов:

```text
auth_expired
captcha
selector_changed
popup_blocking
timeout
business_limit
empty_result
invalid_niche_url
schema_changed
unknown_screen
```

`invalid_niche_url` означает, что прямой URL отчета не открыл ожидаемую нишу; после этого сценарий может перейти в UI-fallback.
`schema_changed` нужен для будущего парсинга: страница открылась, но структура данных не похожа на ожидаемую.
