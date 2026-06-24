# WB Niche Analysis Automation

Локальная Playwright-автоматизация для WB Partners.

Сценарии:

1. `niche-report` - собирает метрики ниши.
2. `niche-query-stats` - собирает поисковые запросы по нише.
3. `compare-cards` - собирает 50 карточек из раздела `Сравнение карточек` и добавляет первые 5 вручную.
4. `existing-compare-reports` - читает один видимый готовый блок сравнения карточек в PostgreSQL, входит в этот отчет, выбирает `Квартал` и сохраняет дневные значения из уже загруженного ответа WB, не нажимая `Сравнить карточки`.

Для локального пользователя основной режим - SQLite: без отдельной БД, данные сохраняются в файл внутри проекта.

## Что нужно установить

- Node.js 20 или новее
- pnpm
- доступ к аккаунту WB Partners

Если `pnpm` не установлен:

```bash
npm install -g pnpm
```

## Быстрый старт

Из корня проекта:

```bash
pnpm install
pnpm run playwright:install
pnpm run sqlite:init
pnpm run login
pnpm run doctor:sqlite
```

После `pnpm run login` откроется браузер. Войди в WB Partners вручную, дождись загрузки кабинета, вернись в терминал и нажми `Enter`.

Сессия сохранится в:

```text
.auth/wb.json
```

Этот файл не должен попадать в git.

## Настройка ниши

Перед запуском проверь `config/scenario.json`:

```json
{
  "period": "Месяц",
  "topBy": "По выручке",
  "fallbackEnabled": true,
  "niches": [
    {
      "category": "Бытовая техника",
      "subject": "Фены",
      "nicheReportUrl": "https://seller.wildberries.ru/platform-analytics/niche-analysis/item?id=642"
    }
  ]
}
```

Поля:

- `category` - категория в WB Partners.
- `subject` - предмет ниши.
- `nicheReportUrl` - прямой URL отчета ниши.
- `period` - период отчета, сейчас используется `Месяц`.
- `topBy` - способ отбора карточек в `compare-cards`.
- `fallbackEnabled` - если прямой URL не открылся, автоматизация попробует найти нишу через UI.

Если меняешь `nicheReportUrl`, проверь, что `category` и `subject` соответствуют этой же нише.

## Проверка готовности

Перед запуском можно проверить компьютер:

```bash
pnpm run doctor:sqlite
```

Команда проверяет:

- проект запущен из правильной папки;
- зависимости установлены;
- Playwright Chromium доступен;
- `.auth/wb.json` существует и читается;
- SQLite инициализирован;
- нужные таблицы есть.

Если все хорошо:

```text
Ready: yes
```

Если что-то не настроено, doctor покажет команду для исправления.

## Полный локальный прогон

Запускай сценарии последовательно. Не нужно открывать три автоматизации параллельно: каждая команда должна завершиться перед следующей.

Во время работы Playwright лучше не кликать в браузере руками, чтобы не сбить действия автоматизации.

### 1. Проверить окружение

```bash
pnpm run doctor:sqlite
```

Если в конце `Ready: yes`, можно запускать сбор данных.

### 2. Собрать данные

Сначала собери метрики ниши:

```bash
HEADLESS=false pnpm run niche-report:sqlite
```

Потом собери поисковые запросы:

```bash
HEADLESS=false pnpm run niche-query-stats:sqlite
```

После этого собери карточки для сравнения:

```bash
HEADLESS=false pnpm run compare-cards:sqlite
```

### 3. Посмотреть результат из SQLite

```bash
pnpm run sqlite:report
```

Команда покажет, что данные действительно сохранены локально: последние запуски, нишу, метрики, поисковые запросы и карточки.

## Отдельные команды

### Авторизация

```bash
pnpm run login
```

Открывает WB Partners и сохраняет авторизованную сессию в `.auth/wb.json`.

### Метрики ниши

```bash
HEADLESS=false pnpm run niche-report:sqlite
```

Сохраняет:

```text
wb_niche_snapshots
wb_niche_metrics
automation_runs
automation_step_logs
```

