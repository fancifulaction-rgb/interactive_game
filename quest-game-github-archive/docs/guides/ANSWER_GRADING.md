# Настраиваемая проверка ответов (answer_grading)

**ID:** [IMP-LOG-022](../IMPROVEMENTS_CATALOG.md)  
**Статус:** спецификация зафиксирована; реализация — по фазам ниже  
**Связано:** [IMP-LOG-001](../IMPROVEMENTS_CATALOG.md) (серверный RPC), [MULTIPLE_ANSWERS.md](MULTIPLE_ANSWERS.md), миграция `013_submit_auto_answer.sql`

---

## 1. Цель

Дать администратору на уровне **игры** выбор режимов проверки ответов (пресеты + группы настроек), не ломая текущее поведение. Источник истины для зачёта и очков — **Postgres** (`grade_auto_answer` / `submit_auto_answer`), не клиент.

Текущее поведение (до IMP-LOG-022) остаётся **дефолтом** при отсутствии блока `settings.answer_grading`.

---

## 2. Текущее состояние (baseline)

| Аспект | Реализация |
|--------|------------|
| Текст (`answer_count = 1`) | `trim` + `lower`, точное совпадение с одним из `questions.answer[]` |
| MCQ (`answer_count > 1`) | Частичный зачёт: 100% / 50% / 30% / 0% |
| Синонимы | Несколько строк в `questions.answer[]` |
| Медиа | `media_urls` сохраняются; на авто-зачёт не влияют |
| Ручная модерация | Не реализована |
| Настройки игры | `games.scoring` — формула очков; `games.settings` — в т.ч. `hide_scoreboard_until_finish` |
| Клиент (превью) | `src/lib/answerGrading.ts` — зеркало логики, не источник истины |

---

## 3. Архитектура: пайплайн из четырёх слоёв

Не «N независимых галочек OR», а **последовательный конвейер**:

```
Ответ игрока
  → [1] Нормализация (несколько флагов, все включённые по порядку)
  → [2] Маршрутизация auto | hybrid | manual (фаза 2+)
  → [3] Стратегия: MCQ partial ИЛИ text_match (одна на игру)
  → [4] calc_auto_question_score × partial_multiplier (+ штрафы fuzzy / resubmit)
  → answers + team_scores
```

### 3.1. Слой «Нормализация» (можно несколько)

| Флаг | Baseline | Фаза |
|------|----------|------|
| `ignore_case` | да (как сейчас) | — |
| `collapse_whitespace` | да (`trim`, как сейчас) | — |
| `ignore_punctuation` | нет | 1 |
| `yo_to_e` | нет | 1 |
| `translit` | нет | 1 (опционально вместе с `yo_to_e`) |

Флаги **суммируются**, конфликтов нет. Порядок применения фиксированный (см. §7).

### 3.2. Слой «Сопоставление текста» (одна стратегия на игру)

Взаимоисключающие режимы (radio в UI, не две галочки):

| `text_match` | Описание | Фаза |
|--------------|----------|------|
| `strict` | Exact после нормализации (**дефолт**) | — |
| `fuzzy` | Опечатки по правилу §5; только `answer_count === 1` | 1 |
| `keywords` | N из M ключевых слов | 2 |
| `numeric` | Числовой допуск (2, 2.0, ±%) | 2 |
| `regex` | Паттерн | 4 |

**Fuzzy не применяется к MCQ** (`answer_count > 1`).

Цепочка при `fuzzy`: сначала **exact** по любому синониму из `answer[]` → затем fuzzy → иначе неверно.

### 3.3. Слой «MCQ»

| Флаг | Дефолт |
|------|--------|
| `mcq.partial_credit` | `true` (50% / 30% как сейчас) |

При `false` — только «всё или ничего» (100% / 0%).

### 3.4. Слой «Маршрутизация» (ручная / гибрид)

| `routing` | Смысл | Фаза |
|-----------|--------|------|
| `auto` | Только автоматика (**дефолт**) | — |
| `hybrid` | Текст/MCQ — авто; медиа без текста → `pending_review` | 2 |
| `manual` | Все ответы в очередь админа | 2 |

