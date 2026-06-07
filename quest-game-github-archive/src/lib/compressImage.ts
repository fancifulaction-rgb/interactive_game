const MAX_AVATAR_BYTES = 400 * 1024
const MAX_DIMENSION = 512

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

/** Сжимает изображение для аватара (JPEG, до ~400 КБ). */
export async function compressImageForAvatar(file: File): Promise<File> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) return file

  let bitmap: ImageBitmap | null = null
  let imageEl: HTMLImageElement | null = null
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    imageEl = await loadImageElement(file)
  }
  const srcW = bitmap?.width ?? imageEl!.naturalWidth
  const srcH = bitmap?.height ?? imageEl!.naturalHeight
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
  } else {
    ctx.drawImage(imageEl!, 0, 0, w, h)
  }

  let quality = 0.85
  let blob: Blob | null = null
  for (let i = 0; i < 6; i++) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob) break
    if (blob.size <= MAX_AVATAR_BYTES || quality <= 0.45) break
    quality -= 0.08
  }

  if (!blob) return file
  const base = file.name.replace(/\.[^.]+$/, '') || 'avatar'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
