import { useCallback, useState, useRef } from 'react'
import { Upload, File } from 'lucide-react'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useStore } from '@/store/useStore'

export default function DropZone() {
  const { sendFiles } = useWebRTC()
  const connectionState = useStore((s) => s.connectionState)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (connectionState !== 'connected') return
      sendFiles(Array.from(files))
    },
    [connectionState, sendFiles]
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
      e.target.value = ''
    }
  }

  const isConnected = connectionState === 'connected'

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        relative w-full rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
        ${isConnected ? '' : 'pointer-events-none opacity-40'}
        ${
          isDragging
            ? 'border-cyan-400 bg-cyan-400/5 scale-[1.01]'
            : 'border-space-600 hover:border-cyan-400/50 hover:bg-space-800/30'
        }
        p-10 text-center
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-3">
        {isDragging ? (
          <>
            <Upload className="w-10 h-10 text-cyan-400 animate-bounce" />
            <p className="text-cyan-400 font-body font-600">释放文件开始传输</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-space-800 border border-space-700/50 flex items-center justify-center mb-1">
              <File className="w-7 h-7 text-slate-500" />
            </div>
            <p className="text-slate-300 font-body font-500">
              {isConnected ? '拖拽文件到此处，或点击选择' : '等待连接后可传输文件'}
            </p>
            <p className="text-xs text-slate-600 font-body">支持任意类型文件，可多选</p>
          </>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-0 rounded-2xl bg-cyan-400/5 pointer-events-none" />
      )}
    </div>
  )
}
