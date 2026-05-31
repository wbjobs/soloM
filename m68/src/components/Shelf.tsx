import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { Group } from 'three'

const ROWS = 10
const COLS = 10

export function Shelf() {
  const groupRef = useRef<Group>(null)

  const shelfMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3a3f47',
        metalness: 0.6,
        roughness: 0.4,
      }),
    []
  )

  const frameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#5a5f67',
        metalness: 0.8,
        roughness: 0.2,
      }),
    []
  )

  const shelves = useMemo(() => {
    const elements: JSX.Element[] = []
    const layers = Math.ceil(ROWS / 2)

    for (let layer = 0; layer < layers; layer++) {
      const y = layer * 1.2

      elements.push(
        <mesh key={`shelf-${layer}`} position={[0, y, 0]} material={shelfMaterial} receiveShadow>
          <boxGeometry args={[10.2, 0.08, 1.4]} />
        </mesh>
      )

      elements.push(
        <mesh key={`back-${layer}`} position={[0, y + 0.5, -0.7]} material={frameMaterial}>
          <boxGeometry args={[10.2, 1.1, 0.05]} />
        </mesh>
      )

      elements.push(
        <lineSegments key={`grid-${layer}`}>
          <bufferGeometry
            ref={(geo) => {
              if (!geo) return
              const points: number[] = []
              for (let col = 0; col <= COLS; col++) {
                const x = col - COLS / 2
                points.push(x, y + 0.041, -0.6)
                points.push(x, y + 0.041, 0.6)
              }
              for (let col = 0; col <= 2; col++) {
                const z = -0.6 + col * 0.6
                points.push(-COLS / 2, y + 0.041, z)
                points.push(COLS / 2, y + 0.041, z)
              }
              geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
            }}
          />
          <lineBasicMaterial color="#6b7280" transparent opacity={0.6} />
        </lineSegments>
      )
    }

    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? -5.1 : 5.1
      elements.push(
        <mesh key={`side-${side}`} position={[x, (layers * 1.2) / 2 - 0.6, 0]} material={frameMaterial}>
          <boxGeometry args={[0.08, layers * 1.2, 1.4]} />
        </mesh>
      )
    }

    elements.push(
      <mesh key={`bottom`} position={[0, -0.06, 0]} material={frameMaterial} receiveShadow>
        <boxGeometry args={[10.6, 0.08, 1.6]} />
      </mesh>
    )

    return elements
  }, [shelfMaterial, frameMaterial])

  return <group ref={groupRef}>{shelves}</group>
}
