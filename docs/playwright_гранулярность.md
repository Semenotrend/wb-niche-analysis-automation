# Playwright-гранулярность сценария

Основной сценарий сбора отчета ниши начинается с прямой ссылки:

```text
https://seller.wildberries.ru/platform-analytics/niche-analysis/item?id=643
```

`id` в URL — идентификатор ниши/предмета. Если прямой URL не открыл нужный отчет, запускается fallback-сценарий через UI-фильтры.

## Основной Niche Report Flow

| N | Функция | Что делает | Проверка успешности |
|---|---|---|---|
| 1 | `openNicheReportByUrl` | Открывает `nicheReportUrl` текущей ниши | URL содержит `/niche-analysis/item`, `id` валиден, заголовок страницы равен `subject` |
| 2 | `setNichePeriodMonth` | На странице ниши выбирает период `Месяц` | Кнопка `Месяц` активна, данные показаны за месячный период |
| 3 | `parseNicheReport` | Собирает заголовок блока сезонности в метрику `seasonality_title`; в блоке `Динамика по предмету` по очереди выбирает `Заказы и выкупы`, `Карточки товаров`, `Продавцы и бренды`, собирает агрегированные значения над графиком; затем скроллит до таблицы `Поисковые запросы`, через `Показать ещё` раскрывает до 50 запросов и собирает snapshot, metrics и searchQueries из DOM. Для KPI и поисковых запросов динамика читается с учетом цвета плашки: красная = отрицательная, зеленая = положительная, серая = нейтральная | Получены заголовок сезонности, KPI, агрегаты всех 3 режимов динамики и до 50 поисковых запросов |
| 4 | `saveNicheReportToDb` | Сохраняет результат в PostgreSQL | Данные записаны в `wb_analytics.*` и `automation.*` |

## Fallback UI Flow

| N | Функция | Что делает | Проверка успешности |
|---|---|---|---|
| 1 | `openAnalyticsNichePage` | После авторизации переходит по ссылке `https://seller.wildberries.ru/platform-analytics/niche-analysis/main` | Видна вкладка `Анализ ниш` |
| 2 | `setPeriodMonth` | Выбирает период `Месяц` | Кнопка `Месяц` активна |
| 3 | `openFilters` | Нажимает `Фильтры` или `Фильтры2/3/4...` | Открыта правая панель `Фильтры` |
| 4 | `resetFiltersIfActive` | Если кнопка была не `Фильтры`, а `Фильтры2/3/4...`, нажимает `Сбросить` внутри панели фильтров | Старые значения фильтров очищены; если активных фильтров не было, шаг завершается без действия |
| 5 | `selectCategory` | Берет `category` текущей ниши из `config/scenario.json`, печатает значение в поле `Категория`, ставит галочку у точного варианта и закрывает выпадающий список | В фильтре выбрана категория из конфига, выпадающий список закрыт |
| 6 | `selectSubject` | Берет `subject` текущей ниши из `config/scenario.json`, печатает значение в поле `Предмет`, ставит галочку у найденного варианта и закрывает выпадающий список | В фильтре выбран предмет из конфига, выпадающий список закрыт |
| 7 | `applyFilters` | Нажимает `Применить` после выбора `category` и `subject` | Панель фильтров закрыта, в таблице появляется строка `category / subject` |
| 8 | `openNicheCard` | Открывает карточку ниши из строки таблицы `category / subject` | Открыта страница ниши, заголовок страницы равен `subject` |
| 9 | `setNichePeriodMonth` | На странице ниши выбирает период `Месяц` | Кнопка `Месяц` активна, данные показаны за месячный период |

## Сценарий "Сравнение карточек"

Это отдельный сценарий со своей нумерацией шагов. Он стартует с прямого перехода в раздел `Сравнение карточек`.

Перед запуском нужна активная авторизованная сессия WB Partners. Если сессии нет или она истекла, сначала нужно выполнить сценарий авторизации из `docs/авторизация.md`.

