/** Копирование текста: Clipboard API, затем execCommand (работает без HTTPS / без разрешения). */
export async function copyTextToClipboard(
  text: string,
  selectElement?: HTMLInputElement | HTMLTextAreaElement | null
): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallback ниже
    }
  }

  if (selectElement) {
    selectElement.focus()
    selectElement.select()
    selectElement.setSelectionRange(0, text.length)
    try {
      return document.execCommand('copy')
    } catch {
      return false
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