### Поисковые запросы

```bash
HEADLESS=false pnpm run niche-query-stats:sqlite
```

Сохраняет:

```text
wb_niche_search_queries
automation_runs
automation_step_logs
```

### Сравнение карточек

```bash
HEADLESS=false pnpm run compare-cards:sqlite
```

Открывает `Сравнение карточек`, выбирает рекомендации по предмету, собирает 50 `nm_id`, сохраняет их и добавляет первые 5 карточек вручную.

Сохраняет:

```text
wb_compare_card_recommendations
automation_runs
automation_step_logs
```

### Готовые сравнения карточек

```bash
HEADLESS=false pnpm run existing-compare-reports
```

Открывает `Сравнение карточек`, без скролла парсит первый видимый блок готового сравнения с 5 SKU, сохраняет результат в PostgreSQL, одним кликом входит в этот отчет, выбирает `Квартал` и сохраняет дневные значения из captured WB `salesFunnel.byDay`: `Показы`, `Переходы в карточку`, `CTR`, `Добавления в корзину`, `Конверсия в корзину`, `Заказы`, `Заказали на сумму`, `Конверсия в заказ`, `Выкупы`, `Выкупили на сумму`, `Процент выкупа`, `Отмены`, `Медианная цена покупателя`, `Отменили на сумму`, `Средняя позиция`.

SQLite-режима для этой команды нет.

Сохраняет:

```text
wb_analytics.compare_card_reports
wb_analytics.compare_card_report_items
wb_analytics.compare_card_report_chart_daily
automation.runs
automation.step_logs
```

В дневных точках `source = api_sales_funnel` означает, что значение взято из JSON-ответа, который уже загрузила сама страница WB. `value_state = actual` — ненулевое значение, `zero` — реальный ноль от WB, `missing` — значения нет.

## Посмотреть собранные данные

Технические счетчики таблиц:

```bash
pnpm run sqlite:inspect
```

Демонстрационный отчет из SQLite:

```bash
pnpm run sqlite:report
```

Он показывает:

- последние запуски;
- последнюю собранную нишу;
- ключевые метрики;
- топ поисковых запросов;
- карточки из `compare-cards`.

Пример:

```text
SQLite report
sqlite/data/wb_niche_analysis.sqlite

Runs
- compare_cards: success
- niche_query_stats: success
- niche_report: success

Latest niche
Бытовая техника / Фены

Metrics
- Сезонность: Умеренно выраженная сезонность
- Выручка: ...

Top search queries
1. Фен для волос - ...

Compare cards
1. 806275880
```

## SQLite

SQLite-файл по умолчанию:

```text
sqlite/data/wb_niche_analysis.sqlite
```

Инициализировать БД:

```bash
pnpm run sqlite:init
```

Очистить данные, но оставить схему:

```bash
pnpm run sqlite:reset
```

Проверить содержимое:

```bash
pnpm run sqlite:inspect
pnpm run sqlite:report
```

Файлы SQLite не коммитятся:

```text
sqlite/data/*.sqlite
sqlite/data/*.sqlite-wal
sqlite/data/*.sqlite-shm
```

## Полезные команды

```bash
pnpm run typecheck
pnpm run playwright:install
pnpm run login
pnpm run doctor:sqlite
pnpm run sqlite:report
```

## Структура проекта

```text
config/      настройки ниши и runtime
sqlite/      локальная SQLite-БД, схема, scripts, read-only report
src/cli/     CLI-точки входа
src/flows/   Playwright-сценарии
src/steps/   отдельные шаги и парсеры
src/core/    storage, browser, config, doctor-check
docs/        подробная документация
```

Дополнительная документация:

- `sqlite/README.md` - локальный SQLite-режим;
- `docs/cli_ручной_запуск.md` - ручной запуск через CLI;
- `docs/архитектура_автоматизации.md` - структура автоматизации;
- `docs/playwright_гранулярность.md` - пошаговая гранулярность сценариев;
- `docs/авторизация.md` - авторизация WB Partners.
