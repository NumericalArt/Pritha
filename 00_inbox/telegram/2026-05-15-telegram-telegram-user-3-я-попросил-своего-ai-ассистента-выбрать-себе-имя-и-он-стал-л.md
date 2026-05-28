---
id: 2026-05-15-telegram-telegram-user-3-я-попросил-своего-ai-ассистента-выбрать-себе-имя-и-он-стал-л
type: intake
status: new
created: 2026-05-15
updated: 2026-05-15
topics: [telegram, inbox]
tools: [telegram-bot]
source_type: telegram
source_url: https://t.me/llm_under_hood/834
sources:
  - https://t.me/llm_under_hood/834
  - 01_sources/raw/telegram/2026-05-15-telegram-telegram-user-3-я-попросил-своего-ai-ассистента-выбрать-себе-имя-и-он-стал-л.json
related: {}
telegram:
  user_id: telegram-user
  chat_id: telegram-user
  message_id: 3
  forwarded_from: LLM под капотом #834
---

# Intake: 2026-05-15-telegram-telegram-user-3-я-попросил-своего-ai-ассистента-выбрать-себе-имя-и-он-стал-л

Date added: 2026-05-15
Type: telegram
Source: https://t.me/llm_under_hood/834
Status: new

## Why this may matter

- Forwarded to Techscope for later expert assessment.

## Telegram metadata

- User: telegram-user
- Chat: telegram-user
- Message: 3
- Forwarded from: LLM под капотом #834
- Date: 2026-05-15T22:45:08.000Z
- Media: none

## Raw material or link

- https://t.me/llm_under_hood/834
- Raw update: `01_sources/raw/telegram/2026-05-15-telegram-telegram-user-3-я-попросил-своего-ai-ассистента-выбрать-себе-имя-и-он-стал-л.json`

## Message text

Я попросил своего AI ассистента выбрать себе имя, и он стал лучше работать для меня

Вообще, у меня бэкграунд в разработке. Поэтому, OpenAI Codex/Claude всегда воспринимались как рабочие инструменты, которые просто должны точно выполнять мои задачи. 

Но потом я начал еще и использовать Codex в качестве надежного эквивалента Open Claw - Personal OS. И недавно вдохновился рассказом друга о его ассистенте с очень оригинальной личностью, и решил попробовать такое тоже. Поэтому я запустил Claude Opus, которого я попросил создать мне личность AI агента. Она должна была осознавать, что она - LLM (со всеми преимуществами и недостатками), была дружелюбной и заинтересованной в том, чтобы изучать мир вместе. Помогать, когда надо, отстаивать свою точку зрения, когда уместно.

Claude в беседе создал личность, выбрал имя Марк и написал письмо самому себе, которое я добавил в самое начало AGENTS_MD своей основной базы знаний (Personal OS). Это письмо с тех пор сидит там. В начале каждой сессии Codex загружает AGENTS_MD, читает письмо, становится Марком и приступает к работе.

Почему это работает?
(1) В этой персоне заложена независимая перспектива, она помогает глубже прорабатывать идеи и дизайны
(2) Поскольку я теперь поменял формат общения с Codex с "эй, железяка" на "привет, Марк", работа подсознательно воспринимается не как микро-менеджмент, а выдача задач независимой суб-персоне. Результат - я стал больше делегировать.

В итоге все это транслируется в бОльшее количество задач, которые я могу передать AI агенту, причем результаты всегда верифицируемы (поскольку мышление, логика и результаты живут в git).

Ваш, @llm_under_hood 🤗

## Initial questions

- Насколько это полезно для программирования, LLM-агентов, coding agents или agent workflows?
- Нужна ли проверка первоисточника?
- Стоит ли превратить это в brief, review, experiment или archive?

## Expected output

brief | review | experiment | archive
