import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { Shelf } from './Shelf'
import { CargoMesh, PendingCargoMesh, OutboundCargoMesh } from './CargoMesh'
import { useWarehouseStore } from '@/store/useWarehouseStore'
import type { CargoItem, ColorMode, SelectionRect } from '@/types'

function SceneContent({
  onHoverCargo,
  colorMode,
  selectedCargoIds,
  onToggleSelect,
  selectionMode,
}: {
  onHoverCargo: (cargo: CargoItem | null) => void
  colorMode: ColorMode
  selectedCargoIds: Set<string>
  onToggleSelect: (id: string) => void
  selectionMode: boolean
}) {
  const cargos = useWarehouseStore(state => state.cargos)
  const pendingCargos = useWarehouseStore(state => state.pendingCargos)
  const outboundCargos = useWarehouseStore(state => state.outboundCargos)

  return (
    <>
      <ambientLight color="#334455" intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-15, 15, 15, -15, 0.5, 100]} />
      </directionalLight>
      <directionalLight position={[-10, 15, -10]} intensity={0.5} />

      <Shelf />

      {cargos.map(cargo => (
        <CargoMesh
          key={cargo.id}
          cargo={cargo}
          onHover={onHoverCargo}
          colorMode={colorMode}
          isSelected={selectedCargoIds.has(cargo.id)}
          onSelect={onToggleSelect}
        />
      ))}

      {pendingCargos.map(pending => (
        <PendingCargoMesh key={pending.id} pending={pending} />
      ))}

      {outboundCargos.map(outbound => (
        <OutboundCargoMesh key={outbound.id} outbound={outbound} />
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1a1f2b" roughness={0.8} />
      </mesh>

      <gridHelper args={[40, 40, '#2a3140', '#232838']} position={[0, -0.49, 0]} />

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={8}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 2.5, 0]}
        enabled={!selectionMode}
      />
    </>
  )
}

interface TooltipProps {
  cargo: CargoItem | null
  colorMode: ColorMode
}

