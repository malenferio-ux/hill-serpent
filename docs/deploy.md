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
запросы, и `_routes.json`. Новые коммиты в `main` автоматически проходят
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
2. Установите/подключите GitHub в Codex для автоматической публикации исходников
   либо создайте пустой **public** репозиторий `hill-serpent` через GitHub.
   Загрузите файлы из корня этого проекта, без `node_modules`, `.wrangler`,
   `.env`, `.dev.vars` и `results`.
3. В папке проекта выполните `npm ci`, затем `npx wrangler login`.
   В открывшемся браузере авторизуйте официальную утилиту Cloudflare.
4. В `wrangler.toml` при желании измените `name` на уникальное имя.
   В `[vars]` можно добавить `SNAKE_AUTHOR = "ваш GitHub логин"`.
5. Выполните `npm run deploy`. При первом размещении Wrangler может предложить
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
   При ошибках уменьшите его до 128 и повторите пробный матч.

### Без терминала

В Cloudflare Dashboard откройте Workers & Pages → Create → Worker и выберите
редактор кода. Вставьте содержимое `dist/worker.js`, сохраните и опубликуйте.
В коде уже указан бюджет 256 узлов по умолчанию. Адрес `workers.dev` появится
после публикации. Вкладка Deployments позволяет вернуться к предыдущей версии.

## Если нужен более глубокий поиск

На VPS или другом постоянно работающем контейнерном хостинге используйте
`Dockerfile` и `SEARCH_NODES=3200`. Контейнер слушает `PORT`, по умолчанию 8080.
HTTPS и поддомен настраиваются средствами выбранного хостинга. Не выбирайте
сервис, который засыпает между запросами: долгий запуск может приводить к
проигрышам по таймауту. Платные тарифы включаются только по выбору владельца.

## Что нельзя считать завершённой публикацией

Запущенный локальный сервер, временный tunnel, успешная сборка и файл
`wrangler.toml` ещё не дают постоянно доступного бота. Нужны успешное размещение,
публичный HTTPS URL и проверка арены. Эти результаты пока не заявлены.

Официальные источники: [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/),
[Wrangler](https://developers.cloudflare.com/workers/wrangler/),
[лимиты](https://developers.cloudflare.com/workers/platform/limits/).