**Pending на табло (решение владельца):** `0` очков в `team_scores`, бейдж «ожидает проверки» у команды (`grading_status = pending`).

Дополнительно (не MVP):

| Режим | Фаза |
|-------|------|
| Постфактум «принять ответ» (после раунда) | 3 |
| Жюри / второй админ (средний балл) | 4 |
| Штраф за пересдачу | **3** (не раньше) |

**Per-question override** (`questions.grading_override`) — **не в первых фазах**; только настройка на всю игру.

---

## 4. Хранение конфигурации

Расширение `games.settings` (JSONB), без отдельной колонки:

```json
{
  "hide_scoreboard_until_finish": false,
  "answer_grading": { ... }
}
```

Клонирование игры копирует `settings` целиком (`cloneGame.ts`).

### 4.1. Схема `answer_grading` (version 1)

```typescript
type AnswerGradingConfig = {
  version: 1

  normalize: {
    ignore_case: true          // default — как сейчас
    collapse_whitespace: true  // default
    ignore_punctuation: false
    yo_to_e: false
    translit: false            // латиница ↔ кириллица (ezhik / ёжик)
  }

  /** Одна стратегия на всю игру */
  text_match: 'strict' | 'fuzzy' | 'keywords' | 'numeric' | 'regex'

  fuzzy?: {
    short_word_max_len: 8       // default 8
    max_distance_short: 1       // default 1 — для слов с длиной ≤ short_word_max_len
    /** Слова длиннее short_word_max_len: только exact по этому слову (без fuzzy) */
    penalty_percent: 15         // штраф к partial_multiplier при fuzzy-match
  }

  keywords?: {
    min_match: number           // минимум совпавших терминов из ключа
  }

  numeric?: {
    tolerance_percent: number     // ±% для чисел
    allow_leading_zeros: boolean
  }

  regex?: {
    pattern: string
    flags?: string
  }

  mcq: {
    partial_credit: true        // default
  }

  routing: 'auto' | 'hybrid' | 'manual'  // default: auto

  pending_display: 'zero_with_badge'     // default при hybrid/manual

  /** Только фаза 3 — в v1 отсутствует в UI и RPC */
  resubmit?: {
    penalty_percent: number
  }
}
```

### 4.2. Дефолты и обратная совместимость

Функция `resolve_answer_grading(settings jsonb)` на сервере и `parseAnswerGrading` в `gameSettings.ts` (при реализации):

- Если `settings` пустой или нет `answer_grading` → конфиг **baseline** (эквивалент сегодняшнего `grade_auto_answer`).
- Старые игры без миграции данных работают без изменений.

### 4.3. Расширение `answers` (фаза 2+)

| Поле | Тип | Назначение |
|------|-----|------------|
| `grading_status` | `text` | `auto_accepted` \| `pending` \| `rejected` \| `accepted_manual` |
| `match_tier` | `text` | `exact` \| `fuzzy` \| `partial_mcq` \| `none` |
| `grading_meta` | `jsonb` | distance, matched_key_index, … (опционально) |

`team_scores` учитывает только ответы со статусом, дающим очки (`auto_accepted`, `accepted_manual`). При `pending` — **0** до решения админа.

---

## 5. Правило fuzzy (зафиксировано)

**Область:** только `answer_count === 1`. MCQ без fuzzy.

**Порядок:**

1. Нормализация по флагам игры.
2. Exact: нормализованный ответ игрока совпадает с одним из нормализованных синонимов в `questions.answer[]` → `match_tier = exact`, `partial_multiplier = 1`.
3. Если `text_match !== 'fuzzy'` → стоп, неверно.
4. Fuzzy — **пословно** (split по пробелам после `collapse_whitespace`):
   - Для каждого синонима-ключа: разбить на слова `w₁…wₙ`.
   - Ответ игрока разбить на слова `u₁…uₘ`.
   - Требуется **`n === m`** (то же число слов).
   - Для каждой позиции `i`: слова `wᵢ` и `uᵢ` считаются совпавшими, если:
     - **exact**, или
     - `char_length(wᵢ) ≤ 8` и `char_length(uᵢ) ≤ 8` и **Levenshtein(wᵢ, uᵢ) ≤ 1**, или
     - хотя бы одно слово длиннее 8 символов → **только exact** на этой позиции.
   - Если хотя бы один синоним полностью «покрыт» → зачёт fuzzy: `match_tier = fuzzy`, `partial_multiplier = 1 - penalty_percent/100` (default 0.85 при 15%).
