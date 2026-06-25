# WB Niche Analysis Automation

Локальная Playwright-автоматизация для WB Partners с записью результатов в PostgreSQL.

Основной текущий сценарий: читать уже готовые сравнения карточек, открывать один отчет на 5 SKU, выбирать период `Квартал` и сохранять дневные данные графика в БД.

## Что делает проект

Сценарии:

1. `niche-report` - собирает метрики ниши.
2. `niche-query-stats` - собирает поисковые запросы по нише.
3. `compare-cards` - собирает карточки из раздела `Сравнение карточек`.
4. `existing-compare-reports` - основной read-only flow для готовых сравнений карточек.

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

## Текущий workflow готовых сравнений

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

## Запуск сбора готового сравнения

```bash
HEADLESS=false pnpm run existing-compare-reports
```

Успешный запуск выглядит так:

```text
[existing-compare-reports] saved 1 report rows 5 card rows 6750 chart daily rows opened comparison report run_id=... report_id=...
```

## Таблицы

Основные таблицы нового workflow:

| Таблица | Назначение |
|---|---|
| `automation.runs` | Один запуск сценария |
| `automation.step_logs` | Логи шагов Playwright-сценария |
| `wb_analytics.compare_card_recommendations` | 50 найденных карточек и флаги `used_for_comparison` после submit |
| `wb_analytics.compare_card_comparison_requests` | Пачки по 5 карточек, отправленные в создание сравнения |
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
HEADLESS=false pnpm run existing-compare-reports
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
