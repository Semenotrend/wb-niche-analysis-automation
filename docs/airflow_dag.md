# Airflow DAG для полного сбора ниши

## Отдельный локальный Airflow

Для этого репозитория есть отдельный Airflow stack с UI на порту `7778`.

Запуск:

```bash
cd "/Users/semenovjenya/Documents/Анализ ниши"
docker compose -f airflow/docker-compose.yml up -d --build
```

UI:

```text
http://localhost:7778
```

Логин:

```text
admin / admin
```

Проверить DAG-и из контейнера:

```bash
docker exec wb-niche-airflow-scheduler airflow dags list
```

Этот Airflow stack отдельный от UI на `http://localhost:8082`: у него своя metadata Postgres и свой mount текущего проекта.

Файл DAG:

```text
airflow/dags/wb_niche_daily_collection.py
```

DAG запускает существующие TypeScript/Playwright CLI-команды. Airflow не управляет отдельными кликами, он видит крупные бизнес-задачи:

```text
preflight_doctor
  -> collect_niche_report
  -> collect_niche_query_stats
  -> create_compare_seed
  -> pause_between_compare_batches_01
  -> create_compare_next_01
  -> pause_between_compare_batches_02
  -> create_compare_next_02
  -> ...
  -> create_compare_next_09
```

При значении по умолчанию `WB_NICHE_COMPARE_BATCHES_TOTAL=10` получается:

```text
1 create_compare_seed + 9 create_compare_next = 10 сравнений по 5 SKU
```

Это покрывает пул из 50 SKU, который создает `compare-cards`.

## Продолжить существующий пул

Для уже созданного source-run есть отдельный DAG:

```text
airflow/dags/wb_niche_continue_compare_pool.py
```

Он не запускает `compare-cards` и не создает новый пул из 50 SKU. Он запускает только:

```text
validate_source_run_id
  -> validate_source_pool
  -> continue_compare_next_01
  -> pause_between_compare_batches_01
  -> continue_compare_next_02
  -> ...
  -> continue_compare_next_08
```

Для текущего пула `Блендеры / По выручке` в БД уже использовано 10 SKU из 50, поэтому осталось 8 пачек по 5 SKU.

Текущий source-run:

```text
37400677-4e90-4668-9a04-6a0c458a6e3a
```

Этот UUID стоит значением по умолчанию в Airflow Param `source_run_id`.

CLI-эквивалент одного шага:

```bash
SCENARIO_INDEX=0 \
SOURCE_RUN_ID=37400677-4e90-4668-9a04-6a0c458a6e3a \
HEADLESS=false \
pnpm run compare-cards-next
```

Проверить пул без запуска браузера:

```bash
SCENARIO_INDEX=0 \
SOURCE_RUN_ID=37400677-4e90-4668-9a04-6a0c458a6e3a \
EXPECTED_COMPARE_BATCHES=8 \
pnpm run compare-pool-status
```

## Как создаются пачки

Airflow заранее создает task-и, но не создает сами SKU-пачки.

Первая пачка появляется внутри `create_compare_seed`:

1. `compare-cards` собирает 50 SKU.
2. Flow берет первые 5 свободных SKU.
3. В БД создается строка `wb_analytics.compare_card_comparison_requests`.
4. Эти 5 строк в `wb_analytics.compare_card_recommendations` получают `used_for_comparison = true`.

Следующие task-и `create_compare_next_01` ... `create_compare_next_09` в момент своего запуска берут следующие свободные 5 SKU из source-run:

```text
used_for_comparison = false
order by rank_position
limit 5
```

Поэтому task `create_compare_next_03` заранее не знает свои SKU. Он выберет их только когда стартует, с учетом того, что предыдущие task-и уже успели зарезервировать свои карточки.

## Настройки

По умолчанию DAG ищет проект относительно своего файла. Если Airflow копирует DAG в отдельную папку, укажи путь к проекту:

```bash
export WB_NICHE_PROJECT_ROOT="/Users/semenovjenya/Documents/Анализ ниши"
```

Количество сравнений:

```bash
export WB_NICHE_COMPARE_BATCHES_TOTAL=10
```

Количество continuation-пачек для `wb_niche_continue_compare_pool`:

```bash
export WB_NICHE_CONTINUE_COMPARE_BATCHES_TOTAL=8
```

Минимальная длительность каждой compare-пачки:

```bash
export WB_NICHE_COMPARE_BATCH_MIN_SECONDS=60
```

Пауза между compare-пачками:

```bash
export WB_NICHE_COMPARE_BATCH_PAUSE_SECONDS=60
```

Режим браузера:

```bash
export WB_NICHE_HEADLESS=true
```

Для отладки можно поставить:

```bash
export WB_NICHE_HEADLESS=false
```

## Выбор ниши

В Airflow Param `scenario_index` указывает индекс ниши из `config/scenario.json`, начиная с нуля.

Например:

```text
scenario_index = 0
```

означает первую нишу из массива `niches`.
Для task-ов `collect_niche_report` и `collect_niche_query_stats` выбранная ниша дополнительно разворачивается по всем значениям `periods` из `config/scenario.json`, например `Месяц` и `Квартал`. Compare-task-и используют только выбранную нишу и не дублируют создание пула по периодам.

Все CLI-команды поддерживают тот же фильтр напрямую:

```bash
SCENARIO_INDEX=0 HEADLESS=false pnpm run niche-report
SCENARIO_INDEX=0 HEADLESS=false pnpm run compare-cards
SCENARIO_INDEX=0 HEADLESS=false pnpm run compare-cards-next
```

## Важное ограничение

Сравнения карточек должны идти последовательно. Не запускай `create_compare_next_*` параллельно для одного source-run: каждый task выбирает следующие свободные 5 SKU из БД и сразу резервирует их.