5. Иначе → неверно.

**Однословные ответы** («Москва») — частный случай `n = m = 1`.

**Синонимы:** fuzzy не заменяет массив `answer[]`; админ по-прежнему добавляет «Москва», «столица России»; fuzzy ловит опечатки внутри каждой формулировки.

---

## 6. Пресеты UI (редактор игры)

Секция **«Проверка ответов»** в `GameEditor` (рядом с темой / табло): пресет + группы «Дополнительно».

| Пресет | normalize | text_match | mcq | routing |
|--------|-----------|------------|-----|---------|
| **Как сейчас (строго)** | case + whitespace | `strict` | partial on | `auto` |
| **Мягкий текст** | + punctuation, yo_to_e | `fuzzy` (15%) | partial on | `auto` |
| **Kahoot-like** | case + whitespace | `strict` | partial on | `auto` |
| **Квест с фото** | case + whitespace | `strict` | partial on | `hybrid` (фаза 2) |

Пресет записывает полный объект `answer_grading`; ручные правки в группах перезаписывают отдельные поля.

### 6.1. Правила UI (противоречия)

| Правило | Поведение |
|---------|-----------|
| `text_match` | Одна radio-группа |
| `normalize.*` | Независимые checkbox |
| `routing = manual` | Скрыть/отключить fuzzy, keywords, numeric |
| `routing = hybrid` | Подсказка про табло и pending |
| `games.scoring` | Не дублировать в answer_grading (время, подсказки, сложность) |

---

## 7. Контракт SQL (план реализации)

### 7.1. Новые / изменённые функции

| Функция | Назначение |
|---------|------------|
| `resolve_answer_grading(p_settings jsonb)` | Дефолты + merge с `settings.answer_grading` |
| `normalize_answer_token(p text, p_cfg jsonb)` | Один токен с флагами normalize |
| `normalize_answer_text_array(p jsonb, p_cfg jsonb)` | Замена/обёртка над текущей `normalize_answer_text_array` |
| `grade_text_answer(...)` | strict / fuzzy / keywords / numeric / regex |
| `grade_auto_answer(..., p_cfg jsonb)` | MCQ + ветка `answer_count = 1` через `grade_text_answer` |
| `submit_auto_answer` | Читает `v_game.settings`, передаёт cfg в grading |

### 7.2. Порядок нормализации токена

1. `trim` / collapse internal whitespace (`collapse_whitespace`)
2. `lower` (`ignore_case`)
3. Удаление пунктуации (`ignore_punctuation`) — Unicode-aware, дефисы внутри слов по политике фазы 1
4. `ё` → `е` (`yo_to_e`)
5. Транслит (`translit`) — опционально, таблица ru↔lat для квестов

### 7.3. Очки

`calc_auto_question_score` **не меняет** семантику: на вход `p_partial_multiplier` уже с учётом MCQ partial / fuzzy penalty.

`match_tier` и `grading_status` пишутся в `answers` при вставке (фаза 2+).

---

## 8. Клиент

| Компонент | Роль |
|-----------|------|
| `src/lib/answerGrading.ts` | Паритет с сервером для превью в редакторе (не для прод-зачёта) |
| `src/lib/gameSettings.ts` | `parseAnswerGrading`, `mergeGameSettings`, дефолты |
| `src/lib/saveGameProfile.ts` | Сохранение `settings.answer_grading` |
| `GameEditor.tsx` | UI пресетов и групп |
| `ScoreboardDetailed.tsx` | Бейдж pending (фаза 2) |
| `GamePlay.tsx` | Без изменений hot-path кроме отображения статуса ответа |

