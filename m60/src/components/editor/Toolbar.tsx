import { Paintbrush, Eraser, PaintBucket, MousePointer2, Diamond, Undo2, Redo2, Grid3x3, Monitor, Play, ChevronLeft } from 'lucide-react'
import { useEditorStore } from '@/stores/editorStore'
import type { EditorTool } from '../../../shared/types'

const tools: { id: EditorTool; icon: React.ElementType; label: string }[] = [
  { id: 'brush', icon: Paintbrush, label: 'Brush' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'fill', icon: PaintBucket, label: 'Fill' },
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'event', icon: Diamond, label: 'Event' },
]

export default function Toolbar() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const showGrid = useEditorStore((s) => s.showGrid)
  const showCrt = useEditorStore((s) => s.showCrt)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const toggleCrt = useEditorStore((s) => s.toggleCrt)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)

  return (
    <div className="flex flex-col items-center gap-1 p-2 w-16 bg-[#1a1a2e] border-r border-[#333] select-none">
      {tools.map((t) => {
        const Icon = t.icon
        const active = tool === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded transition-colors ${
              active
                ? 'bg-[#2a2a3e] border-2 border-[#e6c068]'
                : 'bg-transparent border-2 border-transparent hover:bg-[#2a2a3e]'
            }`}
          >
            <Icon size={18} className={active ? 'text-[#e6c068]' : 'text-gray-400'} />
            <span
              className="mt-0.5"
              style={{ fontFamily: '"Press Start 2P"', fontSize: 6, color: active ? '#e6c068' : '#888' }}
            >
              {t.label}
            </span>
          </button>
        )
      })}

      <div className="w-10 border-t border-[#444] my-2" />

      <button
        onClick={undo}
        className="flex flex-col items-center justify-center w-12 h-12 rounded hover:bg-[#2a2a3e] transition-colors"
      >
        <Undo2 size={18} className="text-gray-400" />
        <span style={{ fontFamily: '"Press Start 2P"', fontSize: 6, color: '#888' }}>Undo</span>
      </button>

      <button
        onClick={redo}
        className="flex flex-col items-center justify-center w-12 h-12 rounded hover:bg-[#2a2a3e] transition-colors"
      >
        <Redo2 size={18} className="text-gray-400" />
        <span style={{ fontFamily: '"Press Start 2P"', fontSize: 6, color: '#888' }}>Redo</span>
      </button>

      <button
        onClick={toggleGrid}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded transition-colors ${
          showGrid ? 'bg-[#2a2a3e] border-2 border-[#e6c068]' : 'hover:bg-[#2a2a3e] border-2 border-transparent'
        }`}
      >
        <Grid3x3 size={18} className={showGrid ? 'text-[#e6c068]' : 'text-gray-400'} />
        <span style={{ fontFamily: '"Press Start 2P"', fontSize: 6, color: showGrid ? '#e6c068' : '#888' }}>Grid</span>
      </button>

      <button
        onClick={toggleCrt}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded transition-colors ${
          showCrt ? 'bg-[#2a2a3e] border-2 border-[#e6c068]' : 'hover:bg-[#2a2a3e] border-2 border-transparent'
        }`}
      >
        <Monitor size={18} className={showCrt ? 'text-[#e6c068]' : 'text-gray-400'} />
        <span style={{ fontFamily: '"Press Start 2P"', fontSize: 6, color: showCrt ? '#e6c068' : '#888' }}>CRT</span>
      </button>

      <div className="flex-1" />

      <button
        onClick={() => setMode(mode === 'edit' ? 'run' : 'edit')}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded transition-colors ${
          mode === 'run'
            ? 'bg-green-900/60 border-2 border-green-400'
            : 'bg-[#2a2a3e] border-2 border-[#e6c068]'
        }`}
      >
        {mode === 'edit' ? (
          <>
            <Play size={18} className="text-[#e6c068]" />
            <span style={{ fontFamily: '"Press Start 2P"', fontSize: 6, color: '#e6c068' }}>Run</span>
          </>
        ) : (
          <>
            <ChevronLeft size={18} className="text-green-400" />
            <span style={{ fontFamily: '"Press Start 2P"', fontSize: 6, color: '#4ade80' }}>Edit</span>
          </>
        )}
      </button>
    </div>
  )
}
