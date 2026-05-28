---
id: 2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2
type: intake
status: new
created: 2026-05-17
updated: 2026-05-17
topics: [telegram, inbox]
tools: [telegram-bot]
source_type: telegram
source_url: https://t.me/neuraldeep/2130
sources:
  - https://t.me/neuraldeep/2130
  - 01_sources/raw/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.json
related: {}
telegram:
  user_id: telegram-user
  chat_id: telegram-user
  message_id: 12
  forwarded_from: Валера Ковальский #2130
---

# Intake: 2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2

Date added: 2026-05-17
Type: telegram
Source: https://t.me/neuraldeep/2130
Status: new

## Why this may matter

- Forwarded to Techscope for later expert assessment.

## Telegram metadata

- User: telegram-user
- Chat: telegram-user
- Message: 12
- Forwarded from: Валера Ковальский #2130
- Date: 2026-05-17T10:44:59.000Z
- Media: none

## Raw material or link

- https://t.me/neuraldeep/2130
- Raw update: `01_sources/raw/telegram/2026-05-17-telegram-telegram-user-12-харнесы-умирают-часть-2.json`

## Message text

Харнесы умирают? Часть 2 

Собрал коменты через ллм и чутка обработал

После моего наброса накидали в комментах много чего полезного, собираю в одно место
Главное что унес

Pavel Zloi разнес идею что что-то умирает 
Хайп спадает а технология остается и сидит на своей задаче 
Так было с RAG, агентами, MCP, скиллами, теперь с харнесом 
Все живо просто эволюционировало

ElKornacio ткнул что современный харнес это не про тулинг а про упакованный процесс 
У него имплементация 15-20% времени, ревью и рефакторинг 50-60% и это факт с которым не поспорить
Узкое горлышко не написать код а проверить 
Мой пост был именно про основу кода, ревью и тесты отдельная история и там автоматизация нужна

Mike Shevchenko принес три категории харнеса 
Экзоскелет который двигает руками модели умирает 
Память identity и recall между сессиями не умирает 
Инструменты shell браузер поиск точно не умирает

Vladimir дал простой критерий Харнес нужен если экономит время на план дебаг следить за дурилкой 
Если больше ковыряешься чем экономишь значит что-то не так

Kirill B про лень задать вопрос агенту
Это не лень а неготовность брать ответственность за результат 
Проще пнуть мейнтейнера чем принести пуллреквест
Записал себе
Полезности из коментов забрал в сохраненки

Mutation testing через LLM про которое ElKornacio говорил 
LLMorpheus  
Meta ACH разбор 
Cross-model review Claude + Codex Официальный плагин ставится через /plugin marketplace add openai/codex-plugin-cc 
Get Shit Done про который Maxim рассказал Convergency planning через все CLI одновременно Claude, Codex, OpenCode, GLM 
Best practices от Boris Cherny и Anthropic для тех кто еще не видел  
Официальный гайд 

Заголовок был кликбейтным признаю 
Умирает излишняя сложность поверх того что модели уже умеют 
Умирают саб-агенты для ревью когда хватает второй сессии кодекса 
Умирают графовые оркестраторы из 50 нод когда работает один реакт цикл 
Умирают тысячестрочные AGENT.md когда хватает 200 строк с context7, web_search, playwright

Не умирает упакованный процесс, память между сессиями и cross-model review на объемных задачах
Сначала собери процесс руками на одном CC или Codex с парой промптов 
Упираешься в потолок и теряешь время на копипасты бери харнес типа GSD Харнес жрет больше времени чем экономит выкидывай и возвращайся к простоте
Чем проще велосипед тем лучше и надежнее едет Но если везешь 150к строк кода с брейк ченджами велосипед не подойдет нужен грузовик

Спасибо всем кто накидал, пишите что у вас работает, собираем общую картину

## Initial questions

- Насколько это полезно для программирования, LLM-агентов, coding agents или agent workflows?
- Нужна ли проверка первоисточника?
- Стоит ли превратить это в brief, review, experiment или archive?

## Expected output

brief | review | experiment | archive
