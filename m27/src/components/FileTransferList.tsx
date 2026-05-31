import { useStore, FileTransfer } from '@/store/useStore'
import { Download, File, CheckCircle, ArrowUp, ArrowDown } from 'lucide-react'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1048576) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`
}

function getFileName(name: string): string {
  if (name.length <= 28) return name
  const ext = name.lastIndexOf('.')
  if (ext > 0) {
    const base = name.slice(0, ext)
    const extStr = name.slice(ext)
    return base.slice(0, 24) + '...' + extStr
  }
  return name.slice(0, 28) + '...'
}

function TransferItem({ transfer }: { transfer: FileTransfer }) {
  const isCompleted = transfer.status === 'completed'
  const isSending = transfer.direction === 'sending'
  const progress = Math.min(100, Math.round(transfer.progress))

  const handleDownload = () => {
    if (transfer.blob) {
      const url = URL.createObjectURL(transfer.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = transfer.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="group bg-space-800/60 rounded-xl border border-space-700/30 p-4 hover:border-space-600/50 transition-all">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-space-700/50 flex items-center justify-center shrink-0">
          {isCompleted ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <File className="w-4 h-4 text-slate-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm text-slate-200 font-body font-500 truncate">
              {getFileName(transfer.fileName)}
            </span>
            {isSending ? (
              <ArrowUp className="w-3 h-3 text-cyan-400 shrink-0" />
            ) : (
              <ArrowDown className="w-3 h-3 text-violet-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-body">
            <span>{formatSize(transfer.fileSize)}</span>
            {!isCompleted && transfer.speed > 0 && (
              <>
                <span>·</span>
                <span>{formatSpeed(transfer.speed)}</span>
              </>
            )}
            {isCompleted && (
              <>
                <span>·</span>
                <span className="text-emerald-400">已完成</span>
              </>
            )}
          </div>
        </div>

        {isCompleted && !isSending && transfer.blob && (
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="h-1.5 bg-space-700/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200 ease-out"
          style={{
            width: `${progress}%`,
            background: isCompleted
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : isSending
              ? 'linear-gradient(90deg, #06b6d4, #22d3ee)'
              : 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
          }}
        />
      </div>

      {!isCompleted && (
        <div className="text-right mt-1">
          <span className="text-xs text-slate-500 font-body">{progress}%</span>
        </div>
      )}
    </div>
  )
}

export default function FileTransferList() {
  const transfers = useStore((s) => s.transfers)

  if (transfers.length === 0) return null

  return (
    <div className="w-full space-y-2">
      <h3 className="text-xs font-body font-600 text-slate-500 uppercase tracking-wider mb-3">
        传输记录
      </h3>
      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
        {[...transfers].reverse().map((t) => (
          <TransferItem key={t.fileId} transfer={t} />
        ))}
      </div>
    </div>
  )
}
