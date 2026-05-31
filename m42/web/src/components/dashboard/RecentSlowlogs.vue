<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import type { SlowlogEntry } from '@/types'

const { getRecentSlowlogs } = useApi()
const entries = ref<SlowlogEntry[]>([])

onMounted(async () => {
  try {
    entries.value = await getRecentSlowlogs(10)
  } catch { }
})

function formatDuration(us: number): string {
  return us > 1000000 ? `${(us / 1000).toFixed(1)}ms` : `${us}μs`
}

function durationColor(us: number): string {
  if (us > 1000000) return 'text-alert'
  if (us > 100000) return 'text-yellow-400'
  return 'text-emerald-400'
}
</script>

<template>
  <div class="glass-card p-5 animate-fade-in">
    <h3 class="text-sm font-mono text-primary/80 uppercase tracking-wider mb-4">Recent Slowlogs</h3>
    <div class="overflow-x-auto">
      <table class="dark-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Duration</th>
            <th>Node</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td class="font-mono text-xs text-primary/90">{{ entry.command }}</td>
            <td class="font-mono text-xs" :class="durationColor(entry.durationUs)">
              {{ formatDuration(entry.durationUs) }}
            </td>
            <td class="text-xs text-gray-500">{{ entry.nodeAddr }}</td>
            <td class="text-xs text-gray-500">{{ entry.timestamp }}</td>
          </tr>
          <tr v-if="entries.length === 0">
            <td colspan="4" class="text-center text-gray-600 py-6">No recent slowlogs</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
