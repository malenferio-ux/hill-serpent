# Публикация и поддомен

## Cloudflare Pages Functions — автоматические обновления

В этом варианте тот же Worker работает в advanced mode Pages Functions.
Поддомен имеет вид `имя.pages.dev`. Отдельный пользовательский API-токен
для Workers Builds не нужен.

1. В Workers & Pages выберите Create → Continue to Pages → Import an existing
   Git repository и укажите публичный репозиторий `malenferio-ux/hill-serpent`.
2. Ветка — `main`, Framework preset — `None`.
3. Build command — `npm test && npm run bundle`.
4. Build output directory — `dist/pages`.
5. Save and Deploy. Дождитесь успешного результата, затем проверьте `/` и
   `POST /move` по полученному реальному URL.

`npm run bundle` создаёт `dist/pages/_worker.js`, который обрабатывает все
запросы, соседний импортируемый `duel.wasm` и `_routes.json`. Новые коммиты в `main` автоматически проходят
тесты и публикуются. Секреты в репозиторий добавлять не требуется.

Для размещения через CLI после входа в Cloudflare:

```sh
npm ci
npm run bundle
npm run deploy:pages
```

Официальная документация:
[advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/).

## Cloudflare Workers Free

1. Создайте аккаунт на https://dash.cloudflare.com/sign-up и подтвердите почту.
   Можно выбрать Continue with GitHub. Пароль и принятие условий сервиса
   вводит владелец аккаунта.
2. Создайте пустой **public** репозиторий `hill-serpent` через GitHub.
   Загрузите файлы из корня этого проекта, без `node_modules`, `.wrangler`,
   `.env`, `.dev.vars` и `results`.
3. В папке проекта выполните `npm ci`, затем `npx wrangler login`.
   В открывшемся браузере авторизуйте официальную утилиту Cloudflare.
4. В `wrangler.worker.toml` при желании измените `name` на уникальное имя.
   В `[vars]` можно добавить `SNAKE_AUTHOR = "ваш GitHub логин"`.
5. Выполните `npm run deploy:worker`. При первом размещении Wrangler может предложить
   выбрать поддомен Workers. Используйте бесплатный `workers.dev`.
6. Сохраните **реальный** URL из успешного вывода команды. Проверьте:

```sh
curl https://ИМЯ.ПОДДОМЕН.workers.dev/
curl -H 'Content-Type: application/json' --data-binary @docs/example-request.json \
  https://ИМЯ.ПОДДОМЕН.workers.dev/move
```

Не включайте Cloudflare Access перед ботом: арена должна обращаться к API без
интерактивного входа. Секретов и данных пользователя в этом API нет.

7. На арене создайте змейку с базовым URL (без `/move`) и проверьте соединение.
   Пробный матч должен пройти без таймаутов. Затем вступите в Duels.
8. В Cloudflare откройте Worker → Metrics/Logs. Проверьте CPU, ошибки
   `exceededCpu` и частоту запросов. Free даёт 10 мс CPU/запрос и 100000
   запросов/сутки на аккаунт. Начальное значение `SEARCH_NODES=256` —
   консервативный профиль, но локальные замеры не гарантируют CPU в продакшене.
   Для обычных дуэлей уменьшайте `DUEL_WORK_BUDGET`, для остальных режимов —
   `SEARCH_NODES` или `JS_DUEL_SEARCH_NODES`; затем повторите проверку.

### Без терминала

Используйте Git-интеграцию Pages, описанную выше. Начиная с 1.11.0,
`dist/worker.js` импортирует отдельный `duel.wasm`: вставки только текста JS
недостаточно. Автоматическая сборка включает оба файла. Исходный C и инструкция
его пересборки находятся в [wasm.md](wasm.md).

## Если нужен более глубокий поиск

На VPS или другом постоянно работающем контейнерном хостинге используйте
`Dockerfile` и `SEARCH_NODES=3200`. Контейнер слушает `PORT`, по умолчанию 8080.
HTTPS и поддомен настраиваются средствами выбранного хостинга. Не выбирайте
сервис, который засыпает между запросами: долгий запуск может приводить к
проигрышам по таймауту. Платные тарифы включаются только по выбору владельца.

## Что нельзя считать завершённой публикацией

Запущенный локальный сервер, временный tunnel, успешная сборка и файл
`wrangler.toml` ещё не дают постоянно доступного бота. Нужны успешное размещение,
публичный HTTPS URL и проверка арены. Текущий проект уже опубликован на https://hill-serpent.pages.dev;
проверки и точные результаты находятся в [publication.md](publication.md).

Официальные источники: [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/),
[Wrangler](https://developers.cloudflare.com/workers/wrangler/),
[лимиты](https://developers.cloudflare.com/workers/platform/limits/).

## Текущие бюджеты (версия 1.11.0)

| Профиль | Cloudflare | Локальный Node |
| --- | ---: | ---: |
| Обычная дуэль без hazards, WebAssembly | 1000000 единиц работы | 12000000 единиц работы |
| Потолок узлов Wasm | 40000 | 40000 |
| Дуэль с hazards/Royale/wrapped, JS | 384 узла | 6400 узлов |
| Остальные режимы, JS | 256 узлов | 3200 узлов |

Wasm углубляется до 12, плюс до двух продлений вынужденных ходов.
Счётчик работы учитывает сканирования поля и расширения flood fill и не зависит
от часов. Это не точное измерение CPU. Корневые проверки выживания имеют отдельные
лимиты 256 и 192 на направление. Простой вынужденный ход возвращается сразу.
Переменные окружения перечислены в `.env.example`; облачные значения —
в `wrangler.toml`. Реальные метрики проверяются после размещения.
