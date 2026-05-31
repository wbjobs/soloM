import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { useSimulationStore } from '@/store/simulationStore'

export default function TrajectoryPlayer() {
  const { energies } = useSimulationStore()
  const [isPlaying, setIsPlaying] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)

  const totalFrames = energies.length

  const advanceFrame = useCallback(() => {
    setFrameIndex((prev) => (prev + 1) % totalFrames)
  }, [totalFrames])

  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return
    const timer = setInterval(advanceFrame, 100)
    return () => clearInterval(timer)
  }, [isPlaying, totalFrames, advanceFrame])

  useEffect(() => {
    if (totalFrames > 0 && frameIndex >= totalFrames) {
      setFrameIndex(totalFrames - 1)
    }
  }, [totalFrames, frameIndex])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFrameIndex(parseInt(e.target.value))
  }

  const handlePlayPause = () => {
    if (totalFrames === 0) return
    setIsPlaying((prev) => !prev)
    if (!isPlaying && frameIndex >= totalFrames - 1) {
      setFrameIndex(0)
    }
  }

  const handleRestart = () => {
    setFrameIndex(0)
    setIsPlaying(false)
  }

  const handleEnd = () => {
    setFrameIndex(totalFrames - 1)
    setIsPlaying(false)
  }

  const currentRecord = energies[frameIndex]

  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#111827] p-4 space-y-3">
      <h3 className="text-[#e2e8f0] text-sm font-semibold">轨迹播放</h3>

      <div className="flex items-center gap-3">
        <button
          onClick={handleRestart}
          disabled={totalFrames === 0}
          className="p-1.5 rounded text-[#94a3b8] hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-30"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={handlePlayPause}
          disabled={totalFrames === 0}
          className="p-2 rounded-full bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30 transition-colors disabled:opacity-30"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={handleEnd}
          disabled={totalFrames === 0}
          className="p-1.5 rounded text-[#94a3b8] hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-30"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(totalFrames - 1, 0)}
        value={frameIndex}
        onChange={handleSliderChange}
        disabled={totalFrames === 0}
        className="w-full accent-cyan-400 h-1.5 bg-[#1e293b] rounded-full appearance-none cursor-pointer disabled:opacity-30
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
      />

      <div className="flex justify-between text-xs text-[#94a3b8]">
        <span>帧: {totalFrames > 0 ? frameIndex + 1 : 0} / {totalFrames}</span>
        {currentRecord && (
          <span>能量: {currentRecord.energy.toFixed(2)} kJ/mol</span>
        )}
      </div>
    </div>
  )
}
