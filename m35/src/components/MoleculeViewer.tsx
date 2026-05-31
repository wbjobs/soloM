import { forwardRef, useImperativeHandle } from 'react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import type { CoordinateFrame } from '@/hooks/useSimulationSocket'

type RepresentationType = 'ball+stick' | 'cartoon' | 'licorice' | 'spacefill'

const LARGE_MOLECULE_THRESHOLD = 5000
const VERY_LARGE_THRESHOLD = 20000

function getAdaptiveConfig(atomCount: number) {
  if (atomCount > VERY_LARGE_THRESHOLD) {
    return {
      quality: 'low' as const,
      sampleLevel: 0,
      impostor: true,
      defaultRep: 'licorice' as RepresentationType,
      radiusScale: 0.3,
      bondScale: 0.3,
    }
  }
  if (atomCount > LARGE_MOLECULE_THRESHOLD) {
    return {
      quality: 'low' as const,
      sampleLevel: 1,
      impostor: true,
      defaultRep: 'licorice' as RepresentationType,
      radiusScale: 0.5,
      bondScale: 0.5,
    }
  }
  return {
    quality: 'medium' as const,
    sampleLevel: 2,
    impostor: false,
    defaultRep: 'ball+stick' as RepresentationType,
    radiusScale: 1.0,
    bondScale: 1.0,
  }
}

export interface MoleculeViewerHandle {
  onCoordinateFrame: (frame: CoordinateFrame) => void
}

