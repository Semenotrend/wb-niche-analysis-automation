# Запуск WB Niche Analysis Automation с нуля

## 1. Скачать проект

Сначала открой терминал и выполни:

```bash
cd ~/Documents
```

```bash
git clone https://github.com/Semenotrend/wb-niche-analysis-automation.git "Анализ ниши"
```

```bash
cd "Анализ ниши"
```

Проверь, что ты внутри проекта:

```bash
pwd
```

Должно быть примерно:

```text
/Users/твой_пользователь/Documents/Анализ ниши
```

## 2. Проверить Node.js

```bash
node -v
```

Нужен Node.js `20` или новее.

Если Node.js нет, на Mac проще поставить так:

```bash
brew install node
```

## 3. Установить pnpm

```bash
npm install -g pnpm
```

## 4. Установить проект

```bash
pnpm install
```

```bash
pnpm run playwright:install
```

```bash
pnpm run sqlite:init
```

## 5. Настроить нишу

Открой файл:

```bash
open config/scenario.json
```

Там проверь:

```text
category
subject
nicheReportUrl
```

Это та ниша, которую автоматизация будет собирать.

## 6. Авторизоваться в WB Partners

```bash
pnpm run login
```

Откроется браузер.

Войди руками в WB Partners, дождись личного кабинета, потом вернись в терминал и нажми `Enter`.

## 7. Проверить готовность

```bash
pnpm run doctor:sqlite
```

Если в конце будет:

```text
Ready: yes
```

можно запускать сбор.

## 8. Запустить полный прогон

```bash
HEADLESS=false pnpm run niche-report:sqlite
```

```bash
HEADLESS=false pnpm run niche-query-stats:sqlite
```

```bash
HEADLESS=false pnpm run compare-cards:sqlite
```

`HEADLESS=false` значит: браузер будет видимым.

Во время выполнения лучше не кликать в нем руками.

## 9. Посмотреть результат

```bash
pnpm run sqlite:report
```
