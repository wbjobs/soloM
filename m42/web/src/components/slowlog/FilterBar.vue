<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { Search, Filter } from 'lucide-vue-next'
import type { Cluster, ClusterNode } from '@/types'

const { getClusters, getClusterNodes } = useApi()

const clusters = ref<Cluster[]>([])
const nodeOptions = ref<ClusterNode[]>([])
const filters = defineModel<{
  clusterId: string
  nodeAddr: string
  command: string
  startDate: string
  endDate: string
  minDuration: number
}>('filters', { required: true })

const emit = defineEmits<{ search: [] }>()

onMounted(async () => {
  try {
    clusters.value = await getClusters()
  } catch { }
})

watch(() => filters.value.clusterId, async (id) => {
  nodeOptions.value = []
  filters.value.nodeAddr = ''
  if (!id) return
  try {
    nodeOptions.value = await getClusterNodes(id)
  } catch { }
})
</script>

<template>
  <div class="glass-card p-4 animate-fade-in">
    <div class="flex items-center gap-2 mb-4">
      <Filter class="w-4 h-4 text-primary/60" />
      <span class="text-xs font-mono text-primary/70 uppercase tracking-wider">Filters</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Cluster</label>
        <select v-model="filters.clusterId"
          class="w-full bg-bg-primary/80 border border-primary/15 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary/40">
          <option value="">All Clusters</option>
          <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Node</label>
        <select v-model="filters.nodeAddr"
          class="w-full bg-bg-primary/80 border border-primary/15 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary/40">
          <option value="">All Nodes</option>
          <option v-for="n in nodeOptions" :key="n.id" :value="n.addr">{{ n.addr }}</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Command</label>
        <input v-model="filters.command" type="text" placeholder="e.g. KEYS"
          class="w-full bg-bg-primary/80 border border-primary/15 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary/40 placeholder:text-gray-600" />
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Start</label>
        <input v-model="filters.startDate" type="datetime-local"
          class="w-full bg-bg-primary/80 border border-primary/15 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary/40" />
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">End</label>
        <input v-model="filters.endDate" type="datetime-local"
          class="w-full bg-bg-primary/80 border border-primary/15 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary/40" />
      </div>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <label class="text-xs text-gray-500 mb-1 block">Min Duration (μs)</label>
          <input v-model.number="filters.minDuration" type="number" min="0" step="1000"
            class="w-full bg-bg-primary/80 border border-primary/15 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary/40" />
        </div>
        <button @click="emit('search')"
          class="px-4 py-2 rounded-lg bg-primary/15 border border-primary/25 text-primary text-xs font-mono hover:bg-primary/25 transition-colors flex items-center gap-1.5">
          <Search class="w-3.5 h-3.5" />
          Search
        </button>
      </div>
    </div>
  </div>
</template>
