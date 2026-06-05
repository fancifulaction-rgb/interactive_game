const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Provider = 'groq' | 'qwen' | 'deepseek'

type GenerateRequest = {
  topic?: string
  count?: number
  provider?: Provider
  difficulty?: string
  language?: string
}

type RawQuestion = {
  prompt?: string
  type?: string
  answer?: string[] | string
  options?: string[]
  answer_count?: number
  difficulty?: string
  base_points?: number
  hint_levels?: string[]
  hint_penalties?: number[]
}

const PROVIDER_CONFIG: Record<
  Provider,
  { url: string; model: string; envKey: string }
> = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    envKey: 'DASHSCOPE_API_KEY',
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
  },
}

function buildPrompt(req: GenerateRequest): string {
  const topic = (req.topic ?? '').trim() || 'общая эрудиция'
  const count = Math.min(15, Math.max(1, Number(req.count) || 5))
  const difficulty = req.difficulty?.trim() || 'Средний'
  const language = req.language?.trim() || 'ru'

  return `Ты редактор квест-игры для мероприятий. Сгенерируй ровно ${count} вопросов на языке: ${language === 'ru' ? 'русский' : language}.
Тема: «${topic}».
Сложность большинства вопросов: ${difficulty} (допустимо: Легкий, Средний, Сложный).

Типы:
- "text" — один правильный короткий ответ (answer_count: 1, options: [])
- "choice" — 4 варианта, ровно один правильный (answer_count: 1, options из 4 строк, answer — массив из одной правильной строки)

Требования:
- Вопросы разнообразные, без дубликатов, без мата, подходят для корпоратива/зала
- hint_levels: 1 короткая подсказка (строка), hint_penalties: [10]
- base_points: 100

Верни ТОЛЬКО JSON без markdown:
{"questions":[{"prompt":"...","type":"text"|"choice","answer":["..."],"options":[],"answer_count":1,"difficulty":"Средний","base_points":100,"hint_levels":["..."],"hint_penalties":[10]}]}`
}

async function callLlm(provider: Provider, prompt: string): Promise<string> {
  const cfg = PROVIDER_CONFIG[provider]
  const apiKey = Deno.env.get(cfg.envKey)
  if (!apiKey) {
    throw new Error(
      `Секрет ${cfg.envKey} не задан. В Supabase: secrets set ${cfg.envKey}=...`
    )
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: 'system', content: 'Ты возвращаешь только валидный JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.6,
  }

  if (provider === 'deepseek' || provider === 'groq') {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${provider} HTTP ${res.status}: ${text.slice(0, 400)}`)
  }

  let parsed: { choices?: Array<{ message?: { content?: string } }> }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`${provider}: невалидный JSON ответа API`)
  }

  const content = parsed.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error(`${provider}: пустой ответ модели`)
  }
  return content
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error('Модель не вернула JSON-объект')
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
}

function normalizeAnswer(raw: RawQuestion['answer']): string[] {
  if (Array.isArray(raw)) {
    return raw.map((a) => String(a ?? '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

function normalizeQuestion(raw: RawQuestion, index: number) {
  const prompt = String(raw.prompt ?? '').trim()
  if (!prompt) return null

  let type = raw.type === 'choice' ? 'choice' : 'text'
  let options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o ?? '').trim()).filter(Boolean)
    : []

  if (type === 'choice' && options.length < 2) {
    type = 'text'
    options = []
  }

  let answer = normalizeAnswer(raw.answer)
  if (type === 'choice') {
    if (!answer.length && options.length) answer = [options[0]]
    answer = answer.filter((a) => options.includes(a))
    if (!answer.length && options.length) answer = [options[0]]
  } else {
    options = []
    if (!answer.length) return null
  }

  const answerCount = type === 'choice' ? Math.max(2, options.length) : 1
  const difficulty = ['Легкий', 'Средний', 'Сложный'].includes(String(raw.difficulty))
    ? String(raw.difficulty)
    : 'Средний'

  return {
    order_index: index + 1,
    type,
    prompt,
    media_url: null,
    answer,
    options: type === 'choice' ? options : [],
    answer_count: answerCount,
    difficulty,
    base_points: Number(raw.base_points) > 0 ? Number(raw.base_points) : 100,
    hint_levels: Array.isArray(raw.hint_levels)
      ? raw.hint_levels.map((h) => String(h)).filter(Boolean).slice(0, 3)
      : ['Подсказка'],
    hint_penalties: Array.isArray(raw.hint_penalties)
      ? raw.hint_penalties.map((n) => Number(n) || 10).slice(0, 3)
      : [10],
    per_question_time_sec: null as number | null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = (await req.json()) as GenerateRequest
    const provider: Provider =
      body.provider === 'deepseek'
        ? 'deepseek'
        : body.provider === 'qwen'
          ? 'qwen'
          : 'groq'

    const llmText = await callLlm(provider, buildPrompt(body))
    const json = extractJsonObject(llmText)
    const rawList = Array.isArray(json.questions) ? (json.questions as RawQuestion[]) : []

    const questions = rawList
      .map((q, i) => normalizeQuestion(q, i))
      .filter((q): q is NonNullable<typeof q> => q !== null)

    if (!questions.length) {
      throw new Error('Модель не вернула ни одного валидного вопроса')
    }

    return new Response(
      JSON.stringify({ success: true, provider, questions }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