---

## 9. Маппинг идей (Kahoot / LMS / квест)

| Идея | Слой / поле | Фаза |
|------|-------------|------|
| Строгое совпадение | `text_match: strict` | baseline |
| Без регистра / пробелов | `normalize` | baseline |
| Игнор пунктуации | `ignore_punctuation` | 1 |
| Несколько формулировок в ключе | `questions.answer[]` | baseline |
| Частичный MCQ | `mcq.partial_credit` | baseline |
| Fuzzy + штраф | `text_match: fuzzy`, `penalty_percent` | 1 |
| Числовой допуск | `numeric` | 2 |
| По ключевым словам | `keywords` | 2 |
| Regex | `regex` | 4 |
| Полностью вручную | `routing: manual` | 2 |
| Авто + ручная для медиа | `routing: hybrid` | 2 |
| Постфактум принять | админ UI | 3 |
| Жюри | второй админ | 4 |
| Медиа без текста → модерация | `hybrid` | 2 |
| Отложенные очки на табло | `pending_display: zero_with_badge` | 2 |
| Штраф пересдачи | `resubmit` | **3** |
| Бонус скорость / подсказки | `games.scoring` | baseline (не answer_grading) |
| Ё/е, транслит | `yo_to_e`, `translit` | 1 |

---

## 10. Фазы внедрения

| Фаза | Содержание | Критерий готовности |
|------|------------|---------------------|
| **0** | Этот документ + IMP-LOG-022 в каталоге | Документация |
| **1** | `answer_grading` в settings; SQL: punctuation, yo_to_e; fuzzy §5; UI пресеты; `gameSettings` + сохранение | e2e текстовый вопрос; старые игры без изменений |
| **2** | `grading_status`, hybrid/manual, badge на табло; keywords, numeric | Pending = 0 + бейдж; админ принимает/отклоняет |
| **3** | Очередь модерации в админке; post-hoc accept; **resubmit penalty** | Пересдача со штрафом |
| **4** | regex; jury; per-question override (если понадобится) | Power-user |

---

## 11. Решения владельца (зафиксировано 2026-06-10)

| Вопрос | Решение |
|--------|---------|
| MVP первой реализации | Мягкий текст: пунктуация, ё/е, fuzzy со штрафом |
| Pending на табло | 0 очков + бейдж «ожидает проверки» |
| UI | Пресеты + группы галочек |
| Штраф за пересдачу | Только **фаза 3** |
| Fuzzy | Только **`answer_count === 1`** |
| Порог fuzzy | **1 символ (Levenshtein) на слово** при длине слова **≤ 8**; слова **> 8** — только exact на этой позиции |
| Override на вопрос | **Нет** в первых фазах; только настройка на всю игру |

---

## 12. Тестирование (черновик)

| Кейс | Ожидание |
|------|----------|
| Игра без `answer_grading` | Как до IMP-LOG-022 |
| «Москва» / «москва» | Верно (baseline) |
| «Москва» / «Москва!» при `ignore_punctuation` | Верно (фаза 1) |
| «ёжик» / «ежик» при `yo_to_e` | Верно (фаза 1) |
| «Москва» / «Масква» при fuzzy | Верно, tier fuzzy, ~85% partial |
| MCQ частичный выбор | 50% / 30% без fuzzy |
| `routing: hybrid` + только фото | pending, 0 в счёте (фаза 2) |

См. также `docs/TEST_BACKLOG.md` — добавить секцию IMP-LOG-022 при старте фазы 1.

---

## 13. Связанные IMP

- **IMP-LOG-006** — множественные варианты в UI/БД (частично есть; MCQ partial в baseline).
- **IMP-LOG-001** — серверный RPC (не менять контракт сессии; расширять grading внутри).
- **IMP-UX-*** — отображение pending на табло (фаза 2).

---

*Версия документа: 2026-06-10. IMP-LOG-022.*
