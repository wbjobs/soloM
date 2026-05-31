import React, { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getBlockName, getBlockColor } from '../utils/blockColors'

const raycaster = new THREE.Raycaster()
const center = new THREE.Vector2(0, 0)

export default function BlockHighlight({ meshesRef, onBlockBreak }) {
  const highlightRef = useRef()
  const prevKeyRef = useRef({})

  useFrame((state) => {
    if (!highlightRef.current) return

    raycaster.setFromCamera(center, state.camera)
    const intersects = raycaster.intersectObjects(meshesRef.current || [], false)

    if (intersects.length > 0) {
      const hit = intersects[0]
      const normal = hit.face.normal.clone()
      const blockPos = hit.point.clone().sub(normal.multiplyScalar(0.5))
      const bx = Math.round(blockPos.x)
      const by = Math.round(blockPos.y)
      const bz = Math.round(blockPos.z)

      highlightRef.current.position.set(bx, by, bz)
      highlightRef.current.visible = true

      if (state.mouse.buttons === 1 && !prevKeyRef.current.mouse0) {
        if (onBlockBreak) {
          onBlockBreak(bx, by, bz)
        }
      }
    } else {
      highlightRef.current.visible = false
    }

    prevKeyRef.current.mouse0 = state.mouse.buttons === 1
  })

  return (
    <mesh ref={highlightRef} visible={false}>
      <boxGeometry args={[1.01, 1.01, 1.01]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.3}
        depthTest
        side={THREE.FrontSide}
      />
    </mesh>
  )
}
