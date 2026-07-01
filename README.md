# WB Niche Analysis Automation

Локальная Playwright-автоматизация для WB Partners с записью результатов в PostgreSQL.

Основной текущий сценарий: создать сравнение карточек по 5 глобально неиспользованным SKU, дождаться открытого отчета, выбрать период `Квартал` и сохранить дневные данные графика в БД.

## Что делает проект

Сценарии:

1. `niche-report` - собирает метрики ниши.
2. `niche-query-stats` - собирает поисковые запросы по нише.
3. `compare-cards` - создает сравнение карточек и сразу собирает открытый отчет.
4. `compare-cards-next` - создает следующее сравнение из уже сохраненного пула SKU и сразу собирает отчет.
5. `existing-compare-reports` - read-only flow для уже готовых сравнений карточек.

`existing-compare-reports` не нажимает `Сравнить карточки` и не создает новое сравнение. Он работает с уже готовым отчетом, который виден на первом экране истории сравнений.

## Что нужно установить

- Node.js 20 или новее
- pnpm
- Docker
- доступ к аккаунту WB Partners

Если `pnpm` не установлен:

```bash
npm install -g pnpm
```

## Текущий workflow создания и сбора сравнения

Flow `compare-cards`:

1. Открывает `https://seller.wildberries.ru/platform-analytics/cards-comparison`.
2. Выбирает рекомендации по предмету и топ карточек.
3. Сохраняет 50 найденных `nm_id` в PostgreSQL.
4. Добавляет 5 глобально неиспользованных SKU через ручной ввод.
5. Резервирует эти 5 SKU до финального submit.
6. Нажимает `Сравнить карточки`.
7. Дожидается открытого отчета.
8. Выбирает период `Квартал`.
9. Читает уже загруженный WB-фронтом API-ответ `salesFunnel.byDay`.
10. Сохраняет отчет, 5 SKU и дневные значения графика в PostgreSQL.

Flow `compare-cards-next`:

1. Открывает страницу `Сравнение карточек`.
2. Находит source-run с уже сохраненным пулом 50 SKU для текущего `subject/topBy`.
3. Создает новый `automation.runs` для следующего сравнения.
4. Берет следующие 5 глобально неиспользованных SKU из source-run.
5. Открывает ручной ввод SKU.
6. Добавляет эти 5 SKU, резервирует их в source-run и нажимает `Сравнить карточки`.
7. Дальше использует тот же хвост: открытый отчет, `Квартал`, captured `salesFunnel.byDay`, сохранение отчета и графика.

## Read-only workflow готовых сравнений

Flow `existing-compare-reports`:

1. Открывает `https://seller.wildberries.ru/platform-analytics/cards-comparison`.
2. Парсит первый видимый готовый блок сравнения с 5 SKU.
3. Сохраняет отчет и карточки в PostgreSQL.
4. Открывает этот отчет.
5. Выбирает период `Квартал`.
6. Читает уже загруженный WB-фронтом API-ответ `salesFunnel.byDay`.
7. Сохраняет дневные значения графика в PostgreSQL.

Это не SVG-парсинг и не hover по графику. Значения берутся из JSON-ответа, который сама страница WB получает для отрисовки графика.

## Метрики графика

Нужные для анализа метрики уже собираются:

| Метрика в интерфейсе WB | API field | Единица |
|---|---|---|
| `Показы` | `viewCount` | `шт` |
| `CTR` | `CTR` | `%` |
| `Конверсия в корзину` | `openToCart` | `%` |
| `Конверсия в заказ` | `cartToOrder` | `%` |
| `Процент выкупа` | `buyoutPercent` | `%` |
| `Медианная цена покупателя` | `medianPrice` | `₽` |
| `Средняя позиция` | `avgPosition` |  |

Дополнительно сейчас сохраняются исходные метрики, которые можно использовать для формул и проверок:

```text
Переходы в карточку
Добавления в корзину
Заказы
Заказали на сумму
Выкупы
Выкупили на сумму
Отмены
Отменили на сумму
```

