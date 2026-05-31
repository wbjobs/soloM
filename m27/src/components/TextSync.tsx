import { useState, useRef, useEffect } from 'react'
import { Send, Copy, Check, MessageSquare, Clipboard } from 'lucide-react'
import { useStore, TextMessage } from '@/store/useStore'
import { useWebRTC } from '@/hooks/useWebRTC'

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function MessageBubble({ msg }: { msg: TextMessage }) {
  const [copied, setCopied] = useState(false)
  const isSending = msg.direction === 'sending'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex ${isSending ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-[85%] relative group`}>
        <div
          className={`px-4 py-2.5 rounded-2xl ${
            isSending
              ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white rounded-br-sm'
              : 'bg-space-700/80 text-slate-100 rounded-bl-sm border border-space-600/50'
          }`}
        >
          <p className="text-sm font-body whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
        </div>
        <div className={`flex items-center gap-2 mt-1 ${isSending ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-slate-600 font-body">{formatTime(msg.timestamp)}</span>
          {!isSending && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-space-700/50"
              title="复制到剪贴板"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-slate-600 hover:text-slate-400" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TextSync() {
  const { sendText } = useWebRTC()
  const textMessages = useStore((s) => s.textMessages)
  const connectionState = useStore((s) => s.connectionState)
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [textMessages])

  const handleSend = () => {
    if (!text.trim()) return
    sendText(text)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isConnected = connectionState === 'connected'

  return (
    <div className="w-full bg-space-800/60 backdrop-blur-sm rounded-2xl border border-space-700/30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-space-700/30">
        <MessageSquare className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-body font-600 text-slate-300">文本同步</h3>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 font-body">
          <Clipboard className="w-3 h-3" />
          <span>自动复制到剪贴板</span>
        </div>
      </div>

      {textMessages.length > 0 && (
        <div className="h-48 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-space-900/30">
          {textMessages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {textMessages.length === 0 && (
        <div className="h-32 flex items-center justify-center">
          <p className="text-xs text-slate-600 font-body">发送的文本将自动同步到对方剪贴板</p>
        </div>
      )}

      <div className="p-3 border-t border-space-700/30">
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? '输入文本，Enter 发送...' : '等待连接后可发送文本'}
            disabled={!isConnected}
            rows={2}
            className="flex-1 px-3 py-2 rounded-xl bg-space-900/60 border border-space-700/30 text-slate-200 text-sm font-body placeholder:text-slate-600 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || !isConnected}
            className="self-end px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
