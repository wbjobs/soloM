import { useState, useEffect } from 'react'
import type { DialogScript, DialogLine } from '../../../shared/types'

interface DialogEditorProps {
  script: DialogScript | undefined
  onSave: (script: DialogScript) => void
  onClose: () => void
}

export default function DialogEditor({ script, onSave, onClose }: DialogEditorProps) {
  const [lines, setLines] = useState<DialogLine[]>([])
  const [editingLine, setEditingLine] = useState<number | null>(null)

  useEffect(() => {
    setLines(script?.lines || [{ speaker: '', text: '' }])
  }, [script])

  function handleLineChange(index: number, field: 'speaker' | 'text', value: string) {
    setLines((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function addLine() {
    setLines((prev) => [...prev, { speaker: '', text: '' }])
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function moveLine(index: number, dir: -1 | 1) {
    const next = [...lines]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setLines(next)
  }

  function handleSave() {
    const validLines = lines.filter((l) => l.text.trim())
    if (validLines.length === 0) validLines.push({ speaker: '系统', text: '...' })
    onSave({ lines: validLines })
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-lg shadow-2xl p-4" style={{ background: 'var(--bg-secondary)', border: '2px solid var(--accent-gold-dim)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="pixel-font text-sm" style={{ color: 'var(--accent-gold)' }}>对话编辑</h3>
          <button onClick={onClose} className="text-lg hover:opacity-70" style={{ color: 'var(--text-dim)' }}>✕</button>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {lines.map((line, index) => (
            <div
              key={index}
              className="p-3 rounded-lg"
              style={{
                background: 'var(--bg-primary)',
                border: editingLine === index ? '1px solid var(--accent-gold)' : '1px solid var(--border-color)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="pixel-font text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-gold)' }}>
                  行 {index + 1}
                </span>
                <div className="flex-1" />
                <button onClick={() => moveLine(index, -1)} className="w-7 h-7 rounded hover:bg-opacity-20" style={{ color: 'var(--text-secondary)' }} title="上移">
                  ▲
                </button>
                <button onClick={() => moveLine(index, 1)} className="w-7 h-7 rounded hover:bg-opacity-20" style={{ color: 'var(--text-secondary)' }} title="下移">
                  ▼
                </button>
                <button onClick={() => removeLine(index)} className="w-7 h-7 rounded hover:bg-opacity-20 text-red-400" title="删除">
                  ✕
                </button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] mb-1 pixel-font" style={{ color: 'var(--text-dim)' }}>说话者</label>
                  <input
                    value={line.speaker}
                    onChange={(e) => handleLineChange(index, 'speaker', e.target.value)}
                    placeholder="NPC 名称..."
                    className="w-full px-2 py-1.5 rounded text-sm"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    onFocus={() => setEditingLine(index)}
                    onBlur={() => setEditingLine(null)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] mb-1 pixel-font" style={{ color: 'var(--text-dim)' }}>对话内容</label>
                  <textarea
                    value={line.text}
                    onChange={(e) => handleLineChange(index, 'text', e.target.value)}
                    placeholder="输入对话内容..."
                    rows={2}
                    className="w-full px-2 py-1.5 rounded text-sm resize-none"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    onFocus={() => setEditingLine(index)}
                    onBlur={() => setEditingLine(null)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={addLine}
            className="pixel-font text-[10px] px-3 py-1.5 rounded"
            style={{ border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}
          >
            + 添加对话行
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="pixel-font text-[10px] px-4 py-1.5 rounded"
              style={{ color: 'var(--text-secondary)' }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="pixel-font text-[10px] px-4 py-1.5 rounded"
              style={{ background: 'var(--accent-gold)', color: 'var(--bg-primary)' }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
