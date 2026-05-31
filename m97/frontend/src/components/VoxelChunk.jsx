import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import * as THREE from 'three'
import { getBlockColor } from '../utils/blockColors'

const SUB_MESH_MAX = 16384
const tempMatrix = new THREE.Matrix4()
const tempColor = new THREE.Color()
const SKIP_BLOCK_IDS = new Set([9, 11])

function isBlockOccluded(block, blockSet) {
  const { x, y, z } = block
  return (
    blockSet.has(`${x + 1},${y},${z}`) &&
    blockSet.has(`${x - 1},${y},${z}`) &&
    blockSet.has(`${x},${y + 1},${z}`) &&
    blockSet.has(`${x},${y - 1},${z}`) &&
    blockSet.has(`${x},${y},${z + 1}`) &&
    blockSet.has(`${x},${y},${z - 1}`)
  )
}

function SubMesh({ blocks, onBlockClick }) {
  const meshRef = useRef()
  const count = blocks.length

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || count === 0) return

    for (let i = 0; i < count; i++) {
      const block = blocks[i]
      tempMatrix.makeTranslation(block.x, block.y, block.z)
      mesh.setMatrixAt(i, tempMatrix)
      tempColor.set(getBlockColor(block.blockId))
      mesh.setColorAt(i, tempColor)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [blocks, count])

  const handleClick = useCallback((e) => {
    if (!onBlockClick) return
    e.stopPropagation()
    const instanceId = e.instanceId
    if (instanceId === undefined) return

    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    mesh.getMatrixAt(instanceId, matrix)
    const position = new THREE.Vector3()
    position.setFromMatrixPosition(matrix)

    onBlockClick(Math.round(position.x), Math.round(position.y), Math.round(position.z))
  }, [onBlockClick])

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      onClick={handleClick}
      castShadow
      receiveShadow
      frustumCulled
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  )
}

export default function VoxelChunk({ chunkData, removedBlocks, onBlockClick }) {
  const subMeshes = useMemo(() => {
    if (!chunkData || !chunkData.blocks || chunkData.blocks.length === 0) return []

    const blockSet = new Set()
    for (const block of chunkData.blocks) {
      if (SKIP_BLOCK_IDS.has(block.blockId)) continue
      const key = `${block.x},${block.y},${block.z}`
      if (!removedBlocks.has(key)) {
        blockSet.add(key)
      }
    }

    const visible = []
    for (const block of chunkData.blocks) {
      if (SKIP_BLOCK_IDS.has(block.blockId)) continue
      const key = `${block.x},${block.y},${block.z}`
      if (removedBlocks.has(key)) continue
      if (!isBlockOccluded(block, blockSet)) {
        visible.push(block)
      }
    }

    const result = []
    for (let i = 0; i < visible.length; i += SUB_MESH_MAX) {
      result.push(visible.slice(i, i + SUB_MESH_MAX))
    }
    return result
  }, [chunkData, removedBlocks])

  if (subMeshes.length === 0) return null

  return (
    <group>
      {subMeshes.map((blocks, idx) => (
        <SubMesh
          key={idx}
          blocks={blocks}
          onBlockClick={onBlockClick}
        />
      ))}
    </group>
  )
}
