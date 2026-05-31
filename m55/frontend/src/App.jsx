import { useState, useEffect, useRef, useCallback } from 'react'
import JSZip from 'jszip'

const MAX_IMAGE_DIMENSION = 4096
const LARGE_IMAGE_THRESHOLD = 10 * 1024 * 1024

function useSteganoWorker() {
  const workerRef = useRef(null)
  const callbackRef = useRef(null)
  const progressRef = useRef(null)

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./stegano.worker.js', import.meta.url),
      { type: 'module' }
    )

    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'progress') {
        if (progressRef.current) {
          progressRef.current(e.data.payload)
        }
      } else if (callbackRef.current) {
        callbackRef.current(e.data)
        callbackRef.current = null
      }
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const send = (type, payload, onProgress) => {
    progressRef.current = onProgress || null
    return new Promise((resolve, reject) => {
      callbackRef.current = (data) => {
        if (data.type === 'error') {
          reject(new Error(data.payload.message))
        } else {
          resolve(data)
        }
      }
      workerRef.current.postMessage({ type, payload })
    })
  }

  return send
}

function useSmoothProgress() {
  const progressRef = useRef(0)
  const targetRef = useRef(0)
  const [displayProgress, setDisplayProgress] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const animate = () => {
      const diff = targetRef.current - progressRef.current
      if (Math.abs(diff) > 0.1) {
        progressRef.current += diff * 0.15
        setDisplayProgress(progressRef.current)
        rafRef.current = requestAnimationFrame(animate)
      } else {
        progressRef.current = targetRef.current
        setDisplayProgress(targetRef.current)
      }
    }

    if (targetRef.current > 0 && targetRef.current < 100) {
      rafRef.current = requestAnimationFrame(animate)
    } else {
      setDisplayProgress(targetRef.current)
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [targetRef.current])

  const setTarget = useCallback((val) => {
    targetRef.current = val
    if (val === 0 || val === 100) {
      progressRef.current = val
      setDisplayProgress(val)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return { displayProgress, setTarget }
}

function checkImageSize(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        pixels: img.naturalWidth * img.naturalHeight,
        needsResize: img.naturalWidth * img.naturalHeight > MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION,
        isLarge: file.size > LARGE_IMAGE_THRESHOLD,
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0, pixels: 0, needsResize: false, isLarge: file.size > LARGE_IMAGE_THRESHOLD })
    }
    img.src = url
  })
}

function generateJobId() {
  return 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

function App() {
  const [wasmReady, setWasmReady] = useState(true)
  const [keys, setKeys] = useState([])

  useEffect(() => {
    fetchKeys()
  }, [])

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys')
      const data = await res.json()
      setKeys(data)
    } catch (e) {
      console.error('获取密钥列表失败:', e)
    }
  }

  const tabs = [
    { id: 'hide', label: '隐藏信息' },
    { id: 'extract', label: '提取信息' },
    { id: 'batch', label: '批量处理' },
    { id: 'compress', label: '图片压缩' },
    { id: 'keys', label: '密钥管理' },
  ]

  const [activeTab, setActiveTab] = useState('hide')
  const workerSend = useSteganoWorker()

  return (
    <div className="container">
      <header className="header">
        <h1>🔐 图像隐写平台</h1>
        <p>基于 LSB 最低有效位替换算法的信息隐藏工具</p>
      </header>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'hide' && <HideTab wasmReady={wasmReady} keys={keys} workerSend={workerSend} />}
      {activeTab === 'extract' && <ExtractTab wasmReady={wasmReady} keys={keys} workerSend={workerSend} />}
      {activeTab === 'batch' && <BatchTab keys={keys} workerSend={workerSend} />}
      {activeTab === 'compress' && <CompressTab />}
      {activeTab === 'keys' && <KeyManager keys={keys} fetchKeys={fetchKeys} />}
    </div>
  )
}

