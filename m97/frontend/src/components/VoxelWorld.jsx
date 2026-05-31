import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import VoxelChunk from './VoxelChunk'
import FirstPersonControls from './FirstPersonControls'
import BlockHighlight from './BlockHighlight'
import DayNightCycle from './DayNightCycle'
import { fetchRegion, fetchDemoRegion, fetchChunk, fetchDemoChunk } from '../grpc/client'
import SpatialHash from '../utils/SpatialHash'

const CHUNK_SIZE = 16
const VIEW_DISTANCE = 2

export default function VoxelWorld({ useDemoData = true, worldPath = '' }) {
  const { camera } = useThree()
  const [chunks, setChunks] = useState(new Map())
  const [removedBlocks, setRemovedBlocks] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [dayNightEnabled, setDayNightEnabled] = useState(true)
  const loadedChunksRef = useRef(new Set())
  const loadingRef = useRef(new Set())
  const spatialHashRef = useRef(new SpatialHash())
  const lastChunkPosRef = useRef({ x: 9999, z: 9999 })

  const loadChunk = useCallback(async (cx, cz) => {
    const key = `${cx},${cz}`
    if (loadedChunksRef.current.has(key) || loadingRef.current.has(key)) return
    loadingRef.current.add(key)

    try {
      let chunkData
      if (useDemoData) {
        chunkData = fetchDemoChunk(cx, cz)
      } else {
        chunkData = await fetchChunk(cx, cz, worldPath)
      }
      if (chunkData && chunkData.loaded) {
        setChunks(prev => {
          const next = new Map(prev)
          next.set(key, chunkData)
          return next
        })
        loadedChunksRef.current.add(key)
        for (const block of chunkData.blocks || []) {
          spatialHashRef.current.set(block.x, block.y, block.z, block.blockId)
        }
      }
    } catch (err) {
      console.error('Failed to load chunk', cx, cz, err)
    } finally {
      loadingRef.current.delete(key)
    }
  }, [useDemoData, worldPath])

  const updateChunks = useCallback((playerX, playerZ) => {
    const centerCX = Math.floor(playerX / CHUNK_SIZE)
    const centerCZ = Math.floor(playerZ / CHUNK_SIZE)

    for (let dx = -VIEW_DISTANCE; dx <= VIEW_DISTANCE; dx++) {
      for (let dz = -VIEW_DISTANCE; dz <= VIEW_DISTANCE; dz++) {
        const cx = centerCX + dx
        const cz = centerCZ + dz
        loadChunk(cx, cz)
      }
    }
  }, [loadChunk])

  useEffect(() => {
    loadedChunksRef.current.clear()
    loadingRef.current.clear()
    setChunks(new Map())
    spatialHashRef.current = new SpatialHash()
    updateChunks(32, 32)
    setLoading(false)
  }, [useDemoData, worldPath, updateChunks])

  useFrame(() => {
    const px = camera.position.x
    const pz = camera.position.z
    const cx = Math.floor(px / CHUNK_SIZE)
    const cz = Math.floor(pz / CHUNK_SIZE)

    if (cx !== lastChunkPosRef.current.x || cz !== lastChunkPosRef.current.z) {
      lastChunkPosRef.current = { x: cx, z: cz }
      updateChunks(px, pz)
    }
  })

  const handleBlockBreak = useCallback((x, y, z) => {
    const key = `${x},${y},${z}`
    setRemovedBlocks(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    spatialHashRef.current.delete(x, y, z)
  }, [])

  const chunkArray = Array.from(chunks.values())

  return (
    <>
      <FirstPersonControls spatialHash={spatialHashRef.current} />

      <DayNightCycle enabled={dayNightEnabled} speed={0.5} startTime={0.5} />

      {chunkArray.map(chunk => (
        <VoxelChunk
          key={`${chunk.chunkX}-${chunk.chunkZ}`}
          chunkData={chunk}
          removedBlocks={removedBlocks}
          onBlockClick={handleBlockBreak}
        />
      ))}

      {loading && (
        <mesh position={[32, 20, 32]}>
          <boxGeometry args={[2, 2, 2]} />
          <meshBasicMaterial color="#ffaa00" wireframe />
        </mesh>
      )}
    </>
  )
}
