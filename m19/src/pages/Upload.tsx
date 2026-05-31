import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check } from 'lucide-react'
import { DropZone } from '@/components/DropZone'
import { useFileStore } from '@/store/useFileStore'

export default function Upload() {
  const { uploadFile, uploading, progress } = useFileStore()
  const [uploadedCid, setUploadedCid] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleUpload = async (file: File) => {
    try {
      const result = await uploadFile(file)
      setUploadedCid(result.cid)
    } catch {
      setUploadedCid(null)
    }
  }

  const handleCopy = async () => {
    if (!uploadedCid) return
    await navigator.clipboard.writeText(uploadedCid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-16" style={{ backgroundColor: '#0f0f23' }}>
      <h1
        className="text-4xl font-bold mb-12"
        style={{
          fontFamily: "'Outfit', sans-serif",
          color: '#00d4aa',
          textShadow: '0 0 10px rgba(0,212,170,0.6), 0 0 30px rgba(0,212,170,0.3), 0 0 60px rgba(0,212,170,0.15)',
        }}
      >
        上传文件
      </h1>

      <div className="w-full max-w-xl">
        <DropZone onUpload={handleUpload} uploading={uploading} progress={progress} />
      </div>

      {uploadedCid && (
        <div
          className="mt-10 w-full max-w-xl rounded-2xl border p-6"
          style={{
            backgroundColor: 'rgba(0,212,170,0.04)',
            borderColor: 'rgba(0,212,170,0.25)',
          }}
        >
          <h2
            className="text-xl font-semibold mb-4"
            style={{
              fontFamily: "'Outfit', sans-serif",
              color: '#00d4aa',
              textShadow: '0 0 8px rgba(0,212,170,0.5), 0 0 20px rgba(0,212,170,0.2)',
            }}
          >
            上传成功!
          </h2>

          <div className="flex items-center gap-3 mb-5">
            <code
              className="flex-1 rounded-lg px-4 py-3 text-sm font-mono break-all"
              style={{
                backgroundColor: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(0,212,170,0.2)',
                color: '#5ef5d0',
              }}
            >
              {uploadedCid}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg px-3 py-3 transition-colors"
              style={{
                backgroundColor: 'rgba(0,212,170,0.1)',
                border: '1px solid rgba(0,212,170,0.3)',
                color: copied ? '#00d4aa' : 'rgba(0,212,170,0.7)',
              }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>

          <Link
            to="/library"
            className="inline-block rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(0,212,170,0.08)',
              border: '1px solid rgba(0,212,170,0.25)',
              color: '#00d4aa',
            }}
          >
            查看资源库 →
          </Link>
        </div>
      )}
    </div>
  )
}
