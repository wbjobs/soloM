import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import * as THREE from 'three'
import { useWarehouseStore } from '@/store/useWarehouseStore'
import type { PendingCargo, CargoItem, OutboundCargo, ColorMode } from '@/types'

interface CargoMeshProps {
  cargo: CargoItem
  onHover: (cargo: CargoItem | null) => void
  colorMode: ColorMode
  isSelected: boolean
  onSelect: (id: string) => void
}

export function CargoMesh({ cargo, onHover, colorMode, isSelected, onSelect }: CargoMeshProps) {
  const meshRef = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const [tick, setTick] = useState(0)
  const getDurationColor = useWarehouseStore(state => state.getDurationColor)

  useEffect(() => {
    if (colorMode !== 'duration') return
    const interval = setInterval(() => setTick(t => t + 1), 2000)
    return () => clearInterval(interval)
  }, [colorMode])

  const depthOffset = (cargo.row * 10 + cargo.col) * 0.0002

  const displayColor = useMemo(() => {
    if (colorMode === 'duration') {
      void tick
      return getDurationColor(cargo.timestamp)
    }
    return cargo.color
  }, [colorMode, cargo.color, cargo.timestamp, getDurationColor, tick])

  const scale = hovered ? 1.05 : isSelected ? 1.03 : 1

  return (
    <mesh
      ref={meshRef}
      position={[cargo.x, cargo.y, cargo.z]}
      castShadow
      renderOrder={cargo.row * 10 + cargo.col}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover(cargo)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(cargo.id)
      }}
    >
      <boxGeometry args={[cargo.width * scale, cargo.height * scale, cargo.depth * scale]} />
      <meshStandardMaterial
        color={displayColor}
        metalness={0.2}
        roughness={0.5}
        emissive={isSelected ? '#ffffff' : displayColor}
        emissiveIntensity={isSelected ? 0.35 : hovered ? 0.2 : 0.05}
        polygonOffset
        polygonOffsetFactor={-1 - depthOffset}
        polygonOffsetUnits={-1 - depthOffset * 10}
      />
      {(hovered || isSelected) && (
        <lineSegments renderOrder={999}>
          <edgesGeometry args={[new THREE.BoxGeometry(cargo.width * 1.04, cargo.height * 1.04, cargo.depth * 1.04)]} />
          <lineBasicMaterial
            color={isSelected ? '#fbbf24' : '#ffffff'}
            transparent
            opacity={isSelected ? 1 : 0.9}
            linewidth={2}
            polygonOffset
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-100}
          />
        </lineSegments>
      )}
    </mesh>
  )
}

interface PendingCargoMeshProps {
  pending: PendingCargo
}

export function PendingCargoMesh({ pending }: PendingCargoMeshProps) {
  const meshRef = useRef<Mesh>(null)
  const localProgress = useRef(0)
  const updateProgress = useWarehouseStore(state => state.updatePendingCargoProgress)
  const finalizePendingCargo = useWarehouseStore(state => state.finalizePendingCargo)

  const arcHeight = useMemo(() => {
    const targetY = pending.endPos[1]
    const minHeight = targetY + pending.height + 1
    const startY = pending.startPos[1]
    return Math.max(minHeight, Math.min(startY, startY - 2))
  }, [pending])

  const depthOffset = useMemo(() => {
    return (pending.targetRow * 10 + pending.targetCol) * 0.0002
  }, [pending])

  useEffect(() => {
    localProgress.current = 0
  }, [pending.id])

  useFrame((_, delta) => {
    if (localProgress.current >= 1) return

    const speed = 0.9
    localProgress.current = Math.min(localProgress.current + delta * speed, 1)

    const eased = 1 - Math.pow(1 - localProgress.current, 3)
    updateProgress(pending.id, localProgress.current)

    if (meshRef.current) {
      const t = localProgress.current
      const arcY = Math.sin(t * Math.PI) * arcHeight

      meshRef.current.position.x = pending.startPos[0] + (pending.endPos[0] - pending.startPos[0]) * eased
      meshRef.current.position.y = pending.startPos[1] + (pending.endPos[1] - pending.startPos[1]) * eased + arcY
      meshRef.current.position.z = pending.startPos[2] + (pending.endPos[2] - pending.startPos[2]) * eased
      meshRef.current.rotation.y = (1 - eased) * Math.PI * 2
      meshRef.current.rotation.x = Math.sin(t * Math.PI * 2) * 0.15
    }

    if (localProgress.current >= 1) {
      setTimeout(() => finalizePendingCargo(pending.id), 50)
    }
  })

  return (
    <mesh
      ref={meshRef}
      position={pending.startPos}
      castShadow
      renderOrder={1000 + pending.targetRow * 10 + pending.targetCol}
    >
      <boxGeometry args={[pending.width, pending.height, pending.depth]} />
      <meshStandardMaterial
        color={pending.color}
        metalness={0.3}
        roughness={0.4}
        emissive={pending.color}
        emissiveIntensity={0.4}
        polygonOffset
        polygonOffsetFactor={-2 - depthOffset}
        polygonOffsetUnits={-2 - depthOffset * 10}
      />
    </mesh>
  )
}

interface OutboundCargoMeshProps {
  outbound: OutboundCargo
}

export function OutboundCargoMesh({ outbound }: OutboundCargoMeshProps) {
  const meshRef = useRef<Mesh>(null)
  const localProgress = useRef(0)
  const finalizeOutboundCargo = useWarehouseStore(state => state.finalizeOutboundCargo)

  useEffect(() => {
    localProgress.current = 0
  }, [outbound.id])

  useFrame((_, delta) => {
    if (localProgress.current >= 1) return

    const speed = 1.0
    localProgress.current = Math.min(localProgress.current + delta * speed, 1)

    if (meshRef.current) {
      const t = localProgress.current
      const eased = t * t

      const arcY = Math.sin(t * Math.PI) * 8

      meshRef.current.position.x = outbound.startPos[0] + (outbound.endPos[0] - outbound.startPos[0]) * eased
      meshRef.current.position.y = outbound.startPos[1] + (outbound.endPos[1] - outbound.startPos[1]) * eased + arcY
      meshRef.current.position.z = outbound.startPos[2] + (outbound.endPos[2] - outbound.startPos[2]) * eased
      meshRef.current.rotation.y = eased * Math.PI * 3
      meshRef.current.rotation.x = Math.sin(t * Math.PI * 2) * 0.2

      const fadeScale = 1 - t * 0.6
      meshRef.current.scale.set(fadeScale, fadeScale, fadeScale)

      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      if (mat) {
        mat.opacity = 1 - t * 0.8
      }
    }

    if (localProgress.current >= 1) {
      setTimeout(() => finalizeOutboundCargo(outbound.id), 50)
    }
  })

  return (
    <mesh
      ref={meshRef}
      position={outbound.startPos}
      castShadow
      renderOrder={2000}
    >
      <boxGeometry args={[outbound.width, outbound.height, outbound.depth]} />
      <meshStandardMaterial
        color={outbound.color}
        metalness={0.3}
        roughness={0.4}
        emissive={outbound.color}
        emissiveIntensity={0.5}
        transparent
        opacity={1}
        polygonOffset
        polygonOffsetFactor={-3}
        polygonOffsetUnits={-30}
      />
    </mesh>
  )
}