function HideTab({ wasmReady, keys, workerSend }) {
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [message, setMessage] = useState('')
  const [key, setKey] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingInfo, setProcessingInfo] = useState('')
  const [imageInfo, setImageInfo] = useState(null)
  const fileInputRef = useRef(null)
  const dragRef = useRef(null)
  const { displayProgress, setTarget } = useSmoothProgress()

  const handleFileSelect = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('请上传有效的图片文件')
      return
    }
    setImageFile(file)
    setError(null)
    setResult(null)

    const info = await checkImageSize(file)
    setImageInfo(info)

    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    dragRef.current?.classList.remove('dragover')
    const file = e.dataTransfer.files[0]
    handleFileSelect(file)
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    dragRef.current?.classList.add('dragover')
  }

  const handleDragLeave = () => {
    dragRef.current?.classList.remove('dragover')
  }

  useEffect(() => {
    if (selectedKeyId) {
      const selectedKey = keys.find((k) => k.id === parseInt(selectedKeyId))
      if (selectedKey) {
        setKey(selectedKey.key_value)
      }
    }
  }, [selectedKeyId, keys])

  const handleHide = async () => {
    if (!imageFile || !message) {
      setError('请上传图片并输入要隐藏的信息')
      return
    }

    setIsProcessing(true)
    setError(null)
    setResult(null)
    setTarget(0)
    setProcessingInfo('正在读取图片数据...')

    try {
      const arrayBuffer = await imageFile.arrayBuffer()
      const imageData = new Uint8Array(arrayBuffer)
      setTarget(5)

      const onProgress = (progress) => {
        setTarget(5 + progress.percent * 0.9)
        const stageText = {
          resizing: '正在预处理缩放...',
          encoding: '正在嵌入隐藏信息...',
          done: '处理完成',
        }
        setProcessingInfo(stageText[progress.stage] || progress.stage)
      }

      const response = await workerSend('hide', {
        imageData,
        message,
        key,
        maxDimension: MAX_IMAGE_DIMENSION,
      }, onProgress)

      setTarget(95)
      setProcessingInfo('正在生成结果图片...')

      const resultData = response.payload
      const blob = new Blob([resultData], { type: 'image/png' })
      const url = URL.createObjectURL(blob)

      setTarget(100)

      setResult({
        url,
        filename: `steganography_${Date.now()}.png`,
      })
    } catch (e) {
      setError(e.message || '隐藏信息失败')
      setTarget(0)
    } finally {
      setIsProcessing(false)
      setProcessingInfo('')
    }
  }

  return (
    <div className="card">
      <h2>📝 隐藏信息到图片</h2>

      <div
        ref={dragRef}
        className="file-upload"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files[0])}
        />
        <p>点击或拖拽 PNG 图片到此处上传</p>
      </div>

      {imagePreview && (
        <div className="image-preview">
          <img src={imagePreview} alt="预览" />
          <p style={{ marginTop: '10px', color: '#888' }}>
            {imageFile?.name} ({Math.round(imageFile?.size / 1024)} KB)
            {imageInfo && ` · ${imageInfo.width}×${imageInfo.height}`}
          </p>
          {imageInfo?.needsResize && (
            <p style={{ color: '#e67e22', fontSize: '0.9rem', marginTop: '5px' }}>
              ⚠️ 图片尺寸较大，处理时将自动缩放至 {MAX_IMAGE_DIMENSION}×{MAX_IMAGE_DIMENSION} 以内
            </p>
          )}
        </div>
      )}

      <div className="form-group" style={{ marginTop: '20px' }}>
        <label>要隐藏的信息</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="输入你想隐藏的文本信息..."
        />
      </div>

      <div className="two-column">
        <div className="form-group">
          <label>密钥（可选，用于加密信息）</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="输入加密密钥..."
          />
        </div>
        <div className="form-group">
          <label>或选择已保存的密钥</label>
          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
          >
            <option value="">-- 选择密钥 --</option>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.key_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="btn"
        onClick={handleHide}
        disabled={!wasmReady || isProcessing || !imageFile || !message}
      >
        {isProcessing ? '处理中...' : '🔒 隐藏信息'}
      </button>

      {isProcessing && (
        <div style={{ marginTop: '15px' }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${displayProgress}%` }}></div>
          </div>
          <p style={{ textAlign: 'center', color: '#667eea', marginTop: '10px' }}>
            {processingInfo} ({Math.round(displayProgress)}%)
          </p>
        </div>
      )}

      {error && (
        <div className="result-box error">
          <strong>错误：</strong>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div className="result-box success">
          <strong>✅ 信息隐藏成功！</strong>
          <p>图片已生成，点击下方按钮下载：</p>
          <a
            href={result.url}
            download={result.filename}
            className="download-link"
          >
            📥 下载隐写图片
          </a>
          <div className="image-preview">
            <img src={result.url} alt="隐写结果" />
          </div>
        </div>
      )}
    </div>
  )
}

function ExtractTab({ wasmReady, keys, workerSend }) {
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [key, setKey] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingInfo, setProcessingInfo] = useState('')
  const fileInputRef = useRef(null)
  const dragRef = useRef(null)
  const { displayProgress, setTarget } = useSmoothProgress()

  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('请上传有效的图片文件')
      return
    }
    setImageFile(file)
    setError(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    dragRef.current?.classList.remove('dragover')
    const file = e.dataTransfer.files[0]
    handleFileSelect(file)
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    dragRef.current?.classList.add('dragover')
  }

  const handleDragLeave = () => {
    dragRef.current?.classList.remove('dragover')
  }

  useEffect(() => {
    if (selectedKeyId) {
      const selectedKey = keys.find((k) => k.id === parseInt(selectedKeyId))
      if (selectedKey) {
        setKey(selectedKey.key_value)
      }
    }
  }, [selectedKeyId, keys])

  const handleExtract = async () => {
    if (!imageFile) {
      setError('请上传图片')
      return
    }

    setIsProcessing(true)
    setError(null)
    setResult(null)
    setTarget(0)
    setProcessingInfo('正在读取图片数据...')

    try {
      const arrayBuffer = await imageFile.arrayBuffer()
      const imageData = new Uint8Array(arrayBuffer)
      setTarget(10)
      setProcessingInfo('正在提取隐藏信息...')

      const response = await workerSend('extract', {
        imageData,
        key,
      })

      setTarget(90)
      setProcessingInfo('正在解析信息...')
      setTarget(100)

      setResult(response.payload)
    } catch (e) {
      setError(e.message || '提取信息失败')
      setTarget(0)
    } finally {
      setIsProcessing(false)
      setProcessingInfo('')
    }
  }

  return (
    <div className="card">
      <h2>🔍 从图片中提取信息</h2>

      <div
        ref={dragRef}
        className="file-upload"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files[0])}
        />
        <p>点击或拖拽含隐藏信息的 PNG 图片到此处</p>
      </div>

      {imagePreview && (
        <div className="image-preview">
          <img src={imagePreview} alt="预览" />
          <p style={{ marginTop: '10px', color: '#888' }}>
            {imageFile?.name} ({Math.round(imageFile?.size / 1024)} KB)
          </p>
        </div>
      )}

      <div className="two-column" style={{ marginTop: '20px' }}>
        <div className="form-group">
          <label>解密密钥（如果使用了加密）</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="输入解密密钥..."
          />
        </div>
        <div className="form-group">
          <label>或选择已保存的密钥</label>
          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
          >
            <option value="">-- 选择密钥 --</option>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.key_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="btn"
        onClick={handleExtract}
        disabled={!wasmReady || isProcessing || !imageFile}
      >
        {isProcessing ? '提取中...' : '🔓 提取信息'}
      </button>

      {isProcessing && (
        <div style={{ marginTop: '15px' }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${displayProgress}%` }}></div>
          </div>
          <p style={{ textAlign: 'center', color: '#667eea', marginTop: '10px' }}>
            {processingInfo} ({Math.round(displayProgress)}%)
          </p>
        </div>
      )}

      {error && (
        <div className="result-box error">
          <strong>错误：</strong>
          <pre>{error}</pre>
        </div>
      )}

      {result !== null && (
        <div className="result-box success">
          <strong>✅ 提取成功！隐藏的信息是：</strong>
          <pre>{result || '(空信息)'}</pre>
        </div>
      )}
    </div>
  )
}

