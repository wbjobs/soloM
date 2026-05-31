import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import { FileCard } from '@/components/FileCard'
import { PreviewModal } from '@/components/PreviewModal'
import { useFileStore } from '@/store/useFileStore'

type FilterType = '全部' | '图片' | 'PDF' | '其他'

const FILTERS: FilterType[] = ['全部', '图片', 'PDF', '其他']

function matchesFilter(mimeType: string, filter: FilterType): boolean {
  if (filter === '全部') return true
  if (filter === '图片') return mimeType.startsWith('image/')
  if (filter === 'PDF') return mimeType === 'application/pdf'
  return !mimeType.startsWith('image/') && mimeType !== 'application/pdf'
}

export default function Library() {
  const { files, fetchFiles, deleteFile } = useFileStore()
  const [activeFilter, setActiveFilter] = useState<FilterType>('全部')
  const [previewCid, setPreviewCid] = useState<string | null>(null)

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const filtered = files.filter((f) => matchesFilter(f.mimeType, activeFilter))
  const previewFile = files.find((f) => f.cid === previewCid) ?? null

  return (
    <div className="min-h-screen px-4 pt-16 pb-12" style={{ backgroundColor: '#0f0f23' }}>
      <h1
        className="text-4xl font-bold text-center mb-10"
        style={{
          fontFamily: "'Outfit', sans-serif",
          color: '#00d4aa',
          textShadow: '0 0 10px rgba(0,212,170,0.6), 0 0 30px rgba(0,212,170,0.3), 0 0 60px rgba(0,212,170,0.15)',
        }}
      >
        资源库
      </h1>

      <div className="max-w-5xl mx-auto mb-8 flex justify-center gap-3">
        {FILTERS.map((f) => {
          const isActive = activeFilter === f
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="rounded-full px-5 py-2 text-sm font-medium border transition-all"
              style={{
                backgroundColor: isActive ? 'rgba(0,212,170,0.15)' : 'rgba(255,255,255,0.04)',
                borderColor: isActive ? 'rgba(0,212,170,0.5)' : 'rgba(255,255,255,0.1)',
                color: isActive ? '#00d4aa' : 'rgba(255,255,255,0.45)',
                boxShadow: isActive ? '0 0 12px rgba(0,212,170,0.25)' : 'none',
              }}
            >
              {f}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32">
          <Database size={48} style={{ color: 'rgba(255,255,255,0.15)' }} className="mb-4" />
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.3)' }}>暂无文件</p>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((file) => (
            <FileCard
              key={file.cid}
              file={file}
              onPreview={() => setPreviewCid(file.cid)}
              onDelete={() => deleteFile(file.cid)}
            />
          ))}
        </div>
      )}

      <PreviewModal
        file={previewFile}
        onClose={() => setPreviewCid(null)}
      />
    </div>
  )
}
