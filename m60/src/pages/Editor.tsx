import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { TileMap, Layer, EventObject, LayerType, EventType } from '../../shared/types'
import { useEditorStore } from '@/stores/editorStore'
import { CharacterController, type InputState } from '@/engine/CharacterController'
import { Camera } from '@/engine/Camera'
import { checkEvents, handleEvent, getEventsNear } from '@/engine/EventSystem'
import { getCollisionLayerData } from '@/engine/CollisionSystem'
import { fetchMap, updateMap, createVersion } from '@/utils/api'
import { TILE_SIZE, COLOR_PALETTE, getTileColor, getEventColor } from '@/utils/tileset'
import Canvas from '@/components/editor/Canvas'
import DialogEditor from '@/components/editor/DialogEditor'
import DialogBox from '@/components/game/DialogBox'

const LAYER_TYPE_COLORS: Record<LayerType, string> = {
  ground: 'var(--accent-green)',
  objects: 'var(--accent-amber)',
  sky: 'var(--accent-cyan)',
  collision: 'var(--accent-red)',
  terrain: 'var(--accent-green)',
  event: 'var(--accent-blue)',
}

const LAYER_TYPE_BG: Record<LayerType, string> = {
  ground: 'rgba(34, 197, 94, 0.15)',
  objects: 'rgba(245, 158, 11, 0.15)',
  sky: 'rgba(6, 182, 212, 0.15)',
  collision: 'rgba(239, 68, 68, 0.15)',
  terrain: 'rgba(34, 197, 94, 0.15)',
  event: 'rgba(59, 130, 246, 0.15)',
}

const EVENT_TYPE_NAMES: Record<EventType, string> = {
  teleport: '传送点',
  npc: 'NPC',
  chest: '宝箱',
  trigger: '触发区域',
  dialog: '对话事件',
  custom: '自定义',
}

interface Toast {
  id: number
  text: string
}

function getSortedLayers(map: TileMap): Layer[] {
  return [...map.layers].sort((a, b) => a.order - b.order)
}

