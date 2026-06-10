/** IMP-LOG-022: конфиг проверки ответов в games.settings.answer_grading */

export type TextMatchMode = 'strict' | 'fuzzy' | 'keywords' | 'numeric' | 'regex'

export type AnswerGradingRouting = 'auto' | 'hybrid' | 'manual'

export type AnswerGradingPresetId = 'strict' | 'soft_text'

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
  mcq: {
    partial_credit: boolean
  }
  routing: AnswerGradingRouting
  pending_display: 'zero_with_badge'
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
  const m = isRecord(raw.mcq) ? raw.mcq : {}
  const base = ANSWER_GRADING_BASELINE

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
    mcq: {
      partial_credit: readBool(m.partial_credit, base.mcq.partial_credit),
    },
    routing: readRouting(raw.routing, base.routing),
    pending_display: 'zero_with_badge',
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
  return 'custom'
}

export function presetAnswerGrading(
  presetId: AnswerGradingPresetId
): AnswerGradingConfig {
  return {
    ...ANSWER_GRADING_PRESETS[presetId].config,
    fuzzy: { ...ANSWER_GRADING_PRESETS[presetId].config.fuzzy! },
    normalize: { ...ANSWER_GRADING_PRESETS[presetId].config.normalize },
    mcq: { ...ANSWER_GRADING_PRESETS[presetId].config.mcq },
  }
}

/** Для games.settings: baseline не пишем в JSONB. */
export function answerGradingStorageValue(
  config: AnswerGradingConfig
): AnswerGradingConfig | undefined {
  return detectAnswerGradingPreset(config) === 'strict' ? undefined : config
}
