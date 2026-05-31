import { useState, useRef, useEffect } from 'react'
import { initWasm, encodeMessage, decodeMessage, getMaxCapacity } from './wasm/steganography.js'

function App() {
  const [activeTab, setActiveTab] = useState('encode')
  const [image, setImage] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [decodePassword, setDecodePassword] = useState('')
  const [decodedMessage, setDecodedMessage] = useState('')
  const [status, setStatus] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [wasmReady, setWasmReady] = useState(false)
  const [maxCapacity, setMaxCapacity] = useState(0)
  const [encodedImageUrl, setEncodedImageUrl] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    initWasm().then(() => {
      setWasmReady(true)
    }).catch(err => {
      console.error('Failed to load WASM:', err)
      setStatus({ type: 'error', text: 'WASM模块加载失败' })
    })
  }, [])

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.includes('png')) {
      setStatus({ type: 'error', text: '请上传PNG格式的图片' })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        setImage(img)
        setImageUrl(event.target.result)
        setEncodedImageUrl(null)
        setDecodedMessage('')
        setStatus({})
        
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        const capacity = getMaxCapacity(imageData.data.length)
        setMaxCapacity(capacity)
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleEncode = async () => {
    if (!image || !message.trim()) {
      setStatus({ type: 'error', text: '请上传图片并输入要隐藏的信息' })
      return
    }

    if (!password) {
      setStatus({ type: 'error', text: '请输入加密密码' })
      return
    }

    if (password !== confirmPassword) {
      setStatus({ type: 'error', text: '两次输入的密码不一致' })
      return
    }

    if (password.length < 4) {
      setStatus({ type: 'error', text: '密码长度至少4个字符' })
      return
    }

    if (message.length > maxCapacity) {
      setStatus({ type: 'error', text: `信息过长！最大容量：${maxCapacity} 字符（已扣除加密开销）` })
      return
    }

    setLoading(true)
    setStatus({})

    try {
      const canvas = canvasRef.current
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      const imageData = ctx.getImageData(0, 0, image.width, image.height)

      const result = encodeMessage(imageData.data, message, password)
      
      if (result.success) {
        ctx.putImageData(imageData, 0, 0)
        const encodedUrl = canvas.toDataURL('image/png')
        setEncodedImageUrl(encodedUrl)
        setStatus({ type: 'success', text: '信息已加密并成功隐藏到图片中！' })
      } else {
        setStatus({ type: 'error', text: `编码失败：${result.error}` })
      }
    } catch (err) {
      setStatus({ type: 'error', text: `编码失败：${err.message || err}` })
    } finally {
      setLoading(false)
    }
  }

  const handleDecode = async () => {
    if (!image) {
      setStatus({ type: 'error', text: '请上传包含隐藏信息的图片' })
      return
    }

    if (!decodePassword) {
      setStatus({ type: 'error', text: '请输入解密密码' })
      return
    }

    setLoading(true)
    setStatus({})
    setDecodedMessage('')

    try {
      const canvas = canvasRef.current
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      const imageData = ctx.getImageData(0, 0, image.width, image.height)

      const result = decodeMessage(imageData.data, decodePassword)
      
      if (result.success) {
        setDecodedMessage(result.message)
        setStatus({ type: 'success', text: '成功解密并提取隐藏信息！' })
      } else {
        setStatus({ type: 'error', text: `解码失败：${result.error}` })
      }
    } catch (err) {
      setStatus({ type: 'error', text: `解码失败：${err.message || err}` })
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!encodedImageUrl) return
    
    const link = document.createElement('a')
    link.download = 'steganography-image.png'
    link.href = encodedImageUrl
    link.click()
  }

  const handleReset = () => {
    setImage(null)
    setImageUrl(null)
    setMessage('')
    setPassword('')
    setConfirmPassword('')
    setDecodePassword('')
    setDecodedMessage('')
    setStatus({})
    setEncodedImageUrl(null)
    setMaxCapacity(0)
  }

  return (
    <div className="container">
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      <div className="header">
        <h1>🔐 图片隐写工具</h1>
        <p>使用 AES-256-GCM 加密 + LSB 最低有效位算法，将文本信息安全隐藏到 PNG 图片中</p>
        {!wasmReady && <p style={{ marginTop: '10px' }}>正在加载 WASM 模块...</p>}
      </div>

      <div className="card">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'encode' ? 'active' : ''}`}
            onClick={() => setActiveTab('encode')}
          >
            📝 隐藏信息
          </button>
          <button 
            className={`tab ${activeTab === 'decode' ? 'active' : ''}`}
            onClick={() => setActiveTab('decode')}
          >
            🔍 提取信息
          </button>
        </div>

        <div className="upload-area" onClick={() => document.getElementById('fileInput').click()}>
          <input 
            type="file" 
            id="fileInput" 
            accept=".png" 
            onChange={handleImageUpload}
          />
          {imageUrl ? (
            <div>
              <img src={imageUrl} alt="Preview" className="image-preview" />
              <p>点击更换图片（仅支持PNG格式）</p>
            </div>
          ) : (
            <p>点击上传 PNG 图片，或将图片拖到此处</p>
          )}
        </div>

        {status.text && (
          <div className={`message ${status.type}`}>
            {status.text}
          </div>
        )}

        {activeTab === 'encode' && (
          <>
            <div className="form-group">
              <label>要隐藏的信息</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="输入你想要隐藏在图片中的文本信息..."
                disabled={!wasmReady}
              />
              <div className="char-count">
                {message.length} / {maxCapacity} 字符（已扣除加密开销）
              </div>
            </div>

            <div className="password-section">
              <div className="form-group">
                <label>🔒 加密密码</label>
                <input
                  type="password"
                  className="password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入加密密码（至少4个字符）"
                  disabled={!wasmReady}
                />
              </div>
              <div className="form-group">
                <label>🔒 确认密码</label>
                <input
                  type="password"
                  className="password-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入加密密码"
                  disabled={!wasmReady}
                />
                {password && confirmPassword && password !== confirmPassword && (
                  <div className="password-mismatch">两次输入的密码不一致</div>
                )}
              </div>
            </div>

            <button 
              className="btn btn-primary"
              onClick={handleEncode}
              disabled={loading || !wasmReady || !image || !message.trim() || !password || password !== confirmPassword || password.length < 4}
            >
              {loading && <span className="loading"></span>}
              加密并隐藏信息
            </button>

            {encodedImageUrl && (
              <>
                <div className="image-container">
                  <div className="image-box">
                    <h4>原始图片</h4>
                    <img src={imageUrl} alt="Original" className="image-preview" />
                  </div>
                  <div className="image-box">
                    <h4>包含加密信息的图片</h4>
                    <img src={encodedImageUrl} alt="Encoded" className="image-preview" />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleDownload}>
                  ⬇️ 下载处理后的图片
                </button>
              </>
            )}
          </>
        )}

        {activeTab === 'decode' && (
          <>
            <div className="password-section">
              <div className="form-group">
                <label>🔑 解密密码</label>
                <input
                  type="password"
                  className="password-input"
                  value={decodePassword}
                  onChange={(e) => setDecodePassword(e.target.value)}
                  placeholder="输入加密时使用的密码"
                  disabled={!wasmReady}
                />
              </div>
            </div>

            <button 
              className="btn btn-primary"
              onClick={handleDecode}
              disabled={loading || !wasmReady || !image || !decodePassword}
            >
              {loading && <span className="loading"></span>}
              提取并解密信息
            </button>

            {decodedMessage && (
              <div className="decoded-message">
                <h3>📄 解密到的信息：</h3>
                <p>{decodedMessage}</p>
              </div>
            )}
          </>
        )}

        <button className="btn btn-secondary" onClick={handleReset}>
          🔄 重置
        </button>
      </div>

      <div className="card">
        <h2>📖 使用说明</h2>
        <div style={{ color: '#666', lineHeight: '1.8' }}>
          <p><strong>隐藏信息（编码）：</strong></p>
          <ol style={{ marginLeft: '20px', marginBottom: '20px' }}>
            <li>上传一张 PNG 格式的图片</li>
            <li>在文本框中输入要隐藏的信息</li>
            <li>设置加密密码（提取时需使用相同密码）</li>
            <li>点击"加密并隐藏信息"按钮</li>
            <li>下载处理后的图片，加密信息已隐藏其中</li>
          </ol>
          <p><strong>提取信息（解码）：</strong></p>
          <ol style={{ marginLeft: '20px', marginBottom: '20px' }}>
            <li>上传包含隐藏信息的 PNG 图片</li>
            <li>输入加密时使用的密码</li>
            <li>点击"提取并解密信息"按钮</li>
            <li>查看解密后的隐藏信息</li>
          </ol>
          <p><strong>🔒 安全说明：</strong></p>
          <ul style={{ marginLeft: '20px' }}>
            <li>使用 AES-256-GCM 认证加密算法</li>
            <li>密码通过 PBKDF2-SHA256（100,000轮）派生为256位密钥</li>
            <li>每次加密使用随机盐和随机 nonce，相同明文产生不同密文</li>
            <li>密码错误时将提示解密失败，不会返回错误数据</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default App