| N | Функция | Что делает | Проверка успешности |
|---|---|---|---|
| 1 | `openCompareCardsPage` | После авторизации переходит по ссылке `https://seller.wildberries.ru/platform-analytics/cards-comparison` | Заголовок страницы `Сравнение карточек` |
| 2 | `startCompareCards` | Нажимает кнопку `Сравнить карточки` на вкладке сравнения | Открыта форма добавления карточек для сравнения |
| 3 | `selectRecommendationsBySubject` | Выбирает режим `Выбрать из рекомендаций по предмету` | Активен режим `Выбрать из рекомендаций по предмету`, видно поле `Выберите предмет` |
| 4 | `searchAndSelectCompareSubject` | В поле `Выберите предмет` вводит `subject` текущей ниши из `config/scenario.json`, выбирает точный предмет и нажимает `Применить` | Заголовок блока содержит выбранный предмет, виден блок `Показать топ карточек` |
| 5 | `selectTopByRevenue` | В блоке `Показать топ карточек` выбирает `topBy` текущего сценария из `config/scenario.json` и применяет | Слева загружен список карточек, видны кнопки `Добавить` |
| 6 | `parseCompareCardIds` | Из DOM списка рекомендаций собирает 50 уникальных `nm_id` карточек по ссылкам `wildberries.ru/catalog/{id}/detail.aspx` | Получено ровно 50 уникальных ID без дублей |
| 7 | `saveCompareCardIdsToDb` | Сохраняет ID карточек в `wb_analytics.compare_card_recommendations` | В БД записано 50 строк, `COUNT(*) = COUNT(DISTINCT nm_id)` для запуска |
| 8 | `addManualCompareCards` | По `run_id` берет из `wb_analytics.compare_card_recommendations` первые 5 `nm_id` по `rank_position`, которые еще не были зарезервированы/использованы ни в одном прошлом запуске, обновляет страницу, снова нажимает `Сравнить карточки`, оставляет режим `Ввести вручную`, по очереди вводит каждый артикул, нажимает `Enter` и кликает `Добавить` у найденной карточки | Добавлено 5 разных карточек; перед добавлением ID проверены на дубли и глобальное использование, каждый клик `Добавить` привязан к карточке с конкретной ссылкой `/catalog/{nm_id}/detail.aspx` |
| 9 | `reserveCompareCardsForComparison` | До финального submit создает запись пачки в `compare_card_comparison_requests` и помечает 5 выбранных строк в `compare_card_recommendations` | У 5 строк стоит `used_for_comparison = true`, заполнены `comparison_request_id`, `comparison_slot`, `used_at`; если процесс упадет после этого, следующий запуск не возьмет эти SKU повторно |
| 10 | `attachComparisonApiCapture` | До финального submit включает перехват WB API `history` и `nms/detail` на текущей странице | Ответы отчета после submit и после выбора квартала будут доступны парсеру |
| 11 | `submitCompareCards` | Ждет счетчик `Карточки для сравнения: 5 из 5`, проверяет активность верхней кнопки `Сравнить карточки` и нажимает ее | WB открывает созданный отчет или показывает сигнал созданного сравнения |
| 12 | `markCompareCardsComparisonSubmitted` | После успешного submit проставляет `submitted_at` у созданной записи пачки | В `compare_card_comparison_requests` зафиксирован факт успешной отправки |
| 13 | `parseOpenedComparisonReport` | Ждет открытый отчет после submit и строит описание отчета из 5 отправленных `nm_id` без чтения истории | Видна кнопка `История сравнений`, отчет привязан к текущему `comparison_request_id` |
| 14 | `saveSubmittedComparisonReportToDb` | Сохраняет открытый отчет в `wb_analytics.compare_card_reports` и 5 SKU в `wb_analytics.compare_card_report_items` под тем же `run_id` | В БД записан отчет, связанный с только что созданной пачкой |
| 15 | `selectComparisonQuarterPeriod` | Нажимает кнопку `Квартал` в открытом отчете сравнения | Кнопка `Квартал` видна, блок `Данные за период...` обновлен |
| 16 | `parseOpenedComparisonChartDailyFromApi` | Берет captured WB `nms/detail` для открытого отчета и 5 отправленных `nm_id`, раскладывает 15 полей `salesFunnel.byDay` по `metric_name`, `nm_id`, `metric_date` | Найден captured detail response для этих SKU и квартального периода |
| 17 | `saveComparisonChartDailyToDb` | Сохраняет дневные точки всех 15 разделов в `wb_analytics.compare_card_report_chart_daily` | В PostgreSQL записаны точки с `source = api_sales_funnel` |

## Сценарий "Следующая пятерка из сохраненного пула"

Этот сценарий не собирает 50 рекомендаций заново. Он берет уже сохраненный source-run, выбирает следующие 5 глобально неиспользованных SKU и дальше выполняет тот же хвост: ручной ввод, submit, открытый отчет, `Квартал`, captured `salesFunnel.byDay`.

