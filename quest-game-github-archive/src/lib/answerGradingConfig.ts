/** IMP-LOG-022: конфиг проверки ответов в games.settings.answer_grading */

export type TextMatchMode = 'strict' | 'fuzzy' | 'keywords' | 'numeric' | 'regex'

export type AnswerGradingRouting = 'auto' | 'hybrid' | 'manual'

export type AnswerGradingPresetId = 'strict' | 'soft_text' | 'quest_photo'

export type AnswerGradingRegex = {
  pattern: string
  flags?: string
}

export type AnswerGradingJury = {
  enabled: boolean
  required_votes: number
}

/** Подмножество answer_grading на уровне вопроса (IMP-LOG-022 фаза 4). */
export type QuestionGradingOverride = Partial<
  Pick<
    AnswerGradingConfig,
    | 'normalize'
    | 'text_match'
    | 'fuzzy'
    | 'keywords'
    | 'numeric'
    | 'regex'
    | 'routing'
    | 'resubmit'
  >
>

export type AnswerGradingConfig = {
  version: 1
  normalize: {
    ignore_case: boolean
    collapse_whitespace: boolean
    ignore_punctuation: boolean
    yo_to_e: boolean
    translit: boolean
  }
  text_match: TextMatchMode
  fuzzy?: {
    short_word_max_len: number
    max_distance_short: number
    penalty_percent: number
  }
  keywords?: {
    min_match: number
  }
  numeric?: {
    tolerance_percent: number
    allow_leading_zeros: boolean
  }
  regex?: AnswerGradingRegex
  jury?: AnswerGradingJury
  mcq: {
    partial_credit: boolean
  }
  routing: AnswerGradingRouting
  pending_display: 'zero_with_badge'
  resubmit?: {
    penalty_percent: number
  }
}

export const ANSWER_GRADING_BASELINE: AnswerGradingConfig = {
  version: 1,
  normalize: {
    ignore_case: true,
    collapse_whitespace: true,
    ignore_punctuation: false,
    yo_to_e: false,
    translit: false,
  },
  text_match: 'strict',
  fuzzy: {
    short_word_max_len: 8,
    max_distance_short: 1,
    penalty_percent: 15,
  },
  mcq: { partial_credit: true },
  routing: 'auto',
  pending_display: 'zero_with_badge',
}

export const ANSWER_GRADING_PRESETS: Record<
  AnswerGradingPresetId,
  { label: string; description: string; config: AnswerGradingConfig }
