import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const MAX_IMAGE_DIMENSION = 2560

/** Целевой размер изображения в Storage после сжатия. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** Максимальный размер исходного фото до сжатия (админ и игрок). */
export const SOURCE_MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** Лимит объекта в Supabase Storage (buckets question-media и answer-media). */
export const BUCKET_MAX_BYTES = 100 * 1024 * 1024

/** Максимальный размер исходного видео до сжатия. */
export const SOURCE_MAX_VIDEO_BYTES = 500 * 1024 * 1024

/** Порог предупреждения: сжатие может занять несколько минут. */
export const LARGE_VIDEO_WARN_BYTES = 200 * 1024 * 1024

/** Видео меньше этого порога грузим без перекодирования. */
const SKIP_VIDEO_COMPRESS_BELOW = 10 * 1024 * 1024

const IMAGE_QUALITY_START = 0.92
const IMAGE_QUALITY_MIN = 0.78
const IMAGE_QUALITY_STEP = 0.04

const FFMPEG_CORE_VERSION = '0.12.6'

export type CompressProgressFn = (pct: number, label: string) => void

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null

async function loadFfmpeg(onProgress?: CompressProgressFn): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    onProgress?.(8, 'Загружаем модуль сжатия видео…')
    const ffmpeg = new FFmpeg()
    const baseURL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  try {
    return await ffmpegLoadPromise
  } catch (err) {
    ffmpegLoadPromise = null
    throw err
  }
}

function videoInputExt(name: string): string {
  const m = name.match(/\.(mp4|m4v|webm|mov|avi|mkv)$/i)
  return m ? m[0].toLowerCase() : '.mp4'
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось декодировать изображение'))
    }
    img.src = url
  })
}

async function encodeCanvasToFile(
  canvas: HTMLCanvasElement,
  baseName: string,
  maxBytes: number
): Promise<File | null> {
  const tryTypes: { type: string; ext: string }[] = [
    { type: 'image/webp', ext: 'webp' },
    { type: 'image/jpeg', ext: 'jpg' },
  ]

  for (const { type, ext } of tryTypes) {
    let quality = IMAGE_QUALITY_START
    while (quality >= IMAGE_QUALITY_MIN - 0.001) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, quality)
      )
      if (!blob) break
      if (blob.size <= maxBytes) {
        return new File([blob], `${baseName}.${ext}`, { type, lastModified: Date.now() })
      }
      quality -= IMAGE_QUALITY_STEP
    }
  }
  return null
}

function drawToCanvas(
  source: ImageBitmap | HTMLImageElement,
  maxDim: number
): { canvas: HTMLCanvasElement; w: number; h: number } {
  const srcW = 'width' in source && 'height' in source && 'close' in source
    ? (source as ImageBitmap).width
    : (source as HTMLImageElement).naturalWidth
  const srcH = 'width' in source && 'height' in source && 'close' in source
    ? (source as ImageBitmap).height
    : (source as HTMLImageElement).naturalHeight
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')
  ctx.drawImage(source, 0, 0, w, h)
  return { canvas, w, h }
}

export async function compressQuestionImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp|gif|bmp)$/i.test(file.name)) {
    return file
  }

  if (file.size > SOURCE_MAX_IMAGE_BYTES) {
    throw new Error(
      `Фото слишком большое (${Math.round(file.size / 1024 / 1024)} МБ). Максимум для загрузки: 20 МБ.`
    )
  }

  const alreadyOptimized =
    file.size <= MAX_IMAGE_BYTES &&
    (/\.(jpe?g|webp)$/i.test(file.name) || /^image\/(jpeg|webp)/i.test(file.type))

  let bitmap: ImageBitmap | null = null
  let imageEl: HTMLImageElement | null = null
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    imageEl = await loadImageElement(file)
  }

  const srcW = bitmap?.width ?? imageEl!.naturalWidth
  const srcH = bitmap?.height ?? imageEl!.naturalHeight
  const fitsDimension = Math.max(srcW, srcH) <= MAX_IMAGE_DIMENSION

  if (alreadyOptimized && fitsDimension) {
    bitmap?.close()
    return file
  }

  const source = bitmap ?? imageEl!
  let { canvas } = drawToCanvas(source, MAX_IMAGE_DIMENSION)
  if (bitmap) bitmap.close()

  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  let out = await encodeCanvasToFile(canvas, base, MAX_IMAGE_BYTES)

  // Если не уложились в 10 МБ при min quality — уменьшаем сторону, не опуская quality сильнее.
  for (let pass = 0; !out && pass < 3; pass++) {
    const smaller = Math.round(canvas.width * 0.85)
    const smallerCanvas = document.createElement('canvas')
    smallerCanvas.width = Math.max(1, smaller)
    smallerCanvas.height = Math.max(1, Math.round((canvas.height * smaller) / canvas.width))
    const ctx = smallerCanvas.getContext('2d')
    if (!ctx) break
    ctx.drawImage(canvas, 0, 0, smallerCanvas.width, smallerCanvas.height)
    canvas = smallerCanvas
    out = await encodeCanvasToFile(canvas, base, MAX_IMAGE_BYTES)
  }

  if (out) return out

  throw new Error(
    'Не удалось сжать фото до 10 МБ без сильной потери качества. Попробуйте уменьшить разрешение вручную.'
  )
}

