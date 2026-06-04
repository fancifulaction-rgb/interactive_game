import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface HintEditorProps {
  hints: string[]
  penalties: number[]
  onHintsChange: (hints: string[]) => void
  onPenaltiesChange: (penalties: number[]) => void
}

export default function HintEditor({ hints, penalties, onHintsChange, onPenaltiesChange }: HintEditorProps) {
  const addHint = () => {
    const newHints = [...hints, '']
    const newPenalties = [...penalties, 10] // Default penalty 10 points
    onHintsChange(newHints)
    onPenaltiesChange(newPenalties)
  }

  const updateHint = (index: number, value: string) => {
    const newHints = [...hints]
    newHints[index] = value
    onHintsChange(newHints)
  }

  const updatePenalty = (index: number, penalty: number) => {
    const newPenalties = [...penalties]
    newPenalties[index] = penalty
    onPenaltiesChange(newPenalties)
  }

  const deleteHint = (index: number) => {
    const newHints = hints.filter((_, i) => i !== index)
    const newPenalties = penalties.filter((_, i) => i !== index)
    onHintsChange(newHints)
    onPenaltiesChange(newPenalties)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Подсказки и штрафы</h3>
        <button
          onClick={addHint}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить подсказку
        </button>
      </div>

      <div className="space-y-3">
        {hints.map((hint, index) => (
          <div key={index} className="flex flex-col sm:flex-row gap-3 p-4 bg-gray-50 rounded-lg">
            {/* Hint text input */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Подсказка {index + 1}
              </label>
              <input
                type="text"
                value={hint}
                onChange={(e) => updateHint(index, e.target.value)}
                placeholder={`Введите подсказку ${index + 1}`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Penalty input */}
            <div className="sm:w-32">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Штраф (очки)
              </label>
              <input
                type="number"
                value={penalties[index] || 10}
                onChange={(e) => updatePenalty(index, Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
                max="100"
                placeholder="10"
              />
            </div>

            {/* Delete button */}
            <div className="sm:w-12 flex items-end">
              <button
                onClick={() => deleteHint(index)}
                className="w-full sm:w-auto p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                title="Удалить подсказку"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {hints.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>Пока нет подсказок. Нажмите "Добавить подсказку" чтобы создать первую.</p>
        </div>
      )}
    </div>
  )
}