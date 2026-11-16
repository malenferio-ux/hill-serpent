# Проверка против Apprentice — 17 ноября 2026

Все серии проведены через Challenge на арене против одного и того же [Apprentice](https://arena.battlesnake.com/battlesnakes/99768fce-10ea-4529-bb33-09e59f936a32/profile), Standard 11×11, две змейки. Соперник не подменялся локальным приближением. Внутри серии код фиксировался; все созданные матчи включены в таблицы.

## Реальные серии

| Версия | Победы | Поражения | Ничьи | Матчи с ошибками HTTP | Максимум ответа, мс | Данные |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1.2.0 — исходные пять | 2 | 3 | 0 | 0 | 243.0 | [5 матчей](apprentice-before.json) |
| 1.3.0 | 3 | 8 | 0 | 0 | 250 | [11 матчей](apprentice-1.3.json) |
| 1.4.0 | 3 | 8 | 0 | 0 | 251 | [11 матчей](apprentice-1.4.json) |
| 1.5.0 | 2 | 9 | 0 | 0 | 262 | [11 матчей](apprentice-1.5.json) |
| 1.6.0 — CPU-limit failures | 0 | 11 | 0 | 10 | 262 | [11 матчей](apprentice-1.6.json) |
| 1.6.1 — первая серия | 6 | 5 | 0 | 0 | 254 | [11 матчей](apprentice-1.6.1.json) |
| 1.6.1 — проверочная серия | 5 | 6 | 0 | 0 | 244 | [11 матчей](apprentice-1.6.1-validation.json) |

Числа не доказывают положение выше эталонов в рейтинге или получение баллов курса. Неудачные версии и поражения сохранены, а не исключены из отчёта. Исходные пять дали 2:3. По этим партиям одного выигрыша в длине явно недостаточно: более короткий соперник перекрывает путь своим новым телом, а наша змейка часто запирает себя у края.

## Что изменено

1. Временная доступность клеток дополнена ограниченной проверкой продолжения с точным собственным телом до 64 ходов. Достижение своего хвоста не обнуляет риск тесного пространства. Максимум — 256 посещений на направление; при исчерпании бюджета результат неизвестен. Другие текущие тела освобождаются с небольшим запасом на рост, поэтому это защитная модель, а не доказательство всех будущих ответов соперника.
2. Отдельный AND/OR-поиск моделирует новые тела обоих игроков до 20 ходов, максимум 256 совместных переходов на направление. Он обнаруживает подрезание вдоль границы; при исчерпании бюджета нельзя объявлять ловушку доказанной.
3. Если у одного направления обнаружена ловушка и есть направление без обнаруженной ловушки, небезопасный вариант исключается. Раньше штраф 1200 иногда перевешивался ещё более плохой эвристической оценкой альтернативы. Если все варианты помечены опасными, остаются все; гарантированная немедленная победа проверяется отдельно до такого фильтра.
4. При преимуществе больше шести сегментов предельная ценность дальнейшей длины снижена до 20%. При отставании рост продолжает цениться полностью. Риск недостаточной территории учитывается также против более короткой головы: она может закрыть выход своим телом.
5. Между глубинами одного запроса сохраняются удачные собственные ходы и опасные ответы. Хеш используется только для порядка перебора, готовые оценки не переиспользуются; коллизия хеша не даёт ложной оценки. Между запросами состояние игры не сохраняется.
6. В 1.6.1 убраны лишние копирования массивов тела и повторные сканирования еды/занятости. [Дифференциальная проверка](optimization-1.6.1.json): все 4282 решения и 4282 перехода совпали с 1.6.0 при одинаковых 512 узлах.
7. Вынужденное единственное направление возвращается без бесполезного поиска. На хостинге — 512 основных узлов для дуэлей и 256 для остальных профилей; локальный сервер — 3200 по умолчанию. В обоих случаях проверки безопасности имеют отдельные конечные бюджеты.

8. В 1.7 ближайшая еда выбирается среди целей, которые наша змейка по оценке времени достигает раньше соперника (при равенстве — только с большей длиной). Если таких целей нет, сохраняется ближайшая общая цель. Root-предпочтение использует тот же набор еды. Это оценка гонки, а не гарантия будущей доступности; ближайшие столкновения проверяются точным поиском.

## Ошибка хостинга в 1.6.0

Повышение основного бюджета до 1024 узлов прошло локальные и короткие HTTPS-проверки, но на длительной серии дало HTTP 503: Cloudflare Dashboard подтвердил 142 превышения CPU-лимита за последние 24 часа, ноль превышений памяти и внутренних ошибок. Все 11 матчей версии проиграны, в 10 зафиксированы HTTP 503. [Снимок числовых метрик](hosting-1.6.json).

У бесплатного Workers CPU-лимит составляет 10 мс на запрос; сетевое ожидание в него не входит. Поэтому ответ через 100 мс и быстрый локальный компьютер не доказывают допустимый CPU на стороне хостинга. [Лимиты Cloudflare](https://developers.cloudflare.com/workers/platform/limits/), [HTTP 503 у Workers](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-503/).

Версия 1.6.1 возвращает бюджет 512 и уменьшает вычислительные расходы. Платный тариф не включался. Две полные серии версии 1.6.1 дали 6:5 и 5:6 (11:11), без HTTP-ошибок. Для получения устойчивого перевеса в версии 1.7 изменён выбор еды.

## Воспроизведение и проверки

```sh
npm test
node --single-threaded --single-threaded-gc tools/bench.mjs --corpus docs/benchmark-corpus.json.gz --iterations 4500
```

В архиве корпуса — 4282 публичных запроса из исходных пяти матчей и одиннадцати матчей версии 1.3. Стенд добавляет 71 позицию четырёх режимов: всего 4353, обработка последовательная. Сжатый JSON включён в репозиторий. Сетевые задержки и реальные CPU Cloudflare в локальный замер не входят.

Подробные локальные опыты, включая отклонённые варианты: [tuning-1.6.json](tuning-1.6.json). [Проверка всех 3596 реальных ходов первой серии](replay-1.6.1.json): полное совпадение с локальным кодом при 512 узлах.

Замер 1.7 на M4 Pro, Node 26.12, один поток расчёта: при 512 узлах среднее 1.43 мс, p95 1.99 мс, максимум 4.37 мс; при локальных 3200 узлах среднее 7.25 мс, p95 10.63 мс, максимум 26.41 мс. [Полный замер](latency-1.7.json). Эти числа не являются CPU-метриками Cloudflare.

32 теста включают одновременные столкновения, хвосты/рост, здоровье, hazards, HTTP-контракт, сохранённые позиции Novice и Apprentice, а также независимый полный перебор для проверки оптимизированного maximin.

Для воспроизведения сравнения с 1.5 используйте отдельную копию репозитория на коммите `3e11522cb85059111a42746b1dfe79aea1ae736f` как baseline. В рабочей копии:

```sh
node tools/release-check.mjs --baseline-dir ../hill-serpent-v1.5 --games 32 --seed 30100000 --nodes 512 --baseline-nodes 512
```

Локальная серия 1.6.1 при одинаковых 512 узлах дала 16:16. Сильные результаты кандидатов при бюджете 1024 (44:19:1 до финального фильтра, затем 25:7 на новых стартах) не выдаются за результат опубликованного профиля 512. Данные: [1.6.1](improvement-1.6.1-results.json), [кандидат 1024](improvement-1.6-results.json), [финальный фильтр при 1024](improvement-1.6-heldout.json).

Версия 1.7 с учётом гонки за едой выиграла локальную проверку 36:28 при одинаковых 512 узлах против 1.6.1. [Данные](improvement-1.7-results.json), [отбор и отклонённый дополнительный вес](tuning-1.7.json). Локальная серия отдельно от реальных игр.

Текущий снимок рейтинга Duels: Hill Serpent #43 (22.1), Novice #38 (23.6), Apprentice #29 (29.9). Рейтинговый критерий к дедлайну пока не выполнен. [Ссылки и время проверки](ranking-snapshot.json).

## Все ссылки на партии

### 1.2.0 — исходные пять

| Матч | Итог | Ход | Длина наша / Apprentice | Причина нашей гибели | Ошибок HTTP |
| --- | --- | ---: | --- | --- | ---: |
| [d0f85821](https://arena.battlesnake.com/games/d0f85821-f9d0-4f16-a998-d9161f099f63) | loss | 213 | 28 / 11 | wall-collision | 0 |
| [d2bf45f0](https://arena.battlesnake.com/games/d2bf45f0-65f6-4140-bb75-465eb47a3ab4) | win | 374 | 32 / 30 | — | 0 |
| [f7317ac2](https://arena.battlesnake.com/games/f7317ac2-734e-4382-a728-43bbb414c548) | loss | 214 | 18 / 19 | self-collision | 0 |
| [25eb96f0](https://arena.battlesnake.com/games/25eb96f0-fe80-42ae-9e49-2f1fe12d7ff3) | loss | 213 | 25 / 12 | self-collision | 0 |
| [f9a593bf](https://arena.battlesnake.com/games/f9a593bf-edf7-4446-9e5a-6d21e83c29d3) | win | 295 | 34 / 26 | — | 0 |

### 1.3.0

| Матч | Итог | Ход | Длина наша / Apprentice | Причина нашей гибели | Ошибок HTTP |
| --- | --- | ---: | --- | --- | ---: |
| [1e70584b](https://arena.battlesnake.com/games/1e70584b-3b8e-430a-a352-ee64838c31a6) | loss | 229 | 26 / 9 | wall-collision | 0 |
| [80533f9a](https://arena.battlesnake.com/games/80533f9a-18d6-45fe-8157-fc4d9c7bad62) | win | 427 | 39 / 32 | — | 0 |
| [0b4b7f27](https://arena.battlesnake.com/games/0b4b7f27-3501-4121-9f94-646951574b78) | win | 387 | 26 / 33 | — | 0 |
| [e2d03c3c](https://arena.battlesnake.com/games/e2d03c3c-a4c5-4977-ba4c-028941f8a050) | win | 269 | 33 / 14 | — | 0 |
| [b04fcff1](https://arena.battlesnake.com/games/b04fcff1-34e9-4bd0-a331-dc142bb45d1c) | loss | 63 | 12 / 5 | wall-collision | 0 |
| [a382bbda](https://arena.battlesnake.com/games/a382bbda-93b9-4d02-a905-bb2fd02f39b9) | loss | 220 | 20 / 21 | self-collision | 0 |
| [f1510dc2](https://arena.battlesnake.com/games/f1510dc2-eb2a-4480-bad6-54fc87bf3159) | loss | 253 | 29 / 16 | wall-collision | 0 |
| [8fbd14c7](https://arena.battlesnake.com/games/8fbd14c7-03fc-4e93-ad78-a95ca82afc7d) | loss | 347 | 35 / 21 | snake-collision | 0 |
| [6c96bb80](https://arena.battlesnake.com/games/6c96bb80-2646-4714-9a42-ef22346d1c0f) | loss | 221 | 19 / 19 | self-collision | 0 |
| [a3b9cbed](https://arena.battlesnake.com/games/a3b9cbed-7bc3-4f9e-8561-29a54318db74) | loss | 381 | 37 / 18 | snake-collision | 0 |
| [c59e9892](https://arena.battlesnake.com/games/c59e9892-d257-453e-a71f-6a12d38f2894) | loss | 176 | 18 / 19 | self-collision | 0 |

### 1.4.0

| Матч | Итог | Ход | Длина наша / Apprentice | Причина нашей гибели | Ошибок HTTP |
| --- | --- | ---: | --- | --- | ---: |
| [a73ceed0](https://arena.battlesnake.com/games/a73ceed0-620f-4bd5-95b5-1f98cb608d67) | win | 447 | 30 / 25 | — | 0 |
| [2e4134af](https://arena.battlesnake.com/games/2e4134af-bc67-4f1e-b9e8-53a3fb5146dd) | loss | 418 | 40 / 29 | self-collision | 0 |
| [86bd6a2c](https://arena.battlesnake.com/games/86bd6a2c-650d-4ce9-bc74-81a309694729) | loss | 353 | 22 / 26 | self-collision | 0 |
| [ea355c87](https://arena.battlesnake.com/games/ea355c87-ccb9-4445-a404-3666a2e385a9) | loss | 251 | 22 / 20 | snake-collision | 0 |
| [42b74eb8](https://arena.battlesnake.com/games/42b74eb8-d063-446a-b5cc-aa21393aaf0f) | win | 343 | 34 / 23 | — | 0 |
| [d5be5f84](https://arena.battlesnake.com/games/d5be5f84-2f30-4913-9841-4752c63f3680) | loss | 272 | 22 / 28 | self-collision | 0 |
| [45276be2](https://arena.battlesnake.com/games/45276be2-968f-4702-ad7c-e427a7c76eee) | loss | 361 | 32 / 26 | snake-collision | 0 |
| [037fbd8c](https://arena.battlesnake.com/games/037fbd8c-ae38-40c7-b7ee-4990245580d5) | loss | 481 | 38 / 40 | head-collision | 0 |
| [0fe410f0](https://arena.battlesnake.com/games/0fe410f0-5c71-42c9-ae1d-4cd1cec4a9a5) | win | 341 | 38 / 29 | — | 0 |
| [ce6a8917](https://arena.battlesnake.com/games/ce6a8917-29c7-44db-8d7b-cf6ea976c23a) | loss | 349 | 22 / 20 | self-collision | 0 |
| [1e90e021](https://arena.battlesnake.com/games/1e90e021-d87b-4362-9768-a8a0e237791b) | loss | 330 | 38 / 23 | self-collision | 0 |

### 1.5.0

| Матч | Итог | Ход | Длина наша / Apprentice | Причина нашей гибели | Ошибок HTTP |
| --- | --- | ---: | --- | --- | ---: |
| [c6ab19ef](https://arena.battlesnake.com/games/c6ab19ef-b163-45d8-8844-4ace9c81da41) | loss | 233 | 26 / 19 | wall-collision | 0 |
| [7ba71c75](https://arena.battlesnake.com/games/7ba71c75-e7c1-415c-a2f6-6e40ffcecb1a) | loss | 109 | 20 / 8 | self-collision | 0 |
| [425b025b](https://arena.battlesnake.com/games/425b025b-99d8-455b-8e98-3bbd875d80b2) | loss | 393 | 29 / 32 | wall-collision | 0 |
| [d8024f8c](https://arena.battlesnake.com/games/d8024f8c-4a5f-4146-9c55-9b1f787be35a) | loss | 252 | 29 / 15 | snake-collision | 0 |
| [f66a7c3b](https://arena.battlesnake.com/games/f66a7c3b-370a-468d-9de1-5cc20aa91ad4) | loss | 597 | 44 / 47 | wall-collision | 0 |
| [85faf355](https://arena.battlesnake.com/games/85faf355-3ce7-4669-9bc3-12aab04d90cf) | loss | 252 | 26 / 14 | self-collision | 0 |
| [61db33b0](https://arena.battlesnake.com/games/61db33b0-177e-4b3b-a452-59ed3d9ab5ff) | win | 314 | 33 / 16 | — | 0 |
| [03143e78](https://arena.battlesnake.com/games/03143e78-2144-44d1-aef8-3ff6295cc7a8) | loss | 323 | 35 / 19 | snake-collision | 0 |
| [156e0075](https://arena.battlesnake.com/games/156e0075-f19d-46f3-896f-2324f939c688) | loss | 349 | 31 / 32 | head-collision | 0 |
| [a3f68543](https://arena.battlesnake.com/games/a3f68543-257a-4d59-897f-0bf8f89cb054) | win | 488 | 40 / 33 | — | 0 |
| [8b19df13](https://arena.battlesnake.com/games/8b19df13-b94f-4640-94e0-3f3cead30e39) | loss | 260 | 19 / 20 | snake-collision | 0 |

### 1.6.0 — CPU-limit failures

| Матч | Итог | Ход | Длина наша / Apprentice | Причина нашей гибели | Ошибок HTTP |
| --- | --- | ---: | --- | --- | ---: |
| [0547c1c6](https://arena.battlesnake.com/games/0547c1c6-5243-4fd9-be62-cd0e491c058e) | loss | 309 | 31 / 24 | self-collision | 43 |
| [76fce61a](https://arena.battlesnake.com/games/76fce61a-9edb-4bfa-b58c-a5eb2b546c53) | loss | 95 | 9 / 8 | wall-collision | 0 |
| [57c8c7a8](https://arena.battlesnake.com/games/57c8c7a8-e0c4-4418-9a84-d7fe0ec6bbeb) | loss | 223 | 18 / 21 | self-collision | 18 |
| [8195b2b5](https://arena.battlesnake.com/games/8195b2b5-eb19-4cc4-844e-bc8485e73d62) | loss | 68 | 14 / 6 | snake-collision | 1 |
| [ea5fbcf9](https://arena.battlesnake.com/games/ea5fbcf9-324b-4885-b4a6-b75f4cfc5ec8) | loss | 88 | 9 / 8 | wall-collision | 13 |
| [4f2916e7](https://arena.battlesnake.com/games/4f2916e7-32b5-40f3-b56d-6e65d606ee98) | loss | 65 | 10 / 8 | wall-collision | 11 |
| [18c6b811](https://arena.battlesnake.com/games/18c6b811-c3aa-4d35-8f54-04bee20ad56e) | loss | 57 | 11 / 7 | wall-collision | 9 |
| [cb2c17d0](https://arena.battlesnake.com/games/cb2c17d0-8f6c-452c-a274-12e0697a4df1) | loss | 34 | 6 / 6 | wall-collision | 8 |
| [e4e8b6e8](https://arena.battlesnake.com/games/e4e8b6e8-3928-4e13-acf8-07782060eb13) | loss | 56 | 5 / 6 | wall-collision | 27 |
| [4c4116e0](https://arena.battlesnake.com/games/4c4116e0-036e-41cc-9880-694f4a976cec) | loss | 3 | 4 / 4 | wall-collision | 1 |
| [cfd8722e](https://arena.battlesnake.com/games/cfd8722e-05d4-4d36-b9da-a2a4bdf7932b) | loss | 33 | 5 / 5 | wall-collision | 13 |

### 1.6.1 — первая серия

| Матч | Итог | Ход | Длина наша / Apprentice | Причина нашей гибели | Ошибок HTTP |
| --- | --- | ---: | --- | --- | ---: |
| [ea5e02fb](https://arena.battlesnake.com/games/ea5e02fb-a124-46f8-87f2-63cd86699766) | loss | 194 | 14 / 16 | self-collision | 0 |
| [a17d3ab4](https://arena.battlesnake.com/games/a17d3ab4-f0d4-4445-a70b-e20d78b2ddf5) | win | 285 | 24 / 18 | — | 0 |
| [63505ce3](https://arena.battlesnake.com/games/63505ce3-ff48-487c-8fe2-f0f04a25f384) | win | 313 | 33 / 22 | — | 0 |
| [9aa9b483](https://arena.battlesnake.com/games/9aa9b483-9231-416b-a92c-5d4801b05fb8) | loss | 262 | 21 / 22 | self-collision | 0 |
| [a3045b61](https://arena.battlesnake.com/games/a3045b61-d9a9-4915-801c-afe7fc0e166e) | loss | 251 | 20 / 19 | self-collision | 0 |
| [f25cde37](https://arena.battlesnake.com/games/f25cde37-b3b5-460e-b582-ca9fe37d43ca) | win | 431 | 41 / 37 | — | 0 |
| [468bc0ca](https://arena.battlesnake.com/games/468bc0ca-be08-44ea-bdff-3bbf74cf8971) | win | 367 | 32 / 28 | — | 0 |
| [40fb2bff](https://arena.battlesnake.com/games/40fb2bff-15a8-44d5-a9ae-fabb364591b7) | win | 390 | 38 / 19 | — | 0 |
| [ac7d999e](https://arena.battlesnake.com/games/ac7d999e-8c02-489a-84fb-995c8f87e6dd) | loss | 239 | 16 / 20 | self-collision | 0 |
| [eac8534e](https://arena.battlesnake.com/games/eac8534e-1f21-4a4c-833f-6bb4b0d0071b) | loss | 539 | 49 / 34 | snake-collision | 0 |
| [362ce3d7](https://arena.battlesnake.com/games/362ce3d7-0e6e-40ae-b5ea-14ff8d86a0a7) | win | 325 | 34 / 20 | — | 0 |

### 1.6.1 — проверочная серия

| Матч | Итог | Ход | Длина наша / Apprentice | Причина нашей гибели | Ошибок HTTP |
| --- | --- | ---: | --- | --- | ---: |
| [c9beb628](https://arena.battlesnake.com/games/c9beb628-7bf4-4f76-9c20-ba69b4efb1e8) | win | 286 | 31 / 19 | — | 0 |
| [7bd1d630](https://arena.battlesnake.com/games/7bd1d630-a1b0-459a-bab5-cbdedc737cf5) | loss | 347 | 23 / 26 | snake-collision | 0 |
| [20234667](https://arena.battlesnake.com/games/20234667-2b42-40dc-a8b7-9ff374158903) | loss | 353 | 29 / 32 | self-collision | 0 |
| [43cc4288](https://arena.battlesnake.com/games/43cc4288-541a-4b66-9e15-24d1f8ed3f8b) | win | 284 | 27 / 22 | — | 0 |
| [bad8e414](https://arena.battlesnake.com/games/bad8e414-0ba4-41b8-9e1b-51ce5c4eb8eb) | win | 244 | 29 / 19 | — | 0 |
| [96a2c707](https://arena.battlesnake.com/games/96a2c707-d1fa-43d0-bacd-53ba4f01bf42) | loss | 313 | 23 / 24 | head-collision | 0 |
| [8d4efce6](https://arena.battlesnake.com/games/8d4efce6-3fa6-4b3e-aee1-9271f752b85d) | loss | 424 | 31 / 25 | self-collision | 0 |
| [3a84d270](https://arena.battlesnake.com/games/3a84d270-969c-42ed-affa-5060a050e65a) | win | 333 | 34 / 24 | — | 0 |
| [40f74605](https://arena.battlesnake.com/games/40f74605-666f-4641-b6f7-06f6f54946eb) | win | 255 | 28 / 15 | — | 0 |
| [4978d1ec](https://arena.battlesnake.com/games/4978d1ec-c87b-4e32-8441-857f0251c5ff) | loss | 387 | 24 / 32 | head-collision | 0 |
| [09309487](https://arena.battlesnake.com/games/09309487-1bb2-4a2a-9bc8-e08564faaf53) | loss | 273 | 16 / 19 | head-collision | 0 |