Для одного отчета на 5 SKU и периода `Квартал` получается:

```text
15 метрик * 5 SKU * 90 дней = 6750 строк
```

Если WB отдает технический `0` для `Медианная цена покупателя` или `Средняя позиция`, в нормализованной колонке сохраняется `NULL`, а исходное значение остается в `raw_payload`.

## Почему сбор быстрый

WB уже отдает данные графика внутри страницы. Автоматизация не делает отдельный массовый обход точек графика и не водит мышью по каждому дню.

Сервер WB видит обычный пользовательский путь:

```text
открыли историю сравнений
открыли один готовый отчет
выбрали Квартал
страница загрузила данные графика
```

После этого парсер локально сохраняет уже полученный браузером ответ.

## PostgreSQL

Локальная БД:

```text
host: 127.0.0.1
port: 7777
database: wb_niche_analysis
user: wb_niche
password: wb_niche_local
```

Строка подключения по умолчанию:

```text
postgresql://wb_niche:wb_niche_local@127.0.0.1:7777/wb_niche_analysis
```

Запустить PostgreSQL:

```bash
docker compose -f database/docker-compose.yml up -d
```

Применить миграции:

```bash
bash database/scripts/apply-migrations.sh
```

Проверить БД:

```bash
pnpm run doctor
```

Подключиться к БД:

```bash
bash database/scripts/connect.sh
```

## Быстрый старт

Из корня проекта:

```bash
pnpm install
pnpm run playwright:install
docker compose -f database/docker-compose.yml up -d
bash database/scripts/apply-migrations.sh
pnpm run login
pnpm run doctor
```

После `pnpm run login` откроется браузер. Войди в WB Partners вручную, дождись загрузки кабинета, вернись в терминал и нажми `Enter`.

Сессия сохраняется в:

```text
.auth/wb.json
```

Этот файл не должен попадать в git.

## Запуск создания и сбора сравнения

```bash
HEADLESS=false pnpm run compare-cards
```

Успешный запуск выглядит так:

```text
[compare-cards] saved 50 unique card IDs to DB run_id=...
[compare-cards] submitted 5 cards comparison_request_id=...
[compare-cards] collected submitted report report_id=... 5 card rows 6750 chart daily rows
```

## Запуск следующей пятерки из сохраненного пула

```bash
HEADLESS=false pnpm run compare-cards-next
```

По умолчанию сценарий сам берет последний source-run по текущему `subject/topBy`,
где осталось минимум 5 глобально неиспользованных SKU. Чтобы указать пул явно:

```bash
SOURCE_RUN_ID=<run_id> HEADLESS=false pnpm run compare-cards-next
```

Успешный запуск выглядит так:

```text
[compare-cards-next] selected 5 cards source_run_id=... available_before=45 nm_ids=...
[compare-cards-next] submitted 5 cards comparison_request_id=...
[compare-cards-next] collected submitted report run_id=... report_id=... 5 card rows 6750 chart daily rows
```

## Read-only запуск готового сравнения

```bash
HEADLESS=false pnpm run existing-compare-reports
```

Успешный запуск выглядит так:

```text
[existing-compare-reports] saved 1 report rows 5 card rows 6750 chart daily rows opened comparison report run_id=... report_id=...
```

## Airflow DAG и отдельный локальный Airflow

Для этого проекта добавлен отдельный Airflow stack. Он не использует старый UI на `8082`: у него своя metadata Postgres и mount текущего репозитория.

Запуск из корня проекта:

```bash
docker compose -f airflow/docker-compose.yml up -d --build
```

UI:

```text
http://localhost:7778
admin / admin
```

В контейнере Airflow команды проекта запускаются из `/opt/airflow/project`, а к рабочей БД подключаются через:

```text
postgresql://wb_niche:wb_niche_local@host.docker.internal:7777/wb_niche_analysis
```

### DAG полного сбора

Файл:

```text
airflow/dags/wb_niche_daily_collection.py
```

