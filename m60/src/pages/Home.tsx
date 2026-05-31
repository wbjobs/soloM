import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TileMap, CreateMapRequest } from '../../shared/types'
import { fetchMaps, createMap, deleteMap, duplicateMap, importMap } from '@/utils/api'

export default function Home() {
  const navigate = useNavigate()
  const [maps, setMaps] = useState<TileMap[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CreateMapRequest>({
    name: '',
    width: 20,
    height: 15,
    tileWidth: 32,
    tileHeight: 32,
  })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadMaps()
  }, [])

  async function loadMaps() {
    try {
      const data = await fetchMaps()
      setMaps(data)
    } catch {
      console.error('Failed to fetch maps')
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) return
    try {
      await createMap(form)
      setShowModal(false)
      setForm({ name: '', width: 20, height: 15, tileWidth: 32, tileHeight: 32 })
      loadMaps()
    } catch {
      console.error('Failed to create map')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMap(id)
      setDeleteConfirm(null)
      loadMaps()
    } catch {
      console.error('Failed to delete map')
    }
  }

  async function handleDuplicate(id: string) {
    try {
      await duplicateMap(id)
      loadMaps()
    } catch {
      console.error('Failed to duplicate map')
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await importMap(data)
      loadMaps()
    } catch {
      console.error('Failed to import map')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const filtered = maps.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  )

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: 'var(--bg-primary)' }}
    >
      <header className="text-center mb-8 pt-4">
        <div className="flex items-center justify-center gap-4 mb-2">
          <span
            className="text-lg"
            style={{ color: 'var(--accent-gold-dim)' }}
          >
            ◆
          </span>
          <h1
            className="pixel-font text-3xl tracking-widest"
            style={{ color: 'var(--accent-gold)' }}
          >
            RPG MAP FORGE
          </h1>
          <span
            className="text-lg"
            style={{ color: 'var(--accent-gold-dim)' }}
          >
            ◆
          </span>
        </div>
        <div
          className="pixel-font text-xs mt-2"
          style={{ color: 'var(--text-dim)' }}
        >
          ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <input
            type="text"
            placeholder="🔍 搜索地图..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 rounded border text-sm outline-none focus:ring-2"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={() => setShowModal(true)}
            className="pixel-font text-xs px-5 py-2 rounded transition-all hover:brightness-125"
            style={{
              background: 'var(--accent-gold)',
              color: 'var(--bg-primary)',
            }}
          >
            + 新建地图
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="pixel-font text-xs px-5 py-2 rounded border transition-all hover:brightness-125"
            style={{
              borderColor: 'var(--accent-gold)',
              color: 'var(--accent-gold)',
              background: 'transparent',
            }}
          >
            📂 导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {filtered.length === 0 ? (
          <div
            className="text-center py-20 pixel-font text-sm"
            style={{ color: 'var(--text-dim)' }}
          >
            {maps.length === 0
              ? '还没有地图，点击"新建地图"开始创作'
              : '没有找到匹配的地图'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((map) => (
              <div
                key={map.id}
                className="rounded-lg border p-4 transition-all hover:border-opacity-80 group cursor-pointer"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border-color)',
                }}
                onClick={() => navigate(`/editor/${map.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3
                    className="pixel-font text-xs truncate flex-1 mr-2"
                    style={{ color: 'var(--accent-gold)' }}
                  >
                    {map.name}
                  </h3>
                  <span
                    className="pixel-font text-[10px] px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-dim)',
                    }}
                  >
                    v{map.version}
                  </span>
                </div>

                <div
                  className="text-xs mb-3 space-y-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div>
                    📐 {map.width} × {map.height} 格
                  </div>
                  <div>
                    🕐 {formatDate(map.updatedAt)}
                  </div>
                </div>

                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicate(map.id)
                    }}
                    className="flex-1 text-xs px-2 py-1 rounded border transition-all hover:brightness-125"
                    style={{
                      borderColor: 'var(--accent-blue)',
                      color: 'var(--accent-blue)',
                      background: 'transparent',
                    }}
                  >
                    复制
                  </button>
                  {deleteConfirm === map.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(map.id)
                      }}
                      className="flex-1 text-xs px-2 py-1 rounded transition-all"
                      style={{
                        background: 'var(--accent-red)',
                        color: '#fff',
                      }}
                    >
                      确认删除?
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirm(map.id)
                      }}
                      className="flex-1 text-xs px-2 py-1 rounded border transition-all hover:brightness-125"
                      style={{
                        borderColor: 'var(--accent-red)',
                        color: 'var(--accent-red)',
                        background: 'transparent',
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
        >
          <div
            className="rounded-lg border p-6 w-full max-w-md"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
            }}
          >
            <h2
              className="pixel-font text-sm mb-6"
              style={{ color: 'var(--accent-gold)' }}
            >
              新建地图
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  地图名称
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded border text-sm outline-none focus:ring-2"
                  style={{
                    background: 'var(--bg-primary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                  autoFocus
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label
                    className="block text-xs mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    宽度 (格)
                  </label>
                  <input
                    type="number"
                    value={form.width}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        width: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                    className="w-full px-3 py-2 rounded border text-sm outline-none"
                    style={{
                      background: 'var(--bg-primary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <div className="flex-1">
                  <label
                    className="block text-xs mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    高度 (格)
                  </label>
                  <input
                    type="number"
                    value={form.height}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        height: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                    className="w-full px-3 py-2 rounded border text-sm outline-none"
                    style={{
                      background: 'var(--bg-primary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  图块大小
                </label>
                <select
                  value={form.tileWidth}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    setForm((f) => ({ ...f, tileWidth: v, tileHeight: v }))
                  }}
                  className="w-full px-3 py-2 rounded border text-sm outline-none"
                  style={{
                    background: 'var(--bg-primary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value={16}>16 × 16</option>
                  <option value={32}>32 × 32</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded border text-sm transition-all hover:brightness-125"
                style={{
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                }}
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name.trim()}
                className="flex-1 pixel-font text-xs px-4 py-2 rounded transition-all hover:brightness-125 disabled:opacity-40"
                style={{
                  background: 'var(--accent-gold)',
                  color: 'var(--bg-primary)',
                }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
