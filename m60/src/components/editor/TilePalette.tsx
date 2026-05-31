import { useEditorStore } from '@/stores/editorStore'
import { COLOR_PALETTE } from '@/utils/tileset'

export default function TilePalette() {
  const selectedTileId = useEditorStore((s) => s.selectedTileId)
  const setSelectedTileId = useEditorStore((s) => s.setSelectedTileId)

  return (
    <div className="flex flex-col bg-[#1a1a2e] border-l border-[#333] w-[152px] select-none">
      <div
        className="px-2 py-2 border-b border-[#333] text-[#e6c068] text-center"
        style={{ fontFamily: '"Press Start 2P"', fontSize: 8 }}
      >
        TILESET
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-4 gap-px">
          {COLOR_PALETTE.map((color, i) => {
            const tileId = i + 1
            const selected = selectedTileId === tileId
            return (
              <button
                key={tileId}
                onClick={() => setSelectedTileId(tileId)}
                className={`w-8 h-8 flex-shrink-0 transition-colors ${
                  selected ? 'border-2 border-[#e6c068]' : 'border border-[#333]'
                }`}
                style={{ backgroundColor: color }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
