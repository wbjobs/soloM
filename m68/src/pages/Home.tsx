import { useState, useCallback } from 'react'
import { ControlPanel } from '@/components/ControlPanel'
import { WarehouseScene } from '@/components/WarehouseScene'
import { useWarehouseStore } from '@/store/useWarehouseStore'
import type { CargoItem } from '@/types'

export default function Home() {
  const [hoveredCargo, setHoveredCargo] = useState<CargoItem | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)

  const colorMode = useWarehouseStore(state => state.colorMode)
  const selectedCargoIds = useWarehouseStore(state => state.selectedCargoIds)
  const toggleCargoSelection = useWarehouseStore(state => state.toggleCargoSelection)
  const selectCargos = useWarehouseStore(state => state.selectCargos)

  const handleToggleSelect = useCallback((id: string) => {
    toggleCargoSelection(id)
  }, [toggleCargoSelection])

  const handleSelectCargos = useCallback((ids: string[]) => {
    selectCargos(ids)
  }, [selectCargos])

  return (
    <div className="w-full h-full flex bg-warehouse-bg overflow-hidden">
      <ControlPanel onSelectionModeChange={setSelectionMode} />
      <div className="flex-1 relative">
        <WarehouseScene
          onHoverCargo={setHoveredCargo}
          hoveredCargo={hoveredCargo}
          colorMode={colorMode}
          selectedCargoIds={selectedCargoIds}
          onToggleSelect={handleToggleSelect}
          onSelectCargos={handleSelectCargos}
          selectionMode={selectionMode}
        />
      </div>
    </div>
  )
}