export default function Editor() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const store = useEditorStore()
  const [loading, setLoading] = useState(true)
  const [mapName, setMapName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [addLayerModalOpen, setAddLayerModalOpen] = useState(false)
  const [newLayerName, setNewLayerName] = useState('')
  const [newLayerType, setNewLayerType] = useState<LayerType>('ground')
  const [dialogEditorOpen, setDialogEditorOpen] = useState(false)
  const [dialogEditorEvent, setDialogEditorEvent] = useState<EventObject | null>(null)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [runDialogEvent, setRunDialogEvent] = useState<EventObject | null>(null)

  const runCanvasRef = useRef<HTMLCanvasElement>(null)
  const characterRef = useRef<CharacterController | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const inputRef = useRef<InputState>({ up: false, down: false, left: false, right: false })
  const frameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const toastIdRef = useRef(0)
  const triggeredEventsRef = useRef<Set<string>>(new Set())
  const sortedLayersRef = useRef<Layer[]>([])
  const colorGroupsRef = useRef<Map<string, Array<[number, number]>>>(new Map())

  useEffect(() => {
    if (!mapId) return
    async function load() {
      try {
        const map = await fetchMap(mapId)
        store.setCurrentMap(map)
        setMapName(map.name)
        store.setSelectedLayerId(map.layers[0]?.id ?? null)
      } catch {
        navigate('/')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mapId])

  useEffect(() => {
    return () => {
      store.setCurrentMap(null)
      store.setMode('edit')
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  useEffect(() => {
    if (store.mode === 'run') {
      startRunMode()
    }
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [store.mode])

  function startRunMode() {
    const canvas = runCanvasRef.current
    const map = store.currentMap
    if (!canvas || !map) return

    const rect = canvas.parentElement?.getBoundingClientRect()
    if (rect) {
      canvas.width = rect.width
      canvas.height = rect.height
    }

    const spawnX = map.spawnPoint.x * TILE_SIZE
    const spawnY = map.spawnPoint.y * TILE_SIZE
    characterRef.current = new CharacterController(spawnX, spawnY)
    cameraRef.current = new Camera(spawnX, spawnY)
    triggeredEventsRef.current = new Set()
    sortedLayersRef.current = getSortedLayers(map)
    colorGroupsRef.current.clear()

    lastTimeRef.current = performance.now()
    gameLoop(lastTimeRef.current)
  }

  function gameLoop(timestamp: number) {
    const canvas = runCanvasRef.current
    const map = store.currentMap
    const char = characterRef.current
    const cam = cameraRef.current
    if (!canvas || !map || !char || !cam) return

    const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1)
    lastTimeRef.current = timestamp

    if (!runDialogOpen) {
      char.update(dt, inputRef.current, map)
      cam.update(char.x, char.y, dt)
    }

    const ctx = canvas.getContext('2d')!
    const { width: cw, height: ch } = canvas
    ctx.clearRect(0, 0, cw, ch)

    const viewport = cam.getViewport(map.width, map.height, cw, ch)
    ctx.save()
    ctx.translate(-viewport.x, -viewport.y)

    const startCol = Math.max(0, Math.floor(viewport.x / TILE_SIZE))
    const startRow = Math.max(0, Math.floor(viewport.y / TILE_SIZE))
    const endCol = Math.min(map.width, Math.ceil((viewport.x + cw) / TILE_SIZE))
    const endRow = Math.min(map.height, Math.ceil((viewport.y + ch) / TILE_SIZE))

    const colorGroups = colorGroupsRef.current
    const mapWidth = map.width

    for (const layer of sortedLayersRef.current) {
      if (!layer.visible || layer.type === 'collision') continue

      colorGroups.clear()
      for (let row = startRow; row < endRow; row++) {
        const rowBase = row * mapWidth
        for (let col = startCol; col < endCol; col++) {
          const tileId = layer.data[rowBase + col]
          if (tileId > 0) {
            const color = getTileColor(tileId)
            let group = colorGroups.get(color)
            if (!group) {
              group = []
              colorGroups.set(color, group)
            }
            group.push([col, row])
          }
        }
      }

      for (const [color, tiles] of colorGroups) {
        ctx.fillStyle = color
        ctx.beginPath()
        for (let i = 0; i < tiles.length; i++) {
          const [tc, tr] = tiles[i]
          const tx = tc * TILE_SIZE
          const ty = tr * TILE_SIZE
          ctx.rect(tx, ty, TILE_SIZE, TILE_SIZE)
        }
        ctx.fill()
      }
    }

    const charTileX = Math.floor((char.x + TILE_SIZE / 2) / TILE_SIZE)
    const charTileY = Math.floor((char.y + TILE_SIZE / 2) / TILE_SIZE)
    const viewEvents = getEventsNear(map, charTileX, charTileY, 3)

    for (const event of viewEvents) {
      ctx.fillStyle = getEventColor(event.type)
      const ex = event.x * TILE_SIZE + TILE_SIZE / 2
      const ey = event.y * TILE_SIZE + TILE_SIZE / 2
      const size = TILE_SIZE * 0.3
      ctx.beginPath()
      ctx.moveTo(ex, ey - size)
      ctx.lineTo(ex + size, ey)
      ctx.lineTo(ex, ey + size)
      ctx.lineTo(ex - size, ey)
      ctx.closePath()
      ctx.fill()
    }

    const charRect = char.getCharacterRect()
    ctx.fillStyle = '#5a8c28'
    ctx.fillRect(charRect.x, charRect.y, charRect.width, charRect.height)
    ctx.fillStyle = '#3e5c1e'
    const indicatorSize = 6
    const cx = charRect.x + charRect.width / 2
    const cy = charRect.y + charRect.height / 2
    switch (char.direction) {
      case 'up': ctx.fillRect(cx - 2, charRect.y, indicatorSize, indicatorSize); break
      case 'down': ctx.fillRect(cx - 2, charRect.y + charRect.height - indicatorSize, indicatorSize, indicatorSize); break
      case 'left': ctx.fillRect(charRect.x, cy - 2, indicatorSize, indicatorSize); break
      case 'right': ctx.fillRect(charRect.x + charRect.width - indicatorSize, cy - 2, indicatorSize, indicatorSize); break
    }

    ctx.restore()

    const activeEvents = checkEvents(map, charRect.x, charRect.y, charRect.width, charRect.height)
    for (const ev of activeEvents) {
      if (!triggeredEventsRef.current.has(ev.id)) {
        triggeredEventsRef.current.add(ev.id)
        if (ev.script && ev.script.lines.length > 0) {
          setRunDialogEvent(ev)
          setRunDialogOpen(true)
          inputRef.current = { up: false, down: false, left: false, right: false }
        } else {
          addToast(handleEvent(ev))
        }
      }
    }

    const triggeredToRemove: string[] = []
    triggeredEventsRef.current.forEach((evId) => {
      const ev = map.events.find((e) => e.id === evId)
      if (!ev) {
        triggeredToRemove.push(evId)
        return
      }
      const evCenterX = ev.x * TILE_SIZE + TILE_SIZE / 2
      const evCenterY = ev.y * TILE_SIZE + TILE_SIZE / 2
      const dx = charRect.x + charRect.width / 2 - evCenterX
      const dy = charRect.y + charRect.height / 2 - evCenterY
      if (dx * dx + dy * dy > TILE_SIZE * TILE_SIZE * 4) {
        triggeredToRemove.push(evId)
      }
    })
    for (const evId of triggeredToRemove) {
      triggeredEventsRef.current.delete(evId)
    }

    frameRef.current = requestAnimationFrame(gameLoop)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (store.mode !== 'run') return
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': inputRef.current.up = true; break
        case 'ArrowDown': case 's': case 'S': inputRef.current.down = true; break
        case 'ArrowLeft': case 'a': case 'A': inputRef.current.left = true; break
        case 'ArrowRight': case 'd': case 'D': inputRef.current.right = true; break
        case 'Escape': store.setMode('edit'); break
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': inputRef.current.up = false; break
        case 'ArrowDown': case 's': case 'S': inputRef.current.down = false; break
        case 'ArrowLeft': case 'a': case 'A': inputRef.current.left = false; break
        case 'ArrowRight': case 'd': case 'D': inputRef.current.right = false; break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [store.mode])

  function addToast(text: string) {
    const id = ++toastIdRef.current
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }

  async function handleSave() {
    if (!store.currentMap || !mapId) return
    setSaving(true)
    try {
      const updated = await updateMap(mapId, store.currentMap)
      store.setCurrentMap(updated)
      addToast('地图已保存')
    } catch {
      addToast('保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleVersion() {
    if (!mapId) return
    try {
      await createVersion(mapId, `版本 ${store.currentMap ? store.currentMap.version + 1 : 1}`)
      addToast('版本已创建')
    } catch {
      addToast('创建版本失败')
    }
  }

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
        <span className="pixel-font text-sm" style={{ color: 'var(--accent-gold)' }}>加载中...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-sm hover:opacity-80" style={{ color: 'var(--text-dim)' }}>◀ 首页</button>
          {editingName ? (
            <input
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              onBlur={() => {
                setEditingName(false)
                if (store.currentMap) store.updateMapData((m) => ({ ...m, name: mapName }))
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(false) }}
              className="px-2 py-1 rounded border text-sm"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              autoFocus
            />
          ) : (
            <span
              className="pixel-font text-xs cursor-pointer hover:opacity-80"
              style={{ color: 'var(--accent-gold)' }}
              onClick={() => setEditingName(true)}
            >
              {mapName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => store.pushUndo()}
            className="text-sm px-2 py-1 rounded hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            title="撤销 (Ctrl+Z)"
          >↩</button>
          <button
            onClick={() => store.redo()}
            className="text-sm px-2 py-1 rounded hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            title="重做 (Ctrl+Y)"
          >↪</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="pixel-font text-[10px] px-3 py-1.5 rounded hover:brightness-125 disabled:opacity-40"
            style={{ background: 'var(--accent-green)', color: '#fff' }}
          >
            💾 保存
          </button>
          <button
            onClick={handleVersion}
            className="pixel-font text-[10px] px-3 py-1.5 rounded border hover:brightness-125"
            style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
          >
            📋 版本
          </button>
          <div
            className="pixel-font text-[10px] px-3 py-1.5 rounded cursor-pointer select-none"
            style={{
              background: store.mode === 'edit' ? 'var(--accent-gold)' : 'var(--accent-red)',
              color: store.mode === 'edit' ? 'var(--bg-primary)' : '#fff',
            }}
            onClick={() => store.setMode(store.mode === 'edit' ? 'run' : 'edit')}
          >
            {store.mode === 'edit' ? '✏️ EDIT' : '🎮 RUN'}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {store.mode === 'edit' && (
          <div className="flex flex-col items-center py-3 px-2 gap-2 border-r shrink-0" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
            {(['brush', 'eraser', 'fill', 'select', 'event'] as const).map((t) => (
              <button
                key={t}
                onClick={() => store.setTool(t)}
                className="w-9 h-9 flex items-center justify-center rounded text-lg transition-all"
                style={{
                  background: store.tool === t ? 'var(--accent-gold)' : 'transparent',
                  opacity: store.tool === t ? 1 : 0.6,
                }}
                title={t}
              >
                {t === 'brush' ? '🖌️' : t === 'eraser' ? '🧹' : t === 'fill' ? '🪣' : t === 'select' ? '👆' : '⚡'}
              </button>
            ))}
            <div className="my-1 w-full border-t" style={{ borderColor: 'var(--border-color)' }} />
            <button
              onClick={() => store.toggleGrid()}
              className="w-9 h-9 flex items-center justify-center rounded text-sm transition-all"
              style={{ opacity: store.showGrid ? 1 : 0.4 }}
              title="网格"
            >
              ▦
            </button>
            <button
              onClick={() => store.toggleCrt()}
              className="w-9 h-9 flex items-center justify-center rounded text-sm transition-all"
              style={{ opacity: store.showCrt ? 1 : 0.4 }}
              title="CRT效果"
            >
              📺
            </button>
            <div className="my-1 w-full border-t" style={{ borderColor: 'var(--border-color)' }} />
            <button
              onClick={() => store.setZoom(store.zoom + 0.25)}
              className="w-9 h-9 flex items-center justify-center rounded text-sm"
              style={{ color: 'var(--text-secondary)' }}
              title="放大"
            >
              +
            </button>
            <span className="pixel-font text-[8px]" style={{ color: 'var(--text-dim)' }}>
              {Math.round(store.zoom * 100)}%
            </span>
            <button
              onClick={() => store.setZoom(store.zoom - 0.25)}
              className="w-9 h-9 flex items-center justify-center rounded text-sm"
              style={{ color: 'var(--text-secondary)' }}
              title="缩小"
            >
              −
            </button>
          </div>
        )}

        <div className="flex-1 relative overflow-hidden" style={{ background: '#0d0d1a' }}>
          {store.mode === 'edit' ? (
            <Canvas />
          ) : (
            <canvas ref={runCanvasRef} className="w-full h-full" />
          )}
          {store.mode === 'run' && (
            <div className="absolute bottom-4 left-4 pixel-font text-[8px] px-3 py-2 rounded" style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--text-dim)' }}>
              WASD/方向键移动 · ESC返回编辑
            </div>
          )}
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="pixel-font text-[9px] px-3 py-2 rounded animate-pulse"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold-dim)' }}
              >
                {t.text}
              </div>
            ))}
          </div>
        </div>

        {store.mode === 'edit' && store.currentMap && (
          <div className="w-64 overflow-y-auto border-l shrink-0" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
            <PanelSection title="图层" collapsed={!!collapsed.layers} onToggle={() => toggleCollapse('layers')}>
              <div className="space-y-1 mb-2">
                {store.currentMap.layers.sort((a, b) => a.order - b.order).map((layer, index) => (
                  <div
                    key={layer.id}
                    className="flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-xs"
                    style={{
                      background: store.selectedLayerId === layer.id ? 'var(--bg-tertiary)' : 'transparent',
                      borderLeft: store.selectedLayerId === layer.id ? '3px solid var(--accent-gold)' : '3px solid transparent',
                      color: store.selectedLayerId === layer.id ? 'var(--accent-gold)' : 'var(--text-secondary)',
                    }}
                    onClick={() => store.setSelectedLayerId(layer.id)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (index > 0) store.reorderLayer(layer.id, index - 1)
                        }}
                        className="w-4 h-3 flex items-center justify-center text-[8px] hover:opacity-80 disabled:opacity-30"
                        disabled={index === 0}
                      >
                        ▲
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (index < store.currentMap!.layers.length - 1) store.reorderLayer(layer.id, index + 1)
                        }}
                        className="w-4 h-3 flex items-center justify-center text-[8px] hover:opacity-80 disabled:opacity-30"
                        disabled={index === store.currentMap!.layers.length - 1}
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        store.updateLayer(layer.id, { visible: !layer.visible })
                      }}
                      className="w-5 text-center"
                    >
                      {layer.visible ? '👁️' : '🚫'}
                    </button>
                    <span className="flex-1 truncate">{layer.name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        color: LAYER_TYPE_COLORS[layer.type],
                        background: LAYER_TYPE_BG[layer.type],
                      }}
                    >
                      {layer.type}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        store.updateLayer(layer.id, { locked: !layer.locked })
                      }}
                      className="w-5 text-center"
                    >
                      {layer.locked ? '🔒' : '🔓'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        store.deleteLayer(layer.id)
                      }}
                      className="w-5 text-center text-red-400 hover:opacity-80 disabled:opacity-30 disabled:text-gray-500"
                      disabled={layer.type === 'collision'}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setNewLayerName('')
                  setNewLayerType('ground')
                  setAddLayerModalOpen(true)
                }}
                className="w-full pixel-font text-[10px] px-3 py-1.5 rounded border hover:brightness-125"
                style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
              >
                + 添加图层
              </button>
            </PanelSection>

            <PanelSection title="图块面板" collapsed={!!collapsed.tiles} onToggle={() => toggleCollapse('tiles')}>
              <div className="grid grid-cols-4 gap-1 px-1">
                {COLOR_PALETTE.map((color, i) => (
                  <button
                    key={i}
                    onClick={() => store.setSelectedTileId(i + 1)}
                    className="w-full aspect-square rounded border-2 transition-all"
                    style={{
                      background: color,
                      borderColor: store.selectedTileId === i + 1 ? 'var(--accent-gold)' : 'var(--border-color)',
                    }}
                  />
                ))}
              </div>
            </PanelSection>

            <PanelSection title="事件" collapsed={!!collapsed.events} onToggle={() => toggleCollapse('events')}>
              <div className="space-y-1 mb-2">
                {(['teleport', 'npc', 'chest', 'trigger', 'dialog', 'custom'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => { store.setTool('event'); store.setPlacingEventType(type) }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs border transition-all hover:brightness-125"
                    style={{
                      borderColor: store.placingEventType === type && store.tool === 'event' ? 'var(--accent-gold)' : 'var(--border-color)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ color: getEventColor(type) }}>◆</span>
                    <span>{EVENT_TYPE_NAMES[type]}</span>
                  </button>
                ))}
              </div>
              {store.currentMap.events.length === 0 ? (
                <div className="text-xs px-2 py-1" style={{ color: 'var(--text-dim)' }}>无事件</div>
              ) : (
                store.currentMap.events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs group"
                    style={{
                      background: store.selectedEventId === ev.id ? 'var(--bg-tertiary)' : 'transparent',
                      color: store.selectedEventId === ev.id ? 'var(--accent-gold)' : 'var(--text-secondary)',
                    }}
                    onClick={() => { store.setSelectedEventId(ev.id); store.setTool('select') }}
                  >
                    <span style={{ color: getEventColor(ev.type) }}>◆</span>
                    <span className="flex-1 truncate">{EVENT_TYPE_NAMES[ev.type]}</span>
                    <span style={{ color: 'var(--text-dim)' }}>({ev.x},{ev.y})</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        store.updateMapData((m) => ({
                          ...m,
                          events: m.events.filter((x) => x.id !== ev.id),
                        }))
                        if (store.selectedEventId === ev.id) store.setSelectedEventId(null)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </PanelSection>

            <PanelSection title="属性" collapsed={!!collapsed.props} onToggle={() => toggleCollapse('props')}>
              <div className="space-y-2 text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
                {store.selectedEventId && (() => {
                  const ev = store.currentMap?.events.find((e) => e.id === store.selectedEventId)
                  if (!ev) return null
                  return (
                    <div className="space-y-2">
                      <div>类型: <span style={{ color: getEventColor(ev.type) }}>{EVENT_TYPE_NAMES[ev.type]}</span></div>
                      <div>位置: ({ev.x}, {ev.y})</div>
                      {(ev.type === 'npc' || ev.type === 'dialog' || ev.type === 'custom') && (
                        <button
                          onClick={() => {
                            setDialogEditorEvent(ev)
                            setDialogEditorOpen(true)
                          }}
                          className="w-full pixel-font text-[10px] px-2 py-1.5 rounded"
                          style={{ background: 'var(--accent-gold)', color: 'var(--bg-primary)' }}
                        >
                          💬 编辑对话
                        </button>
                      )}
                      {Object.entries(ev.properties).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-1">
                          <span className="flex-1">{k}:</span>
                          <input
                            value={v}
                            onChange={(e) => {
                              store.updateMapData((m) => ({
                                ...m,
                                events: m.events.map((x) => x.id === ev.id ? { ...x, properties: { ...x.properties, [k]: e.target.value } } : x),
                              }))
                            }}
                            className="flex-1 px-1 py-0.5 rounded border text-[10px]"
                            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const key = prompt('属性名:')
                          if (!key) return
                          store.updateMapData((m) => ({
                            ...m,
                            events: m.events.map((x) => x.id === ev.id ? { ...x, properties: { ...x.properties, [key]: '' } } : x),
                          }))
                        }}
                        className="text-[10px] px-2 py-0.5 rounded border"
                        style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
                      >
                        + 添加属性
                      </button>
                    </div>
                  )
                })()}
                {store.selectedLayerId && !store.selectedEventId && (() => {
                  const layer = store.currentMap?.layers.find((l) => l.id === store.selectedLayerId)
                  if (!layer) return null
                  return (
                    <div className="space-y-1">
                      <div>名称: {layer.name}</div>
                      <div>类型: {layer.type}</div>
                      <div>可见: {layer.visible ? '是' : '否'}</div>
                      <div>锁定: {layer.locked ? '是' : '否'}</div>
                    </div>
                  )
                })()}
                {!store.selectedEventId && !store.selectedLayerId && (
                  <div style={{ color: 'var(--text-dim)' }}>选择图层或事件查看属性</div>
                )}
              </div>
            </PanelSection>
          </div>
        )}
      </div>

      {addLayerModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-lg p-4 w-72" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h3 className="pixel-font text-sm mb-4" style={{ color: 'var(--accent-gold)' }}>添加新图层</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>图层名称</label>
                <input
                  type="text"
                  value={newLayerName}
                  onChange={(e) => setNewLayerName(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border text-sm"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="输入图层名称"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>图层类型</label>
                <select
                  value={newLayerType}
                  onChange={(e) => setNewLayerType(e.target.value as LayerType)}
                  className="w-full px-2 py-1.5 rounded border text-sm"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="ground">ground</option>
                  <option value="objects">objects</option>
                  <option value="sky">sky</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setAddLayerModalOpen(false)}
                className="flex-1 pixel-font text-[10px] px-3 py-1.5 rounded border"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (newLayerName.trim()) {
                    store.addLayer({ name: newLayerName.trim(), type: newLayerType })
                    setAddLayerModalOpen(false)
                  }
                }}
                className="flex-1 pixel-font text-[10px] px-3 py-1.5 rounded hover:brightness-125"
                style={{ background: 'var(--accent-gold)', color: 'var(--bg-primary)' }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogEditorOpen && dialogEditorEvent && (
        <DialogEditor
          script={dialogEditorEvent.script}
          onSave={(script) => {
            store.updateMapData((m) => ({
              ...m,
              events: m.events.map((e) => e.id === dialogEditorEvent.id ? { ...e, script } : e),
            }))
            setDialogEditorOpen(false)
            addToast('对话已保存')
          }}
          onClose={() => setDialogEditorOpen(false)}
        />
      )}

      {runDialogOpen && runDialogEvent && runDialogEvent.script && (
        <DialogBox
          script={runDialogEvent.script}
          eventX={runDialogEvent.x}
          eventY={runDialogEvent.y}
          onClose={() => {
            setRunDialogOpen(false)
            setRunDialogEvent(null)
          }}
        />
      )}
    </div>
  )
}

function PanelSection({ title, collapsed, onToggle, children }: {
  title: string
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b" style={{ borderColor: 'var(--border-color)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium"
        style={{ color: 'var(--accent-gold)' }}
      >
        <span className="pixel-font text-[10px]">{title}</span>
        <span style={{ color: 'var(--text-dim)' }}>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && <div className="px-2 pb-2">{children}</div>}
    </div>
  )
}
