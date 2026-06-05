import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
  /** Вызывается при каждом раскрытии секции (удобно для подгрузки данных). */
  onOpen?: () => void
}

export default function CollapsibleSection({ 
  title, 
  icon, 
  defaultOpen = false, 
  children, 
  className = "",
  onOpen,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const wasOpenRef = useRef(defaultOpen)

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      onOpen?.()
    }
    wasOpenRef.current = isOpen
  }, [isOpen, onOpen])

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="text-purple-600">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        </div>
        <div className="text-gray-400">
          {isOpen ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>
      
      {isOpen && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="pt-6">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
