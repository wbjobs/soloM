import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { TileMap, Layer, EventObject } from '../../shared/types'
import { CharacterController, type InputState } from '@/engine/CharacterController'
import { Camera } from '@/engine/Camera'
import { checkEvents, handleEvent, getEventsNear } from '@/engine/EventSystem'
import { fetchMap } from '@/utils/api'
import { TILE_SIZE, getTileColor, getEventColor } from '@/utils/tileset'
import DialogBox from '@/components/game/DialogBox'

interface Toast {
  id: number
  text: string
}

function getSortedLayers(map: TileMap): Layer[] {
  return [...map.layers].sort((a, b) => a.order - b.order)
}

export default function Play() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const [map, setMap] = useState<TileMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [fps, setFps] = useState(0)
  const [showCrt, setShowCrt] = useState(true)
  const [posText, setPosText] = useState('(0, 0)')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogEvent, setDialogEvent] = useState<EventObject | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const characterRef = useRef<CharacterController | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const inputRef = useRef<InputState>({ up: false, down: false, left: false, right: false })
  const frameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const fpsRef = useRef<{ frames: number; lastUpdate: number }>({ frames: 0, lastUpdate: 0 })
  const toastIdRef = useRef(0)
  const triggeredEventsRef = useRef<Set<string>>(new Set())
  const sortedLayersRef = useRef<Layer[]>([])
  const colorGroupsRef = useRef<Map<string, Array<[number, number]>>>(new Map())

  useEffect(() => {
    if (!mapId) return
    async function load() {
      try {
        const data = await fetchMap(mapId)
        setMap(data)
      } catch {
        navigate('/')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mapId])

  useEffect(() => {
    if (!map) return
    const canvas = canvasRef.current
    if (!canvas) return

    function resize() {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const spawnX = map.spawnPoint.x * TILE_SIZE
    const spawnY = map.spawnPoint.y * TILE_SIZE
    characterRef.current = new CharacterController(spawnX, spawnY)
    cameraRef.current = new Camera(spawnX, spawnY)
    triggeredEventsRef.current = new Set()
    sortedLayersRef.current = getSortedLayers(map)
    colorGroupsRef.current.clear()
    lastTimeRef.current = performance.now()
    fpsRef.current = { frames: 0, lastUpdate: performance.now() }

    gameLoop(lastTimeRef.current)

    return () => {
      window.removeEventListener('resize', resize)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [map])

  function gameLoop(timestamp: number) {
    const canvas = canvasRef.current
    const char = characterRef.current
    const cam = cameraRef.current
    if (!canvas || !map || !char || !cam) return

    const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1)
    lastTimeRef.current = timestamp

    if (!dialogOpen) {
      char.update(dt, inputRef.current, map)
      cam.update(char.x, char.y, dt)
    }

    const ctx = canvas.getContext('2d')!
    const { width: cw, height: ch } = canvas
    ctx.fillStyle = '#0f0f1a'
    ctx.fillRect(0, 0, cw, ch)

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
          setDialogEvent(ev)
          setDialogOpen(true)
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

    fpsRef.current.frames++
    const now = performance.now()
    if (now - fpsRef.current.lastUpdate >= 1000) {
      setFps(fpsRef.current.frames)
      fpsRef.current = { frames: 0, lastUpdate: now }
    }

    setPosText(`(${charTileX}, ${charTileY})`)

    frameRef.current = requestAnimationFrame(gameLoop)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': inputRef.current.up = true; break
        case 'ArrowDown': case 's': case 'S': inputRef.current.down = true; break
        case 'ArrowLeft': case 'a': case 'A': inputRef.current.left = true; break
        case 'ArrowRight': case 'd': case 'D': inputRef.current.right = true; break
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
  }, [])

  function addToast(text: string) {
    const id = ++toastIdRef.current
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }

  function handleVirtualInput(direction: 'up' | 'down' | 'left' | 'right', pressed: boolean) {
    inputRef.current[direction] = pressed
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
        <span className="pixel-font text-sm" style={{ color: 'var(--accent-gold)' }}>加载中...</span>
      </div>
    )
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#0f0f1a' }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {showCrt && <div className="crt-overlay" />}

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }}>
        <button
          onClick={() => navigate('/')}
          className="pixel-font text-[10px] px-3 py-1.5 rounded pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold-dim)' }}
        >
          ◀ 返回
        </button>
        <div className="pixel-font text-[9px] flex items-center gap-4" style={{ color: 'var(--text-dim)' }}>
          <span>{map?.name}</span>
          <span>{posText}</span>
          <span>{fps} FPS</span>
          <button
            onClick={() => setShowCrt(!showCrt)}
            className="pointer-events-auto px-2 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.6)', color: showCrt ? 'var(--accent-gold)' : 'var(--text-dim)', border: `1px solid ${showCrt ? 'var(--accent-gold-dim)' : 'var(--border-color)'}` }}
          >
            CRT
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <div className="grid grid-cols-3 grid-rows-3 gap-1" style={{ width: 120, height: 120 }}>
          <div />
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualInput('up', true) }}
            onTouchEnd={() => handleVirtualInput('up', false)}
            onMouseDown={() => handleVirtualInput('up', true)}
            onMouseUp={() => handleVirtualInput('up', false)}
            className="flex items-center justify-center rounded text-lg"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
          >
            ▲
          </button>
          <div />
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualInput('left', true) }}
            onTouchEnd={() => handleVirtualInput('left', false)}
            onMouseDown={() => handleVirtualInput('left', true)}
            onMouseUp={() => handleVirtualInput('left', false)}
            className="flex items-center justify-center rounded text-lg"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
          >
            ◀
          </button>
          <div className="flex items-center justify-center rounded" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
            <span className="text-[8px]" style={{ color: 'var(--text-dim)' }}>+</span>
          </div>
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualInput('right', true) }}
            onTouchEnd={() => handleVirtualInput('right', false)}
            onMouseDown={() => handleVirtualInput('right', true)}
            onMouseUp={() => handleVirtualInput('right', false)}
            className="flex items-center justify-center rounded text-lg"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
          >
            ▶
          </button>
          <div />
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualInput('down', true) }}
            onTouchEnd={() => handleVirtualInput('down', false)}
            onMouseDown={() => handleVirtualInput('down', true)}
            onMouseUp={() => handleVirtualInput('down', false)}
            className="flex items-center justify-center rounded text-lg"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
          >
            ▼
          </button>
          <div />
        </div>
      </div>

      <div className="absolute top-12 right-4 flex flex-col gap-2">
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

      {dialogOpen && dialogEvent && dialogEvent.script && (
        <DialogBox
          script={dialogEvent.script}
          eventX={dialogEvent.x}
          eventY={dialogEvent.y}
          onClose={() => {
            setDialogOpen(false)
            setDialogEvent(null)
          }}
        />
      )}
    </div>
  )
}
