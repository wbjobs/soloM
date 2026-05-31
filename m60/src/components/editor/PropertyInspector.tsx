import { Plus, Trash2 } from 'lucide-react'
import { useEditorStore } from '@/stores/editorStore'
import { getTileColor } from '@/utils/tileset'
import { useState } from 'react'

export default function PropertyInspector() {
  const currentMap = useEditorStore((s) => s.currentMap)
  const selectedEventId = useEditorStore((s) => s.selectedEventId)
  const selectedTileId = useEditorStore((s) => s.selectedTileId)
  const updateMapData = useEditorStore((s) => s.updateMapData)
  const [newKey, setNewKey] = useState('')

  const selectedEvent = currentMap?.events.find((e) => e.id === selectedEventId)

  function updateEventProperty(key: string, value: string) {
    if (!selectedEventId) return
    updateMapData((map) => ({
      ...map,
      events: map.events.map((e) =>
        e.id === selectedEventId
          ? { ...e, properties: { ...e.properties, [key]: value } }
          : e,
      ),
    }))
  }

  function deleteEventProperty(key: string) {
    if (!selectedEventId) return
    updateMapData((map) => ({
      ...map,
      events: map.events.map((e) => {
        if (e.id !== selectedEventId) return e
        const props = { ...e.properties }
        delete props[key]
        return { ...e, properties: props }
      }),
    }))
  }

  function addEventProperty() {
    if (!selectedEventId || !newKey.trim()) return
    updateMapData((map) => ({
      ...map,
      events: map.events.map((e) =>
        e.id === selectedEventId
          ? { ...e, properties: { ...e.properties, [newKey.trim()]: '' } }
          : e,
      ),
    }))
    setNewKey('')
  }

  function renderEventProperties() {
    if (!selectedEvent) return null
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-10">Type</span>
          <span className="text-xs text-gray-300">{selectedEvent.type}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-10">X</span>
          <span className="text-xs text-gray-300">{selectedEvent.x}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-10">Y</span>
          <span className="text-xs text-gray-300">{selectedEvent.y}</span>
        </div>

        <div className="border-t border-[#333] pt-2 mt-1">
          <div className="text-[10px] text-gray-500 mb-1">Properties</div>
          {Object.entries(selectedEvent.properties).map(([key, value]) => (
            <div key={key} className="flex items-center gap-1 mb-1">
              <span className="text-[10px] text-gray-400 w-16 truncate">{key}</span>
              <input
                type="text"
                value={value}
                onChange={(e) => updateEventProperty(key, e.target.value)}
                className="flex-1 bg-[#12121e] border border-[#333] rounded px-1 py-0.5 text-xs text-gray-300 outline-none focus:border-[#e6c068]"
              />
              <button
                onClick={() => deleteEventProperty(key)}
                className="p-0.5 text-gray-500 hover:text-red-400"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1 mt-2">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="new key"
              className="flex-1 bg-[#12121e] border border-[#333] rounded px-1 py-0.5 text-xs text-gray-300 outline-none focus:border-[#e6c068] placeholder:text-gray-600"
              onKeyDown={(e) => { if (e.key === 'Enter') addEventProperty() }}
            />
            <button
              onClick={addEventProperty}
              className="p-1 text-gray-500 hover:text-[#e6c068]"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderTileProperties() {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-10">ID</span>
          <span className="text-xs text-gray-300">{selectedTileId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-10">Color</span>
          <div
            className="w-6 h-6 border border-[#333] rounded"
            style={{ backgroundColor: getTileColor(selectedTileId) }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-[#1a1a2e] border-l border-[#333] w-[220px] select-none">
      <div
        className="px-2 py-2 border-b border-[#333] text-[#e6c068] text-center"
        style={{ fontFamily: '"Press Start 2P"', fontSize: 8 }}
      >
        PROPERTIES
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {selectedEvent ? renderEventProperties() : renderTileProperties()}
      </div>
    </div>
  )
}