function BatchTab({ keys, workerSend }) {
  const [mode, setMode] = useState('hide')
  const [imageFiles, setImageFiles] = useState([])
  const [message, setMessage] = useState('')
  const [key, setKey] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [currentImage, setCurrentImage] = useState('')
  const [results, setResults] = useState(null)
  const [backendTaskId, setBackendTaskId] = useState(null)
  const [backendStatus, setBackendStatus] = useState(null)
  const fileInputRef = useRef(null)
  const dragRef = useRef(null)
  const { displayProgress, setTarget } = useSmoothProgress()

  useEffect(() => {
    if (selectedKeyId) {
      const selectedKey = keys.find((k) => k.id === parseInt(selectedKeyId))
      if (selectedKey) {
        setKey(selectedKey.key_value)
      }
    }
  }, [selectedKeyId, keys])

  const handleFilesSelect = async (files) => {
    const validFiles = Array.from(files).filter((f) => f.type?.startsWith('image/'))
    if (validFiles.length === 0) {
      setError('请上传有效的图片文件')
      return
    }

    const filesWithPreview = await Promise.all(
      validFiles.map(async (file) => {
        const info = await checkImageSize(file)
        return {
          file,
          info,
          preview: URL.createObjectURL(file),
          id: Math.random().toString(36).substr(2, 9),
        }
      })
    )

    setImageFiles(filesWithPreview)
    setError(null)
    setResults(null)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    dragRef.current?.classList.remove('dragover')
    handleFilesSelect(e.dataTransfer.files)
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    dragRef.current?.classList.add('dragover')
  }

  const handleDragLeave = () => {
    dragRef.current?.classList.remove('dragover')
  }

  const removeFile = (id) => {
    setImageFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleBatchProcess = async () => {
    if (imageFiles.length === 0) {
      setError('请至少上传一张图片')
      return
    }

    if (mode === 'hide' && !message) {
      setError('请输入要隐藏的信息')
      return
    }

    setIsProcessing(true)
    setError(null)
    setResults(null)
    setTarget(0)

    const jobId = generateJobId()

    try {
      const imagesData = await Promise.all(
        imageFiles.map(async (item) => {
          const arrayBuffer = await item.file.arrayBuffer()
          return {
            name: item.file.name,
            data: new Uint8Array(arrayBuffer),
          }
        })
      )
      setTarget(10)

      const onProgress = (progress) => {
        setTarget(10 + progress.percent * 0.85)
        setCurrentImage(progress.imageName)
      }

      if (mode === 'hide') {
        const response = await workerSend(
          'batch-hide',
          {
            images: imagesData,
            message,
            key,
            maxDimension: MAX_IMAGE_DIMENSION,
            jobId,
          },
          onProgress
        )

        setTarget(95)
        const zip = new JSZip()
        response.payload.results.forEach((r) => {
          zip.file(r.name, new Uint8Array(r.data))
        })

        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const zipUrl = URL.createObjectURL(zipBlob)

        setTarget(100)
        setResults({
          type: 'hide',
          items: response.payload.results.map((r) => ({
            ...r,
            url: URL.createObjectURL(new Blob([new Uint8Array(r.data)], { type: 'image/png' })),
          })),
          zipUrl,
          zipFilename: `stegano_batch_${Date.now()}.zip`,
        })
      } else {
        const response = await workerSend(
          'batch-extract',
          {
            images: imagesData,
            key,
            jobId,
          },
          onProgress
        )
        setTarget(100)
        setResults({
          type: 'extract',
          items: response.payload.results,
        })
      }
    } catch (e) {
      setError(e.message || '批量处理失败')
      setTarget(0)
    } finally {
      setIsProcessing(false)
      setCurrentImage('')
    }
  }

  const handleBackendBatch = async () => {
    if (imageFiles.length === 0) {
      setError('请至少上传一张图片')
      return
    }

    setIsProcessing(true)
    setError(null)
    setResults(null)
    setTarget(0)
    setBackendStatus('submitting')

    try {
      const formData = new FormData()
      imageFiles.forEach((item, i) => {
        formData.append(`files`, item.file)
      })
      formData.append('message', message)
      formData.append('key', key)

      const res = await fetch('/api/batch/compress', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '提交任务失败')
      }

      const data = await res.json()
      setBackendTaskId(data.task_id)
      setBackendStatus('processing')
      setTarget(20)

      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(`/api/batch/${data.task_id}/status`)
        const statusData = await statusRes.json()

        setTarget(20 + statusData.progress * 0.7)

        if (statusData.status === 'completed') {
          clearInterval(pollInterval)
          setBackendStatus('completed')
          setTarget(100)
          setResults({
            type: 'compress',
            zipUrl: `/api/batch/${data.task_id}/download`,
            zipFilename: `compressed_batch_${data.task_id}.zip`,
            totalImages: statusData.total,
          })
        } else if (statusData.status === 'failed') {
          clearInterval(pollInterval)
          setBackendStatus('failed')
          setError(statusData.error || '任务执行失败')
          setTarget(0)
        }
      }, 1000)
    } catch (e) {
      setError(e.message || '批量处理失败')
      setTarget(0)
      setBackendStatus(null)
    } finally {
    }
  }

  return (
    <div className="card">
      <h2>📦 批量处理</h2>

      <div className="form-group">
        <label>处理模式</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className={`tab-btn ${mode === 'hide' ? 'active' : ''}`}
            onClick={() => setMode('hide')}
            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
          >
            🔒 批量隐藏信息
          </button>
          <button
            className={`tab-btn ${mode === 'extract' ? 'active' : ''}`}
            onClick={() => setMode('extract')}
            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
          >
            🔓 批量提取信息
          </button>
          <button
            className={`tab-btn ${mode === 'compress' ? 'active' : ''}`}
            onClick={() => setMode('compress')}
            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
          >
            🗜️ 批量压缩 (后端异步)
          </button>
        </div>
      </div>

      <div
        ref={dragRef}
        className="file-upload"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFilesSelect(e.target.files)}
        />
        <p>点击或拖拽 <strong>多张</strong> PNG 图片到此处上传</p>
      </div>

      {imageFiles.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <p style={{ color: '#667eea', fontWeight: '600', marginBottom: '10px' }}>
            已选择 {imageFiles.length} 张图片：
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '10px',
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '10px',
            background: '#f8f9fa',
            borderRadius: '8px',
          }}>
            {imageFiles.map((item) => (
              <div key={item.id} style={{ position: 'relative' }}>
                <img
                  src={item.preview}
                  alt={item.file.name}
                  style={{
                    width: '100%',
                    height: '80px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                  }}
                />
                <button
                  onClick={() => removeFile(item.id)}
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: '1',
                  }}
                >
                  ×
                </button>
                <p style={{
                  fontSize: '0.75rem',
                  color: '#666',
                  marginTop: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.file.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'hide' && (
        <div className="form-group" style={{ marginTop: '20px' }}>
          <label>要隐藏的信息</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="输入要隐藏到所有图片中的文本信息..."
          />
        </div>
      )}

      <div className="two-column">
        <div className="form-group">
          <label>密钥（可选）</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="输入密钥..."
          />
        </div>
        <div className="form-group">
          <label>或选择已保存的密钥</label>
          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
          >
            <option value="">-- 选择密钥 --</option>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.key_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          className="btn"
          onClick={handleBatchProcess}
          disabled={isProcessing || imageFiles.length === 0 || (mode === 'hide' && !message)}
        >
          {isProcessing ? '处理中...' : '🚀 开始批量处理 (前端 WASM)'}
        </button>

        {mode === 'compress' && (
          <button
            className="btn btn-secondary"
            onClick={handleBackendBatch}
            disabled={isProcessing || imageFiles.length === 0}
          >
            {isProcessing && backendStatus === 'submitting' ? '提交中...' :
             isProcessing && backendStatus === 'processing' ? '后端处理中...' :
             '🗜️ 批量压缩 (后端 Redis 队列)'}
          </button>
        )}
      </div>

      {isProcessing && (
        <div style={{ marginTop: '15px' }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${displayProgress}%` }}></div>
          </div>
          <p style={{ textAlign: 'center', color: '#667eea', marginTop: '10px' }}>
            {currentImage ? `正在处理: ${currentImage}` : backendStatus === 'submitting' ? '正在提交到后端队列...' : '正在处理...'} ({Math.round(displayProgress)}%)
          </p>
        </div>
      )}

      {error && (
        <div className="result-box error">
          <strong>错误：</strong>
          <pre>{error}</pre>
        </div>
      )}

      {results && results.type === 'hide' && (
        <div className="result-box success">
          <strong>✅ 批量隐藏成功！</strong>
          <p>共处理 {results.items.length} 张图片</p>
          <a
            href={results.zipUrl}
            download={results.zipFilename}
            className="download-link"
            style={{ display: 'inline-block', margin: '15px 0' }}
          >
            📥 下载全部 (ZIP 压缩包)
          </a>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '10px',
            marginTop: '15px',
          }}>
            {results.items.map((item, i) => (
              <div key={i}>
                <img src={item.url} alt={item.name} style={{
                  width: '100%',
                  height: '80px',
                  objectFit: 'cover',
                  borderRadius: '4px',
                }} />
                <a
                  href={item.url}
                  download={item.name}
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    marginTop: '4px',
                    color: '#667eea',
                  }}
                >
                  下载
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {results && results.type === 'extract' && (
        <div className="result-box success">
          <strong>✅ 批量提取成功！</strong>
          <div style={{ marginTop: '15px', maxHeight: '400px', overflowY: 'auto' }}>
            {results.items.map((item, i) => (
              <div key={i} style={{
                padding: '10px',
                marginBottom: '8px',
                background: 'white',
                borderRadius: '4px',
              }}>
                <p style={{ fontWeight: '600', color: '#667eea' }}>{item.name}</p>
                <pre style={{
                  background: '#f8f9fa',
                  padding: '8px',
                  borderRadius: '4px',
                  marginTop: '5px',
                  fontSize: '0.85rem',
                }}>{item.message || '(空信息)'}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {results && results.type === 'compress' && (
        <div className="result-box success">
          <strong>✅ 批量压缩成功！</strong>
          <p>共压缩 {results.totalImages} 张图片</p>
          <a
            href={results.zipUrl}
            download={results.zipFilename}
            className="download-link"
            style={{ display: 'inline-block', margin: '15px 0' }}
          >
            📥 下载压缩包
          </a>
        </div>
      )}
    </div>
  )
}

function CompressTab() {
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [quality, setQuality] = useState(70)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef(null)
  const dragRef = useRef(null)

  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('请上传有效的图片文件')
      return
    }
    setImageFile(file)
    setError(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    dragRef.current?.classList.remove('dragover')
    const file = e.dataTransfer.files[0]
    handleFileSelect(file)
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    dragRef.current?.classList.add('dragover')
  }

  const handleDragLeave = () => {
    dragRef.current?.classList.remove('dragover')
  }

  const handleCompress = async () => {
    if (!imageFile) {
      setError('请上传图片')
      return
    }

    setIsProcessing(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', imageFile)
      formData.append('quality', quality)

      const res = await fetch('/api/compress', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '压缩失败')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      setResult({
        url,
        filename: `compressed_${Date.now()}.png`,
        originalSize: imageFile.size,
        compressedSize: blob.size,
      })
    } catch (e) {
      setError(e.message || '压缩失败')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="card">
      <h2>🗜️ 图片压缩预处理</h2>
      <p style={{ color: '#888', marginBottom: '20px' }}>
        使用 ImageMagick 对图片进行压缩，优化后再进行隐写操作
      </p>

      <div
        ref={dragRef}
        className="file-upload"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files[0])}
        />
        <p>点击或拖拽图片到此处上传</p>
      </div>

      {imagePreview && (
        <div className="image-preview">
          <img src={imagePreview} alt="预览" />
          <p style={{ marginTop: '10px', color: '#888' }}>
            {imageFile?.name} ({Math.round(imageFile?.size / 1024)} KB)
          </p>
        </div>
      )}

      <div className="form-group" style={{ marginTop: '20px' }}>
        <label>压缩质量: {quality}%</label>
        <div className="slider-container">
          <input
            type="range"
            min="1"
            max="100"
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
          />
          <span style={{ minWidth: '50px', textAlign: 'right' }}>{quality}%</span>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '5px' }}>
          质量越高，图片越清晰，但文件越大
        </p>
      </div>

      <button
        className="btn"
        onClick={handleCompress}
        disabled={isProcessing || !imageFile}
      >
        {isProcessing ? '压缩中...' : '🗜️ 压缩图片'}
      </button>

      {error && (
        <div className="result-box error">
          <strong>错误：</strong>
          <pre>{error}</pre>
        </div>
      )}

      {result && (
        <div className="result-box success">
          <strong>✅ 压缩成功！</strong>
          <p>
            原始大小: {Math.round(result.originalSize / 1024)} KB →
            压缩后: {Math.round(result.compressedSize / 1024)} KB
            {' '}(节省 {((1 - result.compressedSize / result.originalSize) * 100).toFixed(1)}%)
          </p>
          <a
            href={result.url}
            download={result.filename}
            className="download-link"
          >
            📥 下载压缩图片
          </a>
          <div className="image-preview">
            <img src={result.url} alt="压缩结果" />
          </div>
        </div>
      )}
    </div>
  )
}

function KeyManager({ keys, fetchKeys }) {
  const [keyName, setKeyName] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleCreate = async () => {
    if (!keyName || !keyValue) {
      setError('请填写密钥名称和密钥值')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_name: keyName, key_value: keyValue, description }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || '创建失败')
      }

      setKeyName('')
      setKeyValue('')
      setDescription('')
      fetchKeys()
    } catch (e) {
      setError(e.message || '创建失败')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定要删除此密钥吗？')) return

    try {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      fetchKeys()
    } catch (e) {
      setError(e.message || '删除失败')
    }
  }

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    let result = ''
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setKeyValue(result)
  }

  return (
    <div className="card">
      <h2>🔑 密钥管理</h2>

      <div className="form-group">
        <label>密钥名称</label>
        <input
          type="text"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="例如：我的加密密钥"
        />
      </div>

      <div className="form-group">
        <label>密钥值</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder="输入或生成密钥..."
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary" onClick={generateRandomKey}>
            🎲 生成随机
          </button>
        </div>
      </div>

      <div className="form-group">
        <label>描述（可选）</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="密钥用途说明..."
        />
      </div>

      <button
        className="btn"
        onClick={handleCreate}
        disabled={isProcessing || !keyName || !keyValue}
      >
        {isProcessing ? '保存中...' : '💾 保存密钥'}
      </button>

      {error && (
        <div className="result-box error">
          <strong>错误：</strong>
          <pre>{error}</pre>
        </div>
      )}

      <h3 style={{ marginTop: '30px', color: '#667eea' }}>已保存的密钥</h3>
      {keys.length === 0 ? (
        <p style={{ color: '#888', marginTop: '15px' }}>暂无保存的密钥</p>
      ) : (
        <ul className="key-list" style={{ marginTop: '15px' }}>
          {keys.map((k) => (
            <li key={k.id} className="key-item">
              <div className="key-info">
                <h4>{k.key_name}</h4>
                <p>{'*'.repeat(Math.min(k.key_value.length, 16))}</p>
                {k.description && (
                  <p style={{ fontFamily: 'inherit', marginTop: '5px' }}>
                    {k.description}
                  </p>
                )}
                <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                  创建于 {new Date(k.created_at).toLocaleString()}
                  {k.last_used && ` · 最后使用 ${new Date(k.last_used).toLocaleString()}`}
                </p>
              </div>
              <div className="key-actions">
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(k.id)}
                >
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App