export async function compressQuestionAudio(file: File): Promise<File> {
  if (file.size <= BUCKET_MAX_BYTES) return file
  throw new Error(
    `Аудио слишком большое (${Math.round(file.size / 1024 / 1024)} МБ). Лимит bucket: 100 МБ.`
  )
}

async function compressQuestionVideo(file: File, onProgress?: CompressProgressFn): Promise<File> {
  if (file.size > SOURCE_MAX_VIDEO_BYTES) {
    throw new Error(
      `Видео слишком большое (${Math.round(file.size / 1024 / 1024)} МБ). Максимум для загрузки: 500 МБ.`
    )
  }

  if (file.size <= SKIP_VIDEO_COMPRESS_BELOW) {
    onProgress?.(100, 'Видео загружается без сжатия')
    return file
  }

  onProgress?.(5, 'Подготавливаем сжатие видео…')
  const ffmpeg = await loadFfmpeg(onProgress)

  const inputName = `input${videoInputExt(file.name)}`
  const outputName = 'output.mp4'
  const base = file.name.replace(/\.[^.]+$/, '') || 'video'

  onProgress?.(12, 'Читаем видео в память…')
  await ffmpeg.writeFile(inputName, await fetchFile(file))

  const crfValues = [26, 28, 30, 32, 34, 36]
  let lastBytes = 0

  try {
    for (let i = 0; i < crfValues.length; i++) {
      const crf = crfValues[i]
      const passBase = 18 + i * 11

      onProgress?.(passBase, `Сжимаем до 720p (проход ${i + 1}/${crfValues.length})…`)

      const progressHandler = ({ progress }: { progress: number }) => {
        const pct = passBase + Math.round(Math.min(1, Math.max(0, progress)) * 9)
        onProgress?.(Math.min(pct, 88), 'Сжимаем видео…')
      }
      ffmpeg.on('progress', progressHandler)

      try {
        await ffmpeg.exec([
          '-i',
          inputName,
          '-vf',
          "scale='min(1280,iw)':min(720,ih):force_original_aspect_ratio=decrease",
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          String(crf),
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          '-y',
          outputName,
        ])
      } finally {
        ffmpeg.off('progress', progressHandler)
      }

      const raw = await ffmpeg.readFile(outputName)
      if (typeof raw === 'string') {
        throw new Error('Не удалось прочитать результат сжатия')
      }

      lastBytes = raw.byteLength
      if (lastBytes <= BUCKET_MAX_BYTES) {
        onProgress?.(95, 'Сжатие завершено')
        return new File([raw.buffer as ArrayBuffer], `${base}.mp4`, {
          type: 'video/mp4',
          lastModified: Date.now(),
        })
      }

      if (i < crfValues.length - 1) {
        await ffmpeg.deleteFile(outputName).catch(() => {})
      }
    }
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }

  throw new Error(
    `После сжатия видео всё ещё ${Math.round(lastBytes / 1024 / 1024)} МБ (лимит Storage: 100 МБ). ` +
      'Укоротите ролик или сожмите его вручную.'
  )
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|bmp)$/i.test(file.name)
}

function isVideoFile(file: File): boolean {
  return (
    file.type.startsWith('video/') ||
    /\.(mp4|m4v|webm|mov|avi|mkv|wmv|flv|3gp)$/i.test(file.name)
  )
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|ogg|aac|flac|m4a)$/i.test(file.name)
}

/** Максимальный размер исходника до сжатия (для проверки в UI). */
export function maxSourceBytesForFile(file: File): number {
  if (isVideoFile(file)) return SOURCE_MAX_VIDEO_BYTES
  if (isAudioFile(file)) return 10 * 1024 * 1024
  if (isImageFile(file)) return SOURCE_MAX_IMAGE_BYTES
  return BUCKET_MAX_BYTES
}

export async function compressQuestionMedia(
  file: File,
  onProgress?: CompressProgressFn,
  options?: { skipCompress?: boolean }
): Promise<File> {
  if (options?.skipCompress) return file

  // Видео до изображения: неверный MIME (image/jpeg на .mp4) иначе зависает на decode.
  if (isVideoFile(file)) {
    return compressQuestionVideo(file, onProgress)
  }
  if (isImageFile(file)) {
    onProgress?.(10, 'Сжимаем изображение…')
    const out = await compressQuestionImage(file)
    onProgress?.(100, 'Готово')
    return out
  }
  if (isAudioFile(file)) {
    onProgress?.(50, 'Проверяем аудио…')
    const out = await compressQuestionAudio(file)
    onProgress?.(100, 'Готово')
    return out
  }
  return file
}

/** Подтверждение для больших видео (>200 МБ). true = продолжить. */
export function confirmLargeVideoUpload(file: File): boolean {
  if (!isVideoFile(file) || file.size <= LARGE_VIDEO_WARN_BYTES) return true
  const mb = Math.round(file.size / (1024 * 1024))
  return window.confirm(
    `Файл «${file.name}» (${mb} МБ) большой. Сжатие может занять несколько минут и нагрузить браузер. Продолжить?`
  )
}
