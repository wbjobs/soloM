import { useState } from 'react'
import { Package, ArrowRightToLine, ArrowLeftFromLine, TrendingUp, Box, AlertCircle, CheckCircle2, X, Palette, MousePointer2, Trash2 } from 'lucide-react'
import { useWarehouseStore } from '@/store/useWarehouseStore'
import { cn } from '@/lib/utils'
import type { ColorMode } from '@/types'

interface FormData {
  name: string
  width: string
  height: string
  depth: string
  quantity: string
}

interface Message {
  id: number
  type: 'success' | 'error' | 'info'
  text: string
}

export function ControlPanel({ onSelectionModeChange }: { onSelectionModeChange: (mode: boolean) => void }) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    width: '0.8',
    height: '0.8',
    depth: '0.8',
    quantity: '1',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectionMode, setSelectionMode] = useState(false)

  const addCargo = useWarehouseStore(state => state.addCargo)
  const stats = useWarehouseStore(state => state.stats)
  const colorMode = useWarehouseStore(state => state.colorMode)
  const setColorMode = useWarehouseStore(state => state.setColorMode)
  const selectedCargoIds = useWarehouseStore(state => state.selectedCargoIds)
  const clearSelection = useWarehouseStore(state => state.clearSelection)
  const addOutboundCargos = useWarehouseStore(state => state.addOutboundCargos)

  const selectedCount = selectedCargoIds.size

  const showMessage = (type: Message['type'], text: string) => {
    const id = Date.now()
    setMessages(prev => [...prev, { id, type, text }])
    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== id))
    }, 4000)
  }

  const dismissMessage = (id: number) => {
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const name = formData.name.trim() || `货物-${Date.now().toString(36).toUpperCase()}`
    const width = parseFloat(formData.width)
    const height = parseFloat(formData.height)
    const depth = parseFloat(formData.depth)
    const quantity = parseInt(formData.quantity)

    if (isNaN(width) || isNaN(height) || isNaN(depth) || isNaN(quantity)) {
      showMessage('error', '请输入有效的数字')
      return
    }

    if (width <= 0 || height <= 0 || depth <= 0) {
      showMessage('error', '尺寸必须大于 0')
      return
    }

    if (width > 0.98 || height > 1.09 || depth > 0.58) {
      showMessage('error', '尺寸超出格口限制（最大：0.98 × 1.09 × 0.58 m）')
      return
    }

    if (quantity <= 0 || quantity > 100) {
      showMessage('error', '数量必须在 1-100 之间')
      return
    }

    setIsSubmitting(true)

    await new Promise(resolve => setTimeout(resolve, 150))

    const result = addCargo(name, width, height, depth, quantity)

    if (result.success > 0) {
      showMessage('success', result.message)
    } else {
      showMessage('error', result.message)
    }

    setIsSubmitting(false)
  }

  const handleOutbound = () => {
    if (selectedCount === 0) return
    const ids = [...selectedCargoIds]
    addOutboundCargos(ids)
    showMessage('success', `成功出库 ${ids.length} 件货物`)
  }

  const handleInputChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
  }

  const percentage = stats.percentage
  const circumference = 2 * Math.PI * 45
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="w-[320px] h-full bg-slate-900/80 backdrop-blur-xl border-r border-slate-700/50 flex flex-col relative z-10">
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 max-w-[280px]">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm animate-in slide-in-from-right',
              msg.type === 'success' && 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300',
              msg.type === 'error' && 'bg-red-500/20 border border-red-500/40 text-red-300',
              msg.type === 'info' && 'bg-sky-500/20 border border-sky-500/40 text-sky-300'
            )}
          >
            {msg.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {msg.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {msg.type === 'info' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{msg.text}</span>
            <button
              onClick={() => dismissMessage(msg.id)}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Package className="w-5 h-5 text-slate-900" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">仓库容量模拟器</h1>
            <p className="text-xs text-slate-400">10 × 10 格口智能货架</p>
          </div>
        </div>
      </div>

      <div className="p-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200">容量统计</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="45"
                fill="none"
                stroke="#1e293b"
                strokeWidth="8"
              />
              <circle
                cx="48"
                cy="48"
                r="45"
                fill="none"
                stroke={percentage >= 90 ? '#ef4444' : percentage >= 70 ? '#f97316' : '#10b981'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{percentage}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">% 已用</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">已使用</span>
              <span className="text-emerald-400 font-mono font-semibold">{stats.used}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">总容量</span>
              <span className="text-white font-mono">{stats.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">空闲</span>
              <span className="text-sky-400 font-mono">{stats.total - stats.used}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              percentage >= 90 ? 'bg-gradient-to-r from-red-500 to-red-400' :
              percentage >= 70 ? 'bg-gradient-to-r from-orange-500 to-amber-400' :
              'bg-gradient-to-r from-emerald-500 to-teal-400'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="p-4 border-b border-slate-700/50 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-200">着色模式</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setColorMode('size')}
            className={cn(
              'flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all',
              colorMode === 'size'
                ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/60 border border-slate-700 text-slate-400 hover:border-slate-600'
            )}
          >
            <Box className="w-3.5 h-3.5" />
            按尺寸
          </button>
          <button
            onClick={() => setColorMode('duration')}
            className={cn(
              'flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all',
              colorMode === 'duration'
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                : 'bg-slate-800/60 border border-slate-700 text-slate-400 hover:border-slate-600'
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            按时长
          </button>
        </div>
        {colorMode === 'duration' && (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" />
            <span className="text-slate-500 shrink-0">新 → 旧</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <ArrowRightToLine className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">货物入库</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">货物名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={handleInputChange('name')}
              placeholder="自动生成名称"
              className="w-full h-9 px-3 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">长 (m)</label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="0.98"
                value={formData.width}
                onChange={handleInputChange('width')}
                className="w-full h-9 px-3 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">高 (m)</label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="1.09"
                value={formData.height}
                onChange={handleInputChange('height')}
                className="w-full h-9 px-3 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">深 (m)</label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="0.58"
                value={formData.depth}
                onChange={handleInputChange('depth')}
                className="w-full h-9 px-3 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">入库数量</label>
            <input
              type="number"
              min="1"
              max="100"
              value={formData.quantity}
              onChange={handleInputChange('quantity')}
              className="w-full h-9 px-3 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 mt-3">
            <Box className="w-3.5 h-3.5" />
            <span>格口限制: 0.98 × 1.09 × 0.58 m</span>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200',
                isSubmitting
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-900 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 active:scale-[0.98]'
              )}
            >
              <ArrowRightToLine className="w-4 h-4" />
              {isSubmitting ? '入库中...' : '确认入库'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-700/50">
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeftFromLine className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-slate-200">货物出库</h2>
          </div>

          <button
            onClick={() => {
              setSelectionMode(prev => {
                const next = !prev
                onSelectionModeChange(next)
                if (!next) clearSelection()
                return next
              })
            }}
            className={cn(
              'w-full h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all mb-3',
              selectionMode
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                : 'bg-slate-800/60 border border-slate-700 text-slate-400 hover:border-slate-600'
            )}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            {selectionMode ? '退出选择模式' : '进入选择模式'}
          </button>

          {selectedCount > 0 && (
            <div className="mb-3 flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <span className="text-xs text-amber-300">已选择 <span className="font-bold">{selectedCount}</span> 件货物</span>
              <button
                onClick={clearSelection}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                清除
              </button>
            </div>
          )}

          <button
            onClick={handleOutbound}
            disabled={selectedCount === 0}
            className={cn(
              'w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200',
              selectedCount === 0
                ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 active:scale-[0.98]'
            )}
          >
            <Trash2 className="w-4 h-4" />
            {selectedCount > 0 ? `出库 (${selectedCount}件)` : '请先选择货物'}
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-700/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-sm bg-emerald-400" />
            <span className="text-xs text-slate-400">小件 (体积 &lt; 0.3 m³)</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-sm bg-amber-500" />
            <span className="text-xs text-slate-400">中件 (0.3 ~ 0.6 m³)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-400" />
            <span className="text-xs text-slate-400">大件 (体积 &gt; 0.6 m³)</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-700/50">
        <div className="text-[10px] text-slate-500 text-center">
          <p>💡 鼠标悬停货物查看详情</p>
          <p className="mt-0.5">🖱️ 拖拽旋转 · 滚轮缩放 · 右键平移</p>
          {selectionMode && (
            <p className="mt-0.5 text-amber-400/60">🔲 框选模式已开启</p>
          )}
        </div>
      </div>
    </div>
  )
}
