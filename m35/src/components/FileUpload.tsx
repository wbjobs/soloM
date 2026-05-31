import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, Atom } from 'lucide-react'
import { useSimulationStore } from '@/store/simulationStore'

export default function FileUpload() {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { fileName, atomCount, residueCount, status, setFileInfo } = useSimulationStore()

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.pdb')) {
      setError('请上传 .pdb 格式的文件')
      return
    }
    setError(null)
    setIsUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('上传失败')
      const data = await res.json()
      setFileInfo({
        taskId: data.taskId,
        fileName: file.name,
        atomCount: data.atomCount ?? 0,
        residueCount: data.residueCount ?? 0,
      })
    } catch {
      setError('上传失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }, [setFileInfo])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }, [handleUpload])

  if (status !== 'idle' && fileName) {
    return (
      <div className="rounded-lg border border-[#1e293b] bg-[#111827] p-4">
        <div className="flex items-center gap-3 mb-3">
          <FileText className="w-5 h-5 text-cyan-400" />
          <span className="text-[#e2e8f0] font-medium truncate">{fileName}</span>
        </div>
        <div className="flex gap-4 text-sm text-[#94a3b8]">
          <div className="flex items-center gap-1.5">
            <Atom className="w-3.5 h-3.5" />
            <span>{atomCount} 原子</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>{residueCount} 残基</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          flex flex-col items-center justify-center gap-3
          rounded-lg border-2 border-dashed p-6 cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-cyan-400 bg-cyan-400/10'
            : 'border-[#1e293b] bg-[#111827] hover:border-cyan-400/50 hover:bg-[#111827]/80'
          }
        `}
      >
        <Upload className={`w-8 h-8 ${isDragging ? 'text-cyan-400' : 'text-[#94a3b8]'} transition-colors`} />
        <div className="text-center">
          <p className="text-[#e2e8f0] text-sm font-medium">
            {isUploading ? '上传中...' : '拖放 PDB 文件到此处'}
          </p>
          <p className="text-[#94a3b8] text-xs mt-1">或点击选择文件</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdb"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