function Tooltip({ cargo, colorMode }: TooltipProps) {
  const { camera, gl } = useThree()
  const [position, setPosition] = useState({ x: 0, y: 0, visible: false })

  useMemo(() => {
    if (!cargo) {
      setPosition(p => ({ ...p, visible: false }))
      return
    }

    const vector = new THREE.Vector3(cargo.x, cargo.y + cargo.height / 2, cargo.z)
    vector.project(camera)
    const canvas = gl.domElement
    const rect = canvas.getBoundingClientRect()

    setPosition({
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-vector.y * 0.5 + 0.5) * rect.height,
      visible: true,
    })
  }, [cargo, camera, gl])

  if (!cargo || !position.visible) return null

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getDuration = (timestamp: number) => {
    const elapsed = Date.now() - timestamp
    const seconds = Math.floor(elapsed / 1000)
    if (seconds < 60) return `${seconds}秒`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}分钟`
    const hours = Math.floor(minutes / 60)
    return `${hours}小时${minutes % 60}分钟`
  }

  return (
    <Html
      style={{
        left: position.x + 15,
        top: position.y - 10,
        pointerEvents: 'none',
      }}
      zIndexRange={[100, 0]}
    >
      <div className="bg-slate-900/90 backdrop-blur-md rounded-lg p-3 border border-emerald-400/30 shadow-xl shadow-emerald-500/10 min-w-[200px]">
        <div className="font-bold text-emerald-400 text-sm mb-2 font-mono">{cargo.name}</div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-slate-300">
            <span>尺寸</span>
            <span className="text-slate-100 font-mono">{cargo.width.toFixed(2)} × {cargo.height.toFixed(2)} × {cargo.depth.toFixed(2)}m</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>格口</span>
            <span className="text-slate-100 font-mono">第 {cargo.row + 1} 行 · 第 {cargo.col + 1} 列</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>体积</span>
            <span className="text-slate-100 font-mono">{(cargo.width * cargo.height * cargo.depth).toFixed(3)}m³</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>入库时间</span>
            <span className="text-slate-100 font-mono">{formatTime(cargo.timestamp)}</span>
          </div>
          {colorMode === 'duration' && (
            <div className="flex justify-between text-slate-300">
              <span>存放时长</span>
              <span className="text-amber-400 font-mono">{getDuration(cargo.timestamp)}</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: colorMode === 'duration'
                ? useWarehouseStore.getState().getDurationColor(cargo.timestamp)
                : cargo.color
            }}
          />
          <span className="text-slate-400 text-xs">
            {colorMode === 'duration' ? '按时长着色' : cargo.color === '#00e5a0' ? '小件货物' : cargo.color === '#ff9500' ? '中件货物' : '大件货物'}
          </span>
        </div>
      </div>
    </Html>
  )
}

function Scene({
  onHoverCargo,
  hoveredCargo,
  colorMode,
  selectedCargoIds,
  onToggleSelect,
  selectionMode,
}: {
  onHoverCargo: (cargo: CargoItem | null) => void
  hoveredCargo: CargoItem | null
  colorMode: ColorMode
  selectedCargoIds: Set<string>
  onToggleSelect: (id: string) => void
  selectionMode: boolean
}) {
  return (
    <>
      <SceneContent
        onHoverCargo={onHoverCargo}
        colorMode={colorMode}
        selectedCargoIds={selectedCargoIds}
        onToggleSelect={onToggleSelect}
        selectionMode={selectionMode}
      />
      <Tooltip cargo={hoveredCargo} colorMode={colorMode} />
    </>
  )
}

interface WarehouseSceneProps {
  onHoverCargo: (cargo: CargoItem | null) => void
  hoveredCargo: CargoItem | null
  colorMode: ColorMode
  selectedCargoIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectCargos: (ids: string[]) => void
  selectionMode: boolean
}

export function WarehouseScene({
  onHoverCargo,
  hoveredCargo,
  colorMode,
  selectedCargoIds,
  onToggleSelect,
  onSelectCargos,
  selectionMode,
}: WarehouseSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const isDragging = useRef(false)
  const startPoint = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectionMode) return
    if (e.button !== 0) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    isDragging.current = true
    startPoint.current = { x, y }
    setSelectionRect({ startX: x, startY: y, endX: x, endY: y })
  }, [selectionMode])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !selectionMode) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setSelectionRect(prev => prev ? { ...prev, endX: x, endY: y } : null)
  }, [selectionMode])

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current || !selectionRect) {
      isDragging.current = false
      return
    }

    isDragging.current = false

    const container = containerRef.current
    if (!container) return

    const canvas = container.querySelector('canvas')
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const left = Math.min(selectionRect.startX, selectionRect.endX)
    const right = Math.max(selectionRect.startX, selectionRect.endX)
    const top = Math.min(selectionRect.startY, selectionRect.endY)
    const bottom = Math.max(selectionRect.startY, selectionRect.endY)

    if (right - left < 5 || bottom - top < 5) {
      setSelectionRect(null)
      return
    }

    const renderer = (canvas as any).__reactThreeFiber?.root?.getState?.()
    if (!renderer) {
      setSelectionRect(null)
      return
    }

    const { camera, scene } = renderer

    const ndcLeft = (left / rect.width) * 2 - 1
    const ndcRight = (right / rect.width) * 2 - 1
    const ndcTop = -((top / rect.height) * 2 - 1)
    const ndcBottom = -((bottom / rect.height) * 2 - 1)

    const frustum = new THREE.Frustum()
    const projScreenMatrix = new THREE.Matrix4()

    const l = Math.min(ndcLeft, ndcRight)
    const r = Math.max(ndcLeft, ndcRight)
    const t = Math.max(ndcTop, ndcBottom)
    const b = Math.min(ndcTop, ndcBottom)

    const customProjection = new THREE.Matrix4().makeOrthographic(l, r, t, b, -1000, 1000)
    projScreenMatrix.multiplyMatrices(customProjection, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projScreenMatrix)

    const selectedIds: string[] = []
    const cargos = useWarehouseStore.getState().cargos

    for (const cargo of cargos) {
      const pos = new THREE.Vector3(cargo.x, cargo.y, cargo.z)
      const sphere = new THREE.Sphere(pos, Math.max(cargo.width, cargo.height, cargo.depth) * 0.7)
      if (frustum.intersectsSphere(sphere)) {
        selectedIds.push(cargo.id)
      }
    }

    if (selectedIds.length > 0) {
      onSelectCargos(selectedIds)
    }

    setSelectionRect(null)
  }, [selectionRect, onSelectCargos])

  const rectStyle = useMemo(() => {
    if (!selectionRect) return null
    const left = Math.min(selectionRect.startX, selectionRect.endX)
    const top = Math.min(selectionRect.startY, selectionRect.endY)
    const width = Math.abs(selectionRect.endX - selectionRect.startX)
    const height = Math.abs(selectionRect.endY - selectionRect.startY)
    return { left, top, width, height }
  }, [selectionRect])

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        isDragging.current = false
        setSelectionRect(null)
      }}
    >
      <Canvas
        shadows
        camera={{ position: [15, 12, 20], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0f141e')
        }}
      >
        <fog attach="fog" args={['#0f141e', 25, 60]} />
        <Scene
          onHoverCargo={onHoverCargo}
          hoveredCargo={hoveredCargo}
          colorMode={colorMode}
          selectedCargoIds={selectedCargoIds}
          onToggleSelect={onToggleSelect}
          selectionMode={selectionMode}
        />
      </Canvas>

      {selectionMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs px-3 py-1.5 rounded-full backdrop-blur-md pointer-events-none">
          🖱️ 拖拽框选货物 · 点击单个选择
        </div>
      )}

      {rectStyle && (
        <div
          className="absolute border-2 border-amber-400/70 bg-amber-400/10 pointer-events-none rounded-sm"
          style={{
            left: rectStyle.left,
            top: rectStyle.top,
            width: rectStyle.width,
            height: rectStyle.height,
          }}
        />
      )}
    </div>
  )
}