Сценарий:

```text
preflight_doctor
  -> collect_niche_report
  -> collect_niche_query_stats
  -> create_compare_seed
  -> pause_between_compare_batches_01
  -> create_compare_next_01
  -> ...
  -> create_compare_next_09
```

`create_compare_seed` собирает новый пул из 50 SKU и сразу создает первую пачку из 5 SKU. Следующие `create_compare_next_*` берут следующие свободные SKU из этого же пула в момент запуска.

### DAG продолжения существующего пула

Файл:

```text
airflow/dags/wb_niche_continue_compare_pool.py
```

Сценарий:

```text
validate_source_run_id
  -> validate_source_pool
  -> continue_compare_next_01
  -> pause_between_compare_batches_01
  -> continue_compare_next_02
  -> ...
  -> continue_compare_next_08
```

Этот DAG не запускает `compare-cards` и не создает новый пул. Он продолжает уже существующий `source_run_id`, проверяет его через `pnpm run compare-pool-status`, а затем запускает только `compare-cards-next`.

Параметры по умолчанию в DAG оставлены для пула `Блендеры / По выручке`:

```text
scenario_index = 0
source_run_id =
37400677-4e90-4668-9a04-6a0c458a6e3a
```

Важно: этот конкретный pool уже полностью обработан. Сейчас в локальной БД по нему `50 used / 0 available`, поэтому повторный запуск continuation-DAG с дефолтными параметрами должен упасть на `validate_source_pool`. Для нового незавершенного пула нужно передать новый `source_run_id` и нужное число continuation-пачек.

### Паузы и защита от слишком быстрого сбора

В DAG включены две задержки:

```text
WB_NICHE_COMPARE_BATCH_MIN_SECONDS=60
WB_NICHE_COMPARE_BATCH_PAUSE_SECONDS=60
```

Каждая compare-пачка длится не меньше 60 секунд. Если браузерный сбор завершился быстрее, task досыпает до минуты. Между пачками есть отдельные task-и `pause_between_compare_batches_*` тоже на 60 секунд. После последней пачки паузы нет.

### Выбор ниши

Все CLI-команды теперь поддерживают фильтр:

```bash
SCENARIO_INDEX=0 pnpm run compare-cards
SCENARIO_INDEX=0 SOURCE_RUN_ID=<run_id> pnpm run compare-cards-next
SCENARIO_INDEX=0 SOURCE_RUN_ID=<run_id> EXPECTED_COMPARE_BATCHES=8 pnpm run compare-pool-status
```

`SCENARIO_INDEX=0` означает первую нишу из `config/scenario.json`; конкретный предмет и `topBy` берутся из текущего файла конфигурации.

Для `niche-report` и `niche-query-stats` выбранная ниша дополнительно разворачивается по массиву `periods`, если он задан в `config/scenario.json`. Так один запуск может последовательно собрать, например, `Месяц` и `Квартал` для одной ниши. Compare-flow (`compare-cards`, `compare-cards-next`, `compare-pool-status`) использует одну выбранную нишу и основной `period`, не создавая отдельные пулы по каждому периоду.

### Текущее состояние локальной БД

После контрольного запуска и чистки в локальной БД оставлены только данные по `Блендеры / По выручке`:

```text
compare_card_recommendations:      50
compare_card_comparison_requests:  10
compare_card_reports:              10
compare_card_report_items:         50
compare_card_report_chart_daily:   67 500
```

Данные покрывают 50 уникальных SKU, 10 отчетов по 5 SKU, без дублей SKU и без дублей `report_fingerprint`. Диапазон дат графиков: `2026-03-28` ... `2026-06-26`.

Таблицы `niche_*` сейчас пустые, потому что перед чисткой в них были только данные по `Фены`.

Подробнее: `docs/airflow_dag.md`.

## Таблицы

Основные таблицы нового workflow:

