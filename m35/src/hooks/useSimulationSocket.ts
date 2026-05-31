import { useEffect, useRef, useCallback } from 'react'
import { useSimulationStore } from '@/store/simulationStore'

export interface CoordinateFrame {
  step: number
  atomCount: number
  positions: number[] | Float32Array
  isDelta: boolean
}

type OnCoordinateFrame = (frame: CoordinateFrame) => void

export function useSimulationSocket(
  taskId: string | null,
  onCoordinateFrame: OnCoordinateFrame,
) {
  const wsRef = useRef<WebSocket | null>(null)
  const onFrameRef = useRef(onCoordinateFrame)
  onFrameRef.current = onCoordinateFrame

  const connect = useCallback(() => {
    if (!taskId) return

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/simulate?taskId=${taskId}`

    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const buffer = event.data as ArrayBuffer
        const view = new DataView(buffer)
        const step = view.getUint32(0, true)
        const atomCount = view.getUint32(4, true)
        const deltas = new Float32Array(atomCount * 3)
        for (let i = 0; i < deltas.length; i++) {
          deltas[i] = view.getFloat32(16 + i * 4, true)
        }
        onFrameRef.current({
          step,
          atomCount,
          positions: deltas,
          isDelta: true,
        })
        return
      }

      try {
        const data = JSON.parse(event.data)

        if (data.type === 'coordinates') {
          onFrameRef.current({
            step: data.step,
            atomCount: data.atomCount,
            positions: data.positions,
            isDelta: false,
          })
        } else if (data.type === 'progress') {
          const store = useSimulationStore.getState()
          store.updateProgress(data.step, data.energy)
        } else if (data.type === 'complete') {
          const store = useSimulationStore.getState()
          store.completeSimulation(
            data.minimizedPdbUrl ?? `/uploads/${taskId}/minimized.pdb`,
            data.trajectoryUrl ?? `/uploads/${taskId}/trajectory.dcd`
          )
          ws.close()
          wsRef.current = null
        } else if (data.type === 'error') {
          const store = useSimulationStore.getState()
          store.reset()
          ws.close()
          wsRef.current = null
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      ws.close()
      wsRef.current = null
    }

    ws.onclose = () => {
      wsRef.current = null
    }
  }, [taskId])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    const isSimulating = useSimulationStore.getState().isSimulating

    if (taskId && isSimulating) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [taskId, connect, disconnect])

  return { connect, disconnect }
}
