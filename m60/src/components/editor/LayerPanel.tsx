import { Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import { useEditorStore } from '@/stores/editorStore'
import type { Layer } from '../../../shared/types'

const TYPE_COLORS: Record<Layer['type'], string> = {
  terrain: 'bg-green-700',
  collision: 'bg-red-700',
  event: 'bg-blue-700',
  ground: 'bg-amber-700',
  objects: 'bg-purple-700',
  sky: 'bg-cyan-700',
}

export default function LayerPanel() {
  const currentMap = useEditorStore((s) => s.currentMap)
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId)
  const setSelectedLayerId = useEditorStore((s) => s.setSelectedLayerId)
  const updateMapData = useEditorStore((s) => s.updateMapData)

  if (!currentMap) return null

  const sortedLayers = [...currentMap.layers].sort((a, b) => a.order - b.order)

  function toggleVisibility(layerId: string) {
    updateMapData((map) => ({
      ...map,
      layers: map.layers.map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l,
      ),
    }))
  }

  function toggleLock(layerId: string) {
    updateMapData((map) => ({
      ...map,
      layers: map.layers.map((l) =>
        l.id === layerId ? { ...l, locked: !l.locked } : l,
      ),
    }))
  }

  return (
    <div className="flex flex-col bg-[#1a1a2e] border-l border-[#333] w-[200px] select-none">
      <div
        className="px-2 py-2 border-b border-[#333] text-[#e6c068] text-center"
        style={{ fontFamily: '"Press Start 2P"', fontSize: 8 }}
      >
        LAYERS
      </div>
      <div className="flex-1 overflow-y-auto">
        {sortedLayers.map((layer) => {
          const selected = selectedLayerId === layer.id
          return (
            <div
              key={layer.id}
              onClick={() => setSelectedLayerId(layer.id)}
              className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-[#2a2a3e] ${
                selected ? 'border-l-2 border-[#e6c068] bg-[#2a2a3e]' : 'border-l-2 border-transparent'
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }}
                className="p-0.5 text-gray-400 hover:text-white"
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLock(layer.id) }}
                className="p-0.5 text-gray-400 hover:text-white"
              >
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
              <span className="flex-1 text-xs text-gray-300 truncate">{layer.name}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] text-white ${TYPE_COLORS[layer.type]}`}>
                {layer.type}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