> = {
  strict: {
    label: 'Как сейчас (строго)',
    description: 'Точное совпадение после trim и lower, как до IMP-LOG-022.',
    config: ANSWER_GRADING_BASELINE,
  },
  soft_text: {
    label: 'Мягкий текст',
    description:
      'Игнор пунктуации и ё/е; опечатки в коротких словах (≤8) со штрафом 15%.',
    config: {
      ...ANSWER_GRADING_BASELINE,
      normalize: {
        ...ANSWER_GRADING_BASELINE.normalize,
        ignore_punctuation: true,
        yo_to_e: true,
      },
      text_match: 'fuzzy',
    },
  },
  quest_photo: {
    label: 'Фото-квест (гибрид)',
    description:
      'Текст проверяется автоматически; фото/видео без текста — в очередь модерации.',
    config: {
      ...ANSWER_GRADING_BASELINE,
      routing: 'hybrid',
    },
  },
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function readBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function readNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

const TEXT_MATCH_MODES: TextMatchMode[] = [
  'strict',
  'fuzzy',
  'keywords',
  'numeric',
  'regex',
]

function readTextMatch(v: unknown, fallback: TextMatchMode): TextMatchMode {
  return typeof v === 'string' && TEXT_MATCH_MODES.includes(v as TextMatchMode)
    ? (v as TextMatchMode)
    : fallback
}

const ROUTING_MODES: AnswerGradingRouting[] = ['auto', 'hybrid', 'manual']

function readRouting(v: unknown, fallback: AnswerGradingRouting): AnswerGradingRouting {
  return typeof v === 'string' && ROUTING_MODES.includes(v as AnswerGradingRouting)
    ? (v as AnswerGradingRouting)
    : fallback
}

/** Парсит сырой JSON; отсутствие блока → baseline. */
export function parseAnswerGrading(raw: unknown): AnswerGradingConfig {
  if (!isRecord(raw)) return { ...ANSWER_GRADING_BASELINE }

  const n = isRecord(raw.normalize) ? raw.normalize : {}
  const f = isRecord(raw.fuzzy) ? raw.fuzzy : {}
  const k = isRecord(raw.keywords) ? raw.keywords : {}
  const num = isRecord(raw.numeric) ? raw.numeric : {}
  const rx = isRecord(raw.regex) ? raw.regex : {}
  const j = isRecord(raw.jury) ? raw.jury : {}
  const m = isRecord(raw.mcq) ? raw.mcq : {}
  const r = isRecord(raw.resubmit) ? raw.resubmit : {}
  const base = ANSWER_GRADING_BASELINE
  const resubmitPct = Math.max(
    0,
    Math.min(100, readNumber(r.penalty_percent, 0))
  )

  return {
    version: 1,
    normalize: {
      ignore_case: readBool(n.ignore_case, base.normalize.ignore_case),
      collapse_whitespace: readBool(
        n.collapse_whitespace,
        base.normalize.collapse_whitespace
      ),
      ignore_punctuation: readBool(
        n.ignore_punctuation,
        base.normalize.ignore_punctuation
      ),
      yo_to_e: readBool(n.yo_to_e, base.normalize.yo_to_e),
      translit: readBool(n.translit, base.normalize.translit),
    },
    text_match: readTextMatch(raw.text_match, base.text_match),
    fuzzy: {
      short_word_max_len: readNumber(
        f.short_word_max_len,
        base.fuzzy!.short_word_max_len
      ),
      max_distance_short: readNumber(
        f.max_distance_short,
        base.fuzzy!.max_distance_short
      ),
      penalty_percent: readNumber(
        f.penalty_percent,
        base.fuzzy!.penalty_percent
      ),
    },
    keywords: {
      min_match: Math.max(1, readNumber(k.min_match, 1)),
    },
    numeric: {
      tolerance_percent: Math.max(0, readNumber(num.tolerance_percent, 0)),
      allow_leading_zeros: readBool(num.allow_leading_zeros, false),
    },
    ...(typeof rx.pattern === 'string' && rx.pattern.trim()
      ? {
          regex: {
            pattern: rx.pattern.trim(),
            flags: typeof rx.flags === 'string' ? rx.flags : '',
          },
        }
      : {}),
    ...(readBool(j.enabled, false)
      ? {
          jury: {
            enabled: true,
            required_votes: Math.max(2, Math.floor(readNumber(j.required_votes, 2))),
          },
        }
      : {}),
    mcq: {
      partial_credit: readBool(m.partial_credit, base.mcq.partial_credit),
    },
    routing: readRouting(raw.routing, base.routing),
    pending_display: 'zero_with_badge',
    ...(resubmitPct > 0 ? { resubmit: { penalty_percent: resubmitPct } } : {}),
  }
}

export function parseAnswerGradingFromSettings(settings: unknown): AnswerGradingConfig {
  if (!isRecord(settings)) return { ...ANSWER_GRADING_BASELINE }
  return parseAnswerGrading(settings.answer_grading)
}

export function resolveAnswerGrading(raw: unknown): AnswerGradingConfig {
  return parseAnswerGrading(raw)
}

export function configMatchesPreset(
  config: AnswerGradingConfig,
  presetId: AnswerGradingPresetId
): boolean {
  const preset = ANSWER_GRADING_PRESETS[presetId].config
  return JSON.stringify(config) === JSON.stringify(preset)
}

export function detectAnswerGradingPreset(
  config: AnswerGradingConfig
): AnswerGradingPresetId | 'custom' {
  if (configMatchesPreset(config, 'strict')) return 'strict'
  if (configMatchesPreset(config, 'soft_text')) return 'soft_text'
  if (configMatchesPreset(config, 'quest_photo')) return 'quest_photo'
  return 'custom'
}

export function presetAnswerGrading(
  presetId: AnswerGradingPresetId
): AnswerGradingConfig {
  const src = ANSWER_GRADING_PRESETS[presetId].config
  return {
    ...src,
    fuzzy: src.fuzzy ? { ...src.fuzzy } : undefined,
    keywords: src.keywords ? { ...src.keywords } : undefined,
    numeric: src.numeric ? { ...src.numeric } : undefined,
    regex: src.regex ? { ...src.regex } : undefined,
    jury: src.jury ? { ...src.jury } : undefined,
    normalize: { ...src.normalize },
    mcq: { ...src.mcq },
    resubmit: src.resubmit ? { ...src.resubmit } : undefined,
  }
}

/** Парсит questions.grading_override (частичный JSON). */
export function parseQuestionGradingOverride(
  raw: unknown
): QuestionGradingOverride | null {
  if (!isRecord(raw) || Object.keys(raw).length === 0) return null

  const ov: QuestionGradingOverride = {}

  if (isRecord(raw.normalize)) {
    ov.normalize = {
      ignore_case: readBool(raw.normalize.ignore_case, true),
      collapse_whitespace: readBool(raw.normalize.collapse_whitespace, true),
      ignore_punctuation: readBool(raw.normalize.ignore_punctuation, false),
      yo_to_e: readBool(raw.normalize.yo_to_e, false),
      translit: readBool(raw.normalize.translit, false),
    }
  }

  if (typeof raw.text_match === 'string') {
    ov.text_match = readTextMatch(raw.text_match, 'strict')
  }

  if (isRecord(raw.fuzzy)) {
    ov.fuzzy = {
      short_word_max_len: readNumber(raw.fuzzy.short_word_max_len, 8),
      max_distance_short: readNumber(raw.fuzzy.max_distance_short, 1),
      penalty_percent: readNumber(raw.fuzzy.penalty_percent, 15),
    }
  }

  if (isRecord(raw.keywords)) {
    ov.keywords = {
      min_match: Math.max(1, readNumber(raw.keywords.min_match, 1)),
    }
  }

  if (isRecord(raw.numeric)) {
    ov.numeric = {
      tolerance_percent: Math.max(0, readNumber(raw.numeric.tolerance_percent, 0)),
      allow_leading_zeros: readBool(raw.numeric.allow_leading_zeros, false),
    }
  }

  if (isRecord(raw.regex) && typeof raw.regex.pattern === 'string') {
    const pattern = raw.regex.pattern.trim()
    if (pattern) {
      ov.regex = {
        pattern,
        flags: typeof raw.regex.flags === 'string' ? raw.regex.flags : '',
      }
    }
  }

  if (typeof raw.routing === 'string') {
    ov.routing = readRouting(raw.routing, 'auto')
  }

  if (isRecord(raw.resubmit)) {
    const pct = Math.max(
      0,
      Math.min(100, readNumber(raw.resubmit.penalty_percent, 0))
    )
    if (pct > 0) ov.resubmit = { penalty_percent: pct }
  }

  return Object.keys(ov).length > 0 ? ov : null
}

/** Как merge_question_answer_grading на сервере — для клиентского превью. */
export function mergeQuestionAnswerGrading(
  gameConfig: AnswerGradingConfig,
  override: QuestionGradingOverride | null | undefined
): AnswerGradingConfig {
  if (!override) return gameConfig

  const merged: AnswerGradingConfig = {
    ...gameConfig,
    normalize: override.normalize
      ? { ...gameConfig.normalize, ...override.normalize }
      : { ...gameConfig.normalize },
    mcq: { ...gameConfig.mcq },
  }

  if (override.text_match) merged.text_match = override.text_match
  if (override.fuzzy) {
    merged.fuzzy = { ...gameConfig.fuzzy!, ...override.fuzzy }
  }
  if (override.keywords) {
    merged.keywords = { ...gameConfig.keywords!, ...override.keywords }
  }
  if (override.numeric) {
    merged.numeric = { ...gameConfig.numeric!, ...override.numeric }
  }
  if (override.regex?.pattern?.trim()) {
    merged.regex = {
      pattern: override.regex.pattern.trim(),
      flags: override.regex.flags ?? '',
    }
  } else if ('regex' in override) {
    delete merged.regex
  }
  if (override.routing) merged.routing = override.routing
  if (override.resubmit?.penalty_percent) {
    merged.resubmit = { penalty_percent: override.resubmit.penalty_percent }
  } else if ('resubmit' in override) {
    delete merged.resubmit
  }

  return merged
}

/** Для INSERT/UPDATE questions — пустой override не пишем. */
export function questionGradingOverrideStorageValue(
  override: QuestionGradingOverride | null | undefined
): QuestionGradingOverride | null {
  if (!override) return null
  const cleaned = parseQuestionGradingOverride(override)
  return cleaned
}

/** Для games.settings: baseline не пишем в JSONB. */
export function answerGradingStorageValue(
  config: AnswerGradingConfig
): AnswerGradingConfig | undefined {
  return detectAnswerGradingPreset(config) === 'strict' ? undefined : config
}