const MoleculeViewer = forwardRef<MoleculeViewerHandle>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)
  const componentRef = useRef<any>(null)
  const [currentRep, setCurrentRep] = useState<RepresentationType>('ball+stick')
  const taskId = useSimulationStore((s) => s.taskId)
  const minimizedPdbUrl = useSimulationStore((s) => s.minimizedPdbUrl)
  const atomCount = useSimulationStore((s) => s.atomCount)
  const configRef = useRef(getAdaptiveConfig(atomCount))
  const loadSeqRef = useRef(0)
  const originalPositionsRef = useRef<Float64Array | null>(null)
  const pendingFrameRef = useRef<CoordinateFrame | null>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    configRef.current = getAdaptiveConfig(atomCount)
    if (atomCount > LARGE_MOLECULE_THRESHOLD && currentRep === 'ball+stick') {
      setCurrentRep(configRef.current.defaultRep)
    }
  }, [atomCount])

  useEffect(() => {
    if (!containerRef.current) return

    let destroyed = false

    const initStage = async () => {
      const NGL = await import('ngl')
      if (destroyed || !containerRef.current) return

      const config = configRef.current

      const stage = new NGL.Stage(containerRef.current, {
        backgroundColor: '#0a0e17',
        quality: config.quality,
        sampleLevel: config.sampleLevel,
        workerDefault: true,
      })
      stageRef.current = stage
      stage.handleResize()
    }

    initStage()

    return () => {
      destroyed = true
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      if (componentRef.current) {
        try { componentRef.current.dispose() } catch {}
        componentRef.current = null
      }
      if (stageRef.current) {
        try {
          stageRef.current.removeAllComponents()
          stageRef.current.dispose()
        } catch {}
        stageRef.current = null
      }
    }
  }, [])

  const applyCoordinateFrame = useCallback((frame: CoordinateFrame) => {
    const comp = componentRef.current
    const stage = stageRef.current
    if (!comp || !stage) return

    try {
      const structure = comp.structure
      if (!structure || !structure.atomStore) return

      const atomStore = structure.atomStore
      const xArr = atomStore.x
      const yArr = atomStore.y
      const zArr = atomStore.z

      if (!xArr || !yArr || !zArr) return

      const posCount = frame.atomCount

      if (frame.isDelta) {
        const original = originalPositionsRef.current
        if (!original) return
        const deltas = frame.positions as Float32Array
        for (let i = 0; i < posCount; i++) {
          xArr[i] = original[i * 3] + deltas[i * 3]
          yArr[i] = original[i * 3 + 1] + deltas[i * 3 + 1]
          zArr[i] = original[i * 3 + 2] + deltas[i * 3 + 2]
        }
      } else {
        const positions = frame.positions
        const arr = Array.isArray(positions) ? positions : Array.from(positions as Float32Array)
        for (let i = 0; i < posCount; i++) {
          xArr[i] = arr[i * 3]
          yArr[i] = arr[i * 3 + 1]
          zArr[i] = arr[i * 3 + 2]
        }
      }

      atomStore.changed = true

      try {
        comp.updateRepresentations({ position: true })
      } catch {}

      stage.viewer.requestRender()
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    let running = false

    const renderLoop = () => {
      if (!running) return

      const frame = pendingFrameRef.current
      if (frame) {
        pendingFrameRef.current = null
        applyCoordinateFrame(frame)
      }

      rafIdRef.current = requestAnimationFrame(renderLoop)
    }

    running = true
    renderLoop()

    return () => {
      running = false
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [applyCoordinateFrame])

  const onCoordinateFrame = useCallback((frame: CoordinateFrame) => {
    pendingFrameRef.current = frame
  }, [])

  useImperativeHandle(ref, () => ({
    onCoordinateFrame,
  }), [onCoordinateFrame])

  useEffect(() => {
    if (!stageRef.current || !taskId) return

    const seq = ++loadSeqRef.current

    const loadStructure = async () => {
      const NGL = await import('ngl')
      const stage = stageRef.current
      if (!stage || seq !== loadSeqRef.current) return

      if (componentRef.current) {
        try { stage.removeComponent(componentRef.current) } catch {}
        componentRef.current = null
      }

      let pdbUrl: string
      if (minimizedPdbUrl) {
        pdbUrl = minimizedPdbUrl
      } else {
        pdbUrl = `/uploads/${taskId}/original.pdb`
      }

      const config = configRef.current

      try {
        const comp = await stage.loadFile(pdbUrl, {
          defaultRepresentation: false,
          ext: 'pdb',
        })
        if (!comp || seq !== loadSeqRef.current) return

        componentRef.current = comp

        const atomStore = comp.structure?.atomStore
        if (atomStore && atomStore.x && atomStore.y && atomStore.z) {
          const count = atomStore.count
          const original = new Float64Array(count * 3)
          for (let i = 0; i < count; i++) {
            original[i * 3] = atomStore.x[i]
            original[i * 3 + 1] = atomStore.y[i]
            original[i * 3 + 2] = atomStore.z[i]
          }
          originalPositionsRef.current = original
        }

        const repParams: any = {
          colorScheme: 'element',
          radiusScale: config.radiusScale,
        }

        if (config.impostor) {
          repParams.impostor = true
          repParams.quality = 'low'
        }

        if (currentRep === 'ball+stick') {
          comp.addRepresentation('ball+stick', {
            ...repParams,
            bondScale: config.bondScale,
            bondSpacing: 0.5,
            multipleBond: false,
            aspectRatio: 1.5,
          })
        } else if (currentRep === 'cartoon') {
          comp.addRepresentation('cartoon', {
            colorScheme: 'residueindex',
            quality: config.quality,
            impostor: config.impostor,
          })
          comp.addRepresentation('licorice', {
            ...repParams,
            sele: 'not protein and not water',
          })
        } else if (currentRep === 'licorice') {
          comp.addRepresentation('licorice', {
            ...repParams,
            multipleBond: false,
          })
        } else if (currentRep === 'spacefill') {
          comp.addRepresentation('spacefill', {
            ...repParams,
            detail: atomCount > LARGE_MOLECULE_THRESHOLD ? 0 : 1,
          })
        }

        comp.autoView(0)
      } catch {
        try {
          const comp = await stage.loadFile(pdbUrl, { defaultRepresentation: true })
          if (comp) {
            componentRef.current = comp
            comp.autoView()
          }
        } catch {
          // silently fail
        }
      }
    }

    loadStructure()
  }, [taskId, minimizedPdbUrl, currentRep, atomCount])

  const handleRepChange = useCallback((rep: RepresentationType) => {
    setCurrentRep(rep)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (stageRef.current) {
        stageRef.current.handleResize()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const representations: { key: RepresentationType; label: string; largeOk: boolean }[] = [
    { key: 'ball+stick', label: '球棍', largeOk: false },
    { key: 'cartoon', label: '卡通', largeOk: true },
    { key: 'licorice', label: '管线', largeOk: true },
    { key: 'spacefill', label: '空间填充', largeOk: true },
  ]

  const isLarge = atomCount > LARGE_MOLECULE_THRESHOLD

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-3 left-3 flex gap-1.5">
        {representations.map(({ key, label, largeOk }) => {
          const disabled = isLarge && !largeOk
          return (
            <button
              key={key}
              onClick={() => !disabled && handleRepChange(key)}
              className={`
                px-2.5 py-1 rounded text-xs font-medium transition-all duration-200
                ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
                ${currentRep === key && !disabled
                  ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
                  : 'bg-[#111827]/80 text-[#94a3b8] border border-[#1e293b] hover:text-[#e2e8f0]'
                }
              `}
            >
              {label}
            </button>
          )
        })}
      </div>
      {isLarge && (
        <div className="absolute bottom-3 left-3 px-2.5 py-1.5 rounded text-xs bg-[#111827]/90 text-[#94a3b8] border border-[#1e293b]">
          大分子模式 ({atomCount.toLocaleString()} 原子)
        </div>
      )}
    </div>
  )
})

MoleculeViewer.displayName = 'MoleculeViewer'

export default MoleculeViewer