| N | Функция | Что делает | Проверка успешности |
|---|---|---|---|
| 1 | `openCompareCardsPage` | Открывает страницу сравнения карточек | Заголовок страницы `Сравнение карточек` |
| 2 | `createCompareCardsNextRun` | Создает новый `automation.runs` со ссылкой на source-run; если `SOURCE_RUN_ID` не задан, выбирает последний пул по `subject/topBy` с минимум 5 доступными SKU | Новый run имеет `scenario_name = compare_cards_next`, в `scenario_config` записан `sourceRunId` |
| 3 | `loadNextCompareCardIds` | Берет из source-run следующие 5 `nm_id`, исключая любые SKU, уже использованные глобально | Получено ровно 5 ID |
| 4 | `startCompareCards` | Открывает форму сравнения карточек | Видна форма ручного добавления |
| 5 | `addManualCompareCardIds` | Вводит 5 SKU через поле `Введите артикул WB` и кликает `Добавить` у найденных карточек | Счетчик карточек доходит до `5 из 5` |
| 6 | `reserveCompareCardsForComparison` | Создает request в новом run, но помечает использованными строки source-run | У source-run строк заполнены `used_for_comparison`, `comparison_request_id`, `comparison_slot`, `used_at` |
| 7 | `attachComparisonApiCapture` | Включает перехват WB API | Ответы отчета доступны парсеру |
| 8 | `submitCompareCards` | Нажимает финальную кнопку `Сравнить карточки` | Открывается созданный отчет |
| 9 | `markCompareCardsComparisonSubmitted` | Проставляет `submitted_at` у request | В БД зафиксирован успешный submit |
| 10 | `parseOpenedComparisonReport` | Строит запись отчета по открытой странице и 5 отправленным SKU | Отчет привязан к текущему request |
| 11 | `saveSubmittedComparisonReportToDb` | Сохраняет отчет и 5 SKU под новым run | В БД записаны report/items |
| 12 | `selectComparisonQuarterPeriod` | Нажимает `Квартал` | Период обновлен |
| 13 | `parseOpenedComparisonChartDailyFromApi` | Берет captured `nms/detail` для этих 5 SKU | Получены дневные точки |
| 14 | `saveComparisonChartDailyToDb` | Сохраняет long-format точки графика | В БД записаны chart rows |

## Сценарий "Готовые сравнения карточек"

Это read-only сценарий. Он открывает ту же страницу `https://seller.wildberries.ru/platform-analytics/cards-comparison`, но не нажимает `Сравнить карточки`.

Цель: минимально прочитать один видимый блок готового сравнения без скролла и массового обхода. Сценарий сохраняет плашку вида `Доступен до 26 июня, 15:41`, 5 SKU из первого сверху видимого блока на текущем экране, одним кликом входит в этот отчет, выбирает период `Квартал` и сохраняет дневные значения из уже загруженного WB-ответа `salesFunnel.byDay`.

| N | Функция | Что делает | Проверка успешности |
|---|---|---|---|
| 1 | `openCompareCardsPage` | После авторизации переходит по ссылке `https://seller.wildberries.ru/platform-analytics/cards-comparison` | Заголовок страницы `Сравнение карточек` |
| 2 | `parseExistingComparisonList` | Парсит текущий DOM без скролла: дату сравнения, `available_until_text`, нормализованный `available_until_at`, количество SKU, preview SKU и `raw_text` блока | Найден первый сверху видимый блок с ровно 5 SKU |
| 3 | `saveVisibleComparisonReportToDb` | Сохраняет один выбранный блок в `wb_analytics.compare_card_reports`, его 5 SKU в `wb_analytics.compare_card_report_items`, переводит run в `success` | В PostgreSQL записан 1 отчет и 5 items |
| 4 | `openVisibleComparisonReport` | Кликает по выбранной строке сравнения, найденной по `available_until_text` и первому `nm_id` | Появилась кнопка `История сравнений`, значит открыт экран отчета |
| 5 | `selectComparisonQuarterPeriod` | Нажимает кнопку `Квартал` в открытом отчете сравнения | Кнопка `Квартал` видна, блок `Данные за период...` обновлен |
| 6 | `parseComparisonChartDailyFromApi` | Не кликает разделы графика и не читает SVG; берет captured response, который WB-фронт уже получил для открытого отчета и периода `Квартал`, и раскладывает 15 полей `salesFunnel.byDay` по `metric_name`, `nm_id`, `metric_date` | Найден captured `history` для этих 5 SKU и captured `nms/detail` для выбранного квартала |
| 7 | `saveComparisonChartDailyToDb` | Сохраняет дневные точки всех 15 разделов в `wb_analytics.compare_card_report_chart_daily` и добавляет краткую chart-сводку в `automation.runs.scenario_config` | В PostgreSQL записаны точки с `source = api_sales_funnel` |

## Инциденты

Если сценарий падает, ошибка должна классифицироваться.

Базовые классы инцидентов:

- `auth_expired` — слетела авторизация;
- `captcha` — появилась капча или экран WB `Подозрительная активность`;
- `selector_changed` — изменился интерфейс или текст кнопки;
- `popup_blocking` — модалка перекрыла нужный элемент;
- `timeout` — страница или список не загрузились;
- `business_limit` — закончился лимит сравнений;
- `empty_result` — по нише нет карточек;
- `invalid_niche_url` — прямая ссылка отчета не открыла ожидаемую нишу;
- `schema_changed` — страница открылась, но структура данных не похожа на ожидаемую;
- `unknown_screen` — экран не похож на ожидаемый.

## Логи

Смысл такой:

- Airflow показывает, что упал task `run_compare_cards_flow`;
- внутренний step-log показывает, на каком именно шаге и почему;
- `incident_type` показывает, к какому классу отнести проблему: `auth_expired`, `captcha`, `selector_changed`, `popup_blocking`, `timeout`, `business_limit`, `empty_result`, `invalid_niche_url`, `schema_changed`, `unknown_screen`.
