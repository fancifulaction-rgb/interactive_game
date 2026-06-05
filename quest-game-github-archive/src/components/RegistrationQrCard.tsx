import { useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { Copy, Check, QrCode } from 'lucide-react'
import { buildTeamRegistrationUrl } from '../lib/registrationUrl'

interface RegistrationQrCardProps {
  gameCode: string
  gameTitle?: string
}

export default function RegistrationQrCard({ gameCode, gameTitle }: RegistrationQrCardProps) {
  const [copied, setCopied] = useState(false)
  const registrationUrl = useMemo(() => buildTeamRegistrationUrl(gameCode), [gameCode])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Скопируйте ссылку:', registrationUrl)
    }
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
            Участники сканируют QR или переходят по ссылке — код игры подставится автоматически.
          </p>
          <p className="text-xs text-gray-500">
            Код: <span className="font-mono font-semibold text-gray-800">{gameCode}</span>
          </p>
          <div className="flex gap-2">
            <input
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
        </div>
      </div>
    </div>
  )
}