| Таблица | Назначение |
|---|---|
| `automation.runs` | Один запуск сценария |
| `automation.step_logs` | Логи шагов Playwright-сценария |
| `wb_analytics.compare_card_recommendations` | 50 найденных карточек и флаги `used_for_comparison` для глобальной защиты от повторного выбора |
| `wb_analytics.compare_card_comparison_requests` | Пачки по 5 карточек, зарезервированные и затем отправленные в создание сравнения |
| `wb_analytics.compare_card_reports` | Готовый блок сравнения: дата, срок доступности, raw payload |
| `wb_analytics.compare_card_report_items` | 5 SKU из выбранного сравнения |
| `wb_analytics.compare_card_report_chart_daily` | Дневные значения графика по SKU, метрикам и датам |

В `compare_card_report_chart_daily` важные поля:

| Поле | Значение |
|---|---|
| `metric_name` | Название метрики из интерфейса WB |
| `nm_id` | SKU |
| `metric_date` | День |
| `value_numeric` | Нормализованное числовое значение или `NULL` |
| `value_state` | `actual`, `zero`, `missing`, `missing_rendered_as_zero` |
| `unit` | `шт`, `%`, `₽` или пусто |
| `source` | `api_sales_funnel` для captured API-ответа |
| `raw_payload` | Исходная строка API, поле API и request metadata |

## Проверка качества данных

Проверить последний собранный отчет:

```sql
WITH latest AS (
  SELECT report_id
  FROM wb_analytics.compare_card_reports
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  metric_name,
  unit,
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE value_numeric IS NULL) AS null_rows,
  COUNT(*) FILTER (WHERE source = 'api_sales_funnel') AS api_rows,
  MIN(metric_date) AS min_date,
  MAX(metric_date) AS max_date
FROM wb_analytics.compare_card_report_chart_daily
WHERE report_id = (SELECT report_id FROM latest)
GROUP BY metric_name, unit
ORDER BY metric_name;
```

Проверить, что `Показы` не сохранились дробными:

```sql
WITH latest AS (
  SELECT report_id
  FROM wb_analytics.compare_card_reports
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  COUNT(*) AS shows_rows,
  COUNT(*) FILTER (WHERE value_numeric <> trunc(value_numeric)) AS fractional_shows
FROM wb_analytics.compare_card_report_chart_daily
WHERE report_id = (SELECT report_id FROM latest)
  AND metric_name = 'Показы';
```

Проверить совпадение нормализованных значений с raw API:

```sql
WITH latest AS (
  SELECT report_id
  FROM wb_analytics.compare_card_reports
  ORDER BY created_at DESC
  LIMIT 1
),
base AS (
  SELECT
    metric_name,
    value_numeric,
    raw_payload->'apiRow'->>(raw_payload->>'apiField') AS raw_value
  FROM wb_analytics.compare_card_report_chart_daily
  WHERE report_id = (SELECT report_id FROM latest)
    AND value_numeric IS NOT NULL
)
SELECT
  metric_name,
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE value_numeric <> raw_value::numeric) AS numeric_mismatch
FROM base
GROUP BY metric_name
ORDER BY metric_name;
```

## Полезные команды

```bash
pnpm run typecheck
pnpm run playwright:install
pnpm run login
pnpm run doctor
HEADLESS=false pnpm run compare-cards
HEADLESS=false pnpm run compare-cards-next
bash database/scripts/connect.sh
```

## Структура проекта

```text
config/      настройки ниши и runtime
database/    PostgreSQL docker-compose, миграции, SQL-скрипты
src/cli/     CLI-точки входа
src/flows/   Playwright-сценарии
src/steps/   отдельные шаги и парсеры
src/core/    browser, config, storage, doctor-check
docs/        подробная документация
```

Дополнительная документация:

- `database/README.md` - локальная PostgreSQL-БД;
- `docs/cli_ручной_запуск.md` - ручной запуск через CLI;
- `docs/архитектура_автоматизации.md` - структура автоматизации;
- `docs/playwright_гранулярность.md` - пошаговая гранулярность сценариев;
- `docs/авторизация.md` - авторизация WB Partners.
