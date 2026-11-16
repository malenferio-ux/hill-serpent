# Публикация 16 ноября 2026

- Публичный код: [malenferio-ux/hill-serpent](https://github.com/malenferio-ux/hill-serpent).
- HTTPS endpoint: [hill-serpent.pages.dev](https://hill-serpent.pages.dev).
- [Профиль Hill Serpent](https://arena.battlesnake.com/battlesnakes/353a87c8-5303-4ead-aa45-38b72b2ba12e/profile).
- [Результат проверки API арены](https://arena.battlesnake.com/battlesnakes/353a87c8-5303-4ead-aa45-38b72b2ba12e/test).

## Подключённые лидерборды

| Режим | Запись Hill Serpent |
| --- | --- |
| Duels | [Открыть](https://arena.battlesnake.com/leaderboards/77212f22-20f5-4e0c-8db6-78844318a9bc/entries/ce0266e5-33d4-4d0f-93f7-950a69213005) |
| Standard | [Открыть](https://arena.battlesnake.com/leaderboards/d692fd01-5376-4060-8c4c-91dc2ecfe3ba/entries/3084d475-d4b1-4836-9252-9c9ffc26e484) |
| Royale | [Открыть](https://arena.battlesnake.com/leaderboards/77ce41bf-12ad-4eac-bac2-b11939fb9b18/entries/dcd69b03-eab0-498e-af9a-0429cf05ca8c) |
| Constrictor | [Открыть](https://arena.battlesnake.com/leaderboards/2997e28a-83a0-41e0-a203-d42108cfe450/entries/e47ac6c3-dd02-4387-8f5d-e24c820e0631) |

Арена подтвердила включение змейки в matchmaking rotation каждого режима.
Для появления полноценной позиции требуется пройти начальные матчи арены.

## Проверки

Скачанный публичный код `src`, `test` и `tools` побайтово совпал с локальными
исходниками. Все 20 тестов прошли и из скачанного репозитория, и при сборке
Cloudflare.

Проверка публичного endpoint: 24 HTTPS-запроса `/move`, все корректны.
Среднее время с сетью — 52,5 мс, p95 — 79,8 мс, максимум — 173,5 мс.
Сырые данные: [`production-smoke.json`](production-smoke.json).

Встроенный тест арены прошёл все 17 проверок четырёх режимов. Задержки `/move`
в этой проверке — от 40 до 137 мс, HTTP 200. Лимит реального хода — 500 мс.
Это фактические замеры, а не гарантия времени ответа при любых условиях.

## Обновления

Cloudflare Pages автоматически собирает изменения в `main`:
`npm test && npm run bundle`, output directory — `dist/pages`.
GitHub Actions также проверяет тесты, задержку и сборку при каждом push.
Рабочий профиль ограничен 256 узлами поиска на запрос.

`wrangler.toml` задаёт Pages-конфигурацию и бюджет 256 узлов. Альтернативное
размещение отдельного Worker настраивается через `wrangler.worker.toml`.

## Пробная дуэль

Создана [дуэль с Novice](https://arena.battlesnake.com/games/a3e1eb4e-07b8-413a-8687-19fd49a29fd2)
на стандартном поле 11×11. При создании арена поставила её в очередь.
Этот Challenge-матч не заменяет рейтинговые игры и не доказывает получение
баллов за позицию в Duels.

Превосходство над эталонами к 28 ноября и бонусы пока не подтверждены.
