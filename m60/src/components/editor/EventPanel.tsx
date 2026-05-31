import { Diamond, Trash2 } from 'lucide-react'
import { useEditorStore } from '@/stores/editorStore'
import { getEventColor } from '@/utils/tileset'
import type { EventObject } from '../../../shared/types'

const EVENT_TYPES: { type: EventObject['type']; label: string }[] = [
  { type: 'teleport', label: 'Teleport' },
  { type: 'npc', label: 'NPC' },
  { type: 'chest', label: 'Chest' },
  { type: 'trigger', label: 'Trigger' },
]

export default function EventPanel() {
  const currentMap = useEditorStore((s) => s.currentMap)
  const selectedEventId = useEditorStore((s) => s.selectedEventId)
  const setSelectedEventId = useEditorStore((s) => s.setSelectedEventId)
  const setTool = useEditorStore((s) => s.setTool)
  const updateMapData = useEditorStore((s) => s.updateMapData)
  const placingEventType = useEditorStore((s) => s.placingEventType)
  const setPlacingEventType = useEditorStore((s) => s.setPlacingEventType)

  function handleEventTypeClick(type: EventObject['type']) {
    setTool('event')
    setPlacingEventType(type)
  }

  function handleDeleteEvent(eventId: string) {
    updateMapData((map) => ({
      ...map,
      events: map.events.filter((e) => e.id !== eventId),
    }))
    if (selectedEventId === eventId) {
      setSelectedEventId(null)
    }
  }

  return (
    <div className="flex flex-col bg-[#1a1a2e] border-l border-[#333] w-[200px] select-none">
      <div
        className="px-2 py-2 border-b border-[#333] text-[#e6c068] text-center"
        style={{ fontFamily: '"Press Start 2P"', fontSize: 8 }}
      >
        EVENTS
      </div>

      <div className="p-2 border-b border-[#333]">
        <div className="flex flex-col gap-1">
          {EVENT_TYPES.map(({ type, label }) => {
            const active = placingEventType === type
            return (
              <button
                key={type}
                onClick={() => handleEventTypeClick(type)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  active ? 'bg-[#2a2a3e] border border-[#e6c068]' : 'bg-[#12121e] hover:bg-[#2a2a3e] border border-transparent'
                }`}
              >
                <Diamond size={14} style={{ color: getEventColor(type) }} />
                <span className="text-gray-300">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {currentMap?.events.map((event) => {
          const selected = selectedEventId === event.id
          return (
            <div
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[#2a2a3e] ${
                selected ? 'bg-[#2a2a3e] border-l-2 border-[#e6c068]' : 'border-l-2 border-transparent'
              }`}
            >
              <Diamond size={12} style={{ color: getEventColor(event.type) }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-300 truncate">{event.type}</div>
                <div className="text-[10px] text-gray-500">
                  ({event.x}, {event.y})
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id) }}
                className="p-1 text-gray-500 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
