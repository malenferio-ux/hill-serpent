# Hill Serpent

Оригинальная змейка для Battlesnake на JavaScript. Алгоритм и простые соперники
написаны в рамках задания; код чужих соревновательных змеек не использовался.
Внешние LLM, платные API, обучение модели и GPU во время игры не нужны.

**Опубликована:** [hill-serpent.pages.dev](https://hill-serpent.pages.dev).
[Профиль на арене](https://arena.battlesnake.com/battlesnakes/353a87c8-5303-4ead-aa45-38b72b2ba12e/profile).
Подключены Duels, Standard, Royale и Constrictor.

**Версия 1.1.0:** после разбора реального поражения исправлен стимул к росту
в дуэли и добавлена оценка коридоров, которые может перекрыть более длинный
соперник. Проверки и сравнение с 1.0.0: [`docs/improvement-1.1.md`](docs/improvement-1.1.md). Реальные ссылки и проверка
публикации: [`docs/publication.md`](docs/publication.md).

## Быстрый локальный запуск

Нужен Node.js 22+ (рекомендуется 24 LTS). Для локального сервера **не требуется
устанавливать npm-зависимости**.

```sh
npm start
```

Сервер слушает `http://localhost:8080`. Проверка:

```sh
curl http://localhost:8080/
```

Поддерживаются `GET /`, `POST /start`, `POST /move`, `POST /end`, `GET /health`.
Ответ на ход: `{"move":"up"}` с одним из четырёх направлений. Пример входного
запроса находится в `docs/example-request.json`.

```sh
curl -H 'Content-Type: application/json' \
  --data-binary @docs/example-request.json http://localhost:8080/move
```

Другой порт и ограничение работы поиска:

```sh
PORT=8081 SEARCH_NODES=3200 npm start
```

`/move` работает синхронно в одном процессе, без worker threads и подпроцессов.
Лимит по числу узлов ограничивает работу независимо от часов. Для Linux-проверки
с жёстким ограничением одного CPU можно использовать Docker:

```sh
docker build -t hill-serpent .
docker run --rm --cpus=1 -p 8080:8080 hill-serpent
```

Локальный профиль использует 3200 узлов. Замеры приведены в
[`docs/validation.md`](docs/validation.md); время сети в них не учитывается.

## Алгоритм

1. Исключает стены, тела, неосвобождающийся хвост и немедленное истощение.
2. Строит дерево **одновременных** ходов: для своего хода рассматривает ответы
   остальных змеек и выбирает ход с лучшей худшей оценкой (maximin).
3. Углубляет поиск итеративно. При исчерпании бюджета использует последнюю
   полностью законченную глубину; заранее готовит запасной ход с проверкой угроз.
4. Оценивает территорию по времени достижения клеток, свободное место, размер,
   еду, здоровье и число выходов. Учитывает освобождение тела со временем.
5. В симуляции правильно обрабатывает одновременные столкновения, еду,
   дублирование хвоста, урон в hazards и рост в Constrictor.

Режимы: Duels/Standard, Royale, Constrictor. В поиске неизвестные будущие еда и
новые полосы hazards не предсказываются; следующий запрос даёт их реальные
координаты. Поддержка режимов не означает доказанную конкурентоспособность
против сильных участников во всех четырёх таблицах. Squad не поддерживается.

## Проверка и hill climbing

```sh
npm test
npm run bench
npm run arena -- --opponent space --games 40 --seed 900000 --nodes 256
npm run arena -- --opponent search --opponent-nodes 256 --nodes 3200 --games 40 --seed 900000
npm run tune -- --candidates 12 --games 16 --nodes 256 --seed 1000
```

`greedy`, `space`, `hunter` — наши простые соперники; `search` — та же змейка с
заданным бюджетом. **Они не являются эталонами курса** Novice, Apprentice,
Journeyman или Expert. Локальный стенд фиксирует seed и меняет стартовые стороны
в каждой паре. Файлы результатов записываются в `results/`.

Подбор меняет по одному весу и принимает только улучшение тренировочной оценки.
Затем проверяет кандидата на других seed; при ухудшении сохраняет исходные
веса. Выбранные веса записываются в `results/champion.json`; менять рабочую
змейку нужно только после отдельной проверки. История первого опыта сохранена
в `docs/tuning-run.json`.

Можно указать URL **своего или разрешённого для тестирования** HTTP-соперника:

```sh
npm run arena -- --opponent http://localhost:8081 --games 11 --nodes 3200
```

Для независимой проверки скачайте официальный
[Battlesnake CLI](https://github.com/BattlesnakeOfficial/rules/releases/tag/v1.2.3)
для своей ОС и выполните:

```sh
node tools/official-check.mjs --engine /absolute/path/battlesnake --games 4 --mode standard
node tools/official-check.mjs --engine /absolute/path/battlesnake --games 4 --mode royale
node tools/official-check.mjs --engine /absolute/path/battlesnake --games 4 --mode constrictor
node tools/official-check.mjs --engine /absolute/path/battlesnake --games 4 --mode standard --players 4
```

Этот скрипт запускает реальные HTTP-матчи и сравнивает тела, здоровье и
выживших после каждого хода с нашим симулятором. Случайную еду и сужения
генерирует официальный движок. Его seed не следует считать гарантией
побитового воспроизведения всего матча между версиями CLI.

## Публикация

Полная инструкция: [`docs/deploy.md`](docs/deploy.md).

Текущий хостинг — Cloudflare Pages Functions в advanced mode. Ветка `main`
репозитория [malenferio-ux/hill-serpent](https://github.com/malenferio-ux/hill-serpent)
автоматически собирается командой `npm test && npm run bundle`, выходная
папка — `dist/pages`. Для публикации через CLI после входа:

```sh
npm ci
npm run bundle
npm run deploy:pages
```

Конфигурация этого варианта — `wrangler.toml`. Ниже оставлена
альтернатива для отдельного Workers-проекта на `workers.dev`.

Для бесплатного Cloudflare Workers подготовлен `wrangler.worker.toml` с бюджетом
256 узлов. Нужен ваш аккаунт Cloudflare. После входа:

```sh
npm ci
npx wrangler login
npm run deploy:worker
```

Команда покажет действительный HTTPS URL вида
`https://hill-serpent.<ваш-поддомен>.workers.dev`. Покупать домен не требуется.
Это шаблон, а не уже опубликованный адрес. `SEARCH_NODES=3200` оставьте для
локального запуска/VPS: бесплатный Workers ограничивает CPU до 10 мс.
Проверьте реальные CPU-метрики после размещения.

В `dist/worker.js` также есть собранный один файл для вставки в редактор
Cloudflare Dashboard. Пересборка без зависимостей: `npm run bundle`.

На [арене](https://arena.battlesnake.com/) войдите через GitHub, создайте змейку
с полученным URL, проверьте соединение и добавьте её в Duels. Для общего
рейтинга добавьте также Standard, Royale и Constrictor. Подробности и
критерий сдачи: [`docs/submission.md`](docs/submission.md).

**Статус:** публичный код, HTTPS endpoint и участие в четырёх лидербордах
настроены. Результаты отдельных матчей и итоговые баллы оцениваются отдельно;
позиция выше эталонов к дедлайну пока не подтверждена.

## Источники правил

- [Официальный HTTP API](https://docs.battlesnake.com/api/webhooks)
- [Порядок разрешения ходов](https://docs.battlesnake.com/rules)
- [Официальный движок и его исходники](https://github.com/BattlesnakeOfficial/rules)
- [Лимиты Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/)
- [Особенность таймеров Workers](https://developers.cloudflare.com/workers/runtime-apis/performance/)

Исходники движка использовались как спецификация правил; в рабочую змейку
зависимость от него не включена. Лицензия проекта — MIT.
