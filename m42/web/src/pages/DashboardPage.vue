<script setup lang="ts">
import OverviewCards from '@/components/dashboard/OverviewCards.vue'
import TrendChart from '@/components/dashboard/TrendChart.vue'
import RecentSlowlogs from '@/components/dashboard/RecentSlowlogs.vue'
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-mono font-bold text-primary glow-text mb-1">Dashboard</h2>
      <p class="text-sm text-gray-500">Redis Cluster Monitoring Overview</p>
    </div>
    <OverviewCards />
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <TrendChart />
      <RecentSlowlogs />
    </div>
  </div>
</template>
