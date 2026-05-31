<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import { Server, Activity, AlertTriangle, Clock } from 'lucide-vue-next'
import type { DashboardOverview } from '@/types'

const { getOverview } = useApi()
const overview = ref<DashboardOverview>({
  clusterCount: 0,
  onlineClusters: 0,
  totalNodes: 0,
  onlineNodes: 0,
  slowlogCount24h: 0,
  slowlogLastHour: 0,
})

onMounted(async () => {
  try {
    overview.value = await getOverview()
  } catch { }
})

const cards = computed(() => [
  { label: 'Clusters', value: overview.value.clusterCount, icon: Server, color: 'text-primary', borderColor: 'border-primary/25', bgColor: 'bg-primary/10' },
  { label: 'Total Nodes', value: overview.value.totalNodes, icon: Activity, color: 'text-info', borderColor: 'border-info/25', bgColor: 'bg-info/10' },
  { label: 'Online Nodes', value: overview.value.onlineNodes, icon: Activity, color: 'text-emerald-400', borderColor: 'border-emerald-400/25', bgColor: 'bg-emerald-400/10' },
  { label: 'Slowlogs (24h)', value: overview.value.slowlogCount24h, icon: Clock, color: 'text-alert', borderColor: 'border-alert/25', bgColor: 'bg-alert/10' },
])
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div v-for="card in cards" :key="card.label"
      class="glass-card p-5 animate-fade-in"
      :class="card.borderColor">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs text-gray-500 uppercase tracking-wider font-mono mb-1">{{ card.label }}</p>
          <p class="text-3xl font-bold font-mono" :class="card.color">
            {{ card.value }}
          </p>
        </div>
        <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="card.bgColor">
          <component :is="card.icon" class="w-5 h-5" :class="card.color" />
        </div>
      </div>
    </div>
  </div>
</template>
