import { useState, useEffect } from 'react'
import type { DialogScript, DialogLine } from '../../../shared/types'
import { TILE_SIZE } from '@/utils/tileset'

interface DialogBoxProps {
  script: DialogScript
  eventX: number
  eventY: number
  onClose: () => void
}

export default function DialogBox({ script, eventX, eventY, onClose }: DialogBoxProps) {
  const [currentLine, setCurrentLine] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [isTyping, setIsTyping] = useState(true)

  const line = script.lines[currentLine] || { speaker: '', text: '' }

  useEffect(() => {
    setCurrentLine(0)
    setDisplayText('')
    setIsTyping(true)
  }, [script])

  useEffect(() => {
    setDisplayText('')
    setIsTyping(true)
    let i = 0
    const text = line.text
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1))
        i++
      } else {
        setIsTyping(false)
        clearInterval(interval)
      }
    }, 30)
    return () => clearInterval(interval)
  }, [currentLine, line.text])

  function advance() {
    if (isTyping) {
      setIsTyping(false)
      setDisplayText(line.text)
      return
    }
    if (currentLine < script.lines.length - 1) {
      setCurrentLine((p) => p + 1)
    } else {
      onClose()
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isTyping, currentLine, script.lines.length])

  const portraitEmoji = getPortraitEmoji(line.speaker)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 cursor-pointer" onClick={advance}>
      <div
        className="w-full max-w-3xl mx-4 rounded-lg shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
          border: '3px solid var(--accent-gold-dim)',
          boxShadow: '0 0 30px rgba(230, 192, 104, 0.3)',
        }}
      >
        <div className="flex p-4 gap-4">
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center text-3xl shrink-0"
            style={{
              background: 'var(--bg-tertiary)',
              border: '2px solid var(--accent-gold-dim)',
            }}
          >
            {portraitEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="pixel-font text-sm" style={{ color: 'var(--accent-gold)' }}>
                {line.speaker || '???'}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                位置: ({eventX}, {eventY})
              </span>
            </div>
            <div className="text-base leading-relaxed" style={{ color: 'var(--text-primary)', minHeight: '3em' }}>
              {displayText}
              {isTyping && <span className="animate-pulse ml-0.5">▌</span>}
            </div>
          </div>
        </div>
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)' }}
        >
          <span className="pixel-font text-[9px]" style={{ color: 'var(--text-dim)' }}>
            {currentLine + 1} / {script.lines.length}
          </span>
          <span className="pixel-font text-[9px] animate-pulse" style={{ color: 'var(--accent-gold)' }}>
            点击或按空格继续 ▶
          </span>
        </div>
      </div>
    </div>
  )
}

function getPortraitEmoji(speaker: string): string {
  const lower = speaker.toLowerCase()
  if (lower.includes('王') || lower.includes('king') || lower.includes('皇')) return '👑'
  if (lower.includes('商') || lower.includes('shop') || lower.includes('卖')) return '🛒'
  if (lower.includes('士') || lower.includes('guard') || lower.includes('卫')) return '⚔️'
  if (lower.includes('法') || lower.includes('mage') || lower.includes('魔')) return '🔮'
  if (lower.includes('森') || lower.includes('forest') || lower.includes('树')) return '🌲'
  if (lower.includes('村') || lower.includes('村民') || lower.includes('villager')) return '👤'
  if (lower.includes('猫') || lower.includes('cat') || lower.includes('喵')) return '🐱'
  if (lower.includes('狗') || lower.includes('dog')) return '🐕'
  if (lower.includes('龙') || lower.includes('dragon')) return '🐉'
  return '💬'
}
