<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import FilterBar from '@/components/slowlog/FilterBar.vue'
import SlowlogTable from '@/components/slowlog/SlowlogTable.vue'
import DurationChart from '@/components/slowlog/DurationChart.vue'
import CommandPieChart from '@/components/slowlog/CommandPieChart.vue'
import FingerprintPieChart from '@/components/slowlog/FingerprintPieChart.vue'
import type { SlowlogEntry, FingerprintStat } from '@/types'

const { getSlowlogs, getSlowlogDistribution, getSlowlogCommands, getSlowlogFingerprints } = useApi()

const filters = ref({
  clusterId: '',
  nodeAddr: '',
  command: '',
  startDate: '',
  endDate: '',
  minDuration: 0,
})

const entries = ref<SlowlogEntry[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const distribution = ref<{ range: string; count: number }[]>([])
const commands = ref<{ command: string; count: number }[]>([])
const fingerprints = ref<FingerprintStat[]>([])

onMounted(async () => {
  await Promise.all([loadSlowlogs(), loadCharts()])
})

async function loadSlowlogs() {
  try {
    const f = filters.value
    const res = await getSlowlogs({
      clusterId: f.clusterId || undefined,
      nodeAddr: f.nodeAddr || undefined,
      command: f.command || undefined,
      start: f.startDate || undefined,
      end: f.endDate || undefined,
      minDuration: f.minDuration || undefined,
      page: page.value,
      pageSize,
    })
    entries.value = res.data
    total.value = res.total
  } catch { }
}

async function loadCharts() {
  try {
    const [dist, cmds, fps] = await Promise.all([
      getSlowlogDistribution(filters.value.clusterId || undefined),
      getSlowlogCommands(filters.value.clusterId || undefined),
      getSlowlogFingerprints(filters.value.clusterId || undefined),
    ])
    distribution.value = dist
    commands.value = cmds
    fingerprints.value = fps
  } catch { }
}

async function handleSearch() {
  page.value = 1
  await Promise.all([loadSlowlogs(), loadCharts()])
}

async function handlePageChange(p: number) {
  page.value = p
  await loadSlowlogs()
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-mono font-bold text-primary glow-text mb-1">Slowlog Analysis</h2>
      <p class="text-sm text-gray-500">Redis Slow Query Log Monitoring & Analysis</p>
    </div>

    <FilterBar v-model:filters="filters" @search="handleSearch" />

    <SlowlogTable :entries="entries" :total="total" :page="page" :page-size="pageSize"
      @update:page="handlePageChange" />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DurationChart :data="distribution" />
      <CommandPieChart :data="commands" />
      <div class="lg:col-span-2">
        <FingerprintPieChart :data="fingerprints" />
      </div>
    </div>
  </div>
</template>
