import { useMemo, useRef, useState } from 'react'
import QRCode from 'react-qr-code'
import { Copy, Check, QrCode } from 'lucide-react'
import { copyTextToClipboard } from '../lib/copyToClipboard'
import { buildTeamRegistrationJoinUrl } from '../lib/registrationUrl'

interface RegistrationQrCardProps {
  joinToken: string
  gameCode?: string | null
  gameTitle?: string
}

export default function RegistrationQrCard({ joinToken, gameCode, gameTitle }: RegistrationQrCardProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const urlInputRef = useRef<HTMLInputElement>(null)
  const registrationUrl = useMemo(() => buildTeamRegistrationJoinUrl(joinToken), [joinToken])

  const copyLink = async () => {
    setCopyError('')
    const ok = await copyTextToClipboard(registrationUrl, urlInputRef.current)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      return
    }
    urlInputRef.current?.focus()
    urlInputRef.current?.select()
    setCopyError('Не удалось скопировать автоматически — выделите ссылку и нажмите Ctrl+C')
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <QrCode className="w-4 h-4 text-indigo-600" />
        QR для регистрации команд
      </div>
      {gameTitle && <p className="text-xs text-gray-500">{gameTitle}</p>}
      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        <div className="bg-white p-2 rounded-lg border border-gray-200 shrink-0">
          <QRCode value={registrationUrl} size={128} level="M" />
        </div>
        <div className="flex-1 w-full space-y-2 min-w-0">
          <p className="text-sm text-gray-600">
            Участники сканируют QR или переходят по ссылке с параметром{' '}
            <span className="font-mono text-xs">join</span> — без него регистрация не откроется.
          </p>
          {gameCode && (
            <p className="text-xs text-gray-500">
              Код для ведущего:{' '}
              <span className="font-mono font-semibold text-gray-800">{gameCode}</span>
            </p>
          )}
          <div className="flex gap-2">
            <input
              ref={urlInputRef}
              type="text"
              readOnly
              value={registrationUrl}
              className="flex-1 min-w-0 text-xs px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          {copyError && <p className="text-xs text-amber-700">{copyError}</p>}
        </div>
      </div>
    </div>
  )
}
