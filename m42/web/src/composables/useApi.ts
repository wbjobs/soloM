import { ref } from 'vue'
import type { Cluster, ClusterNode, SlowlogEntry, SlowlogStats, DashboardOverview } from '@/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`)
  return res.json()
}

export function useApi() {
  const loading = ref(false)

  async function getOverview(): Promise<DashboardOverview> {
    return request('/api/dashboard/overview')
  }

  async function getRecentSlowlogs(limit = 10): Promise<SlowlogEntry[]> {
    return request(`/api/dashboard/recent?limit=${limit}`)
  }

  async function getClusters(): Promise<Cluster[]> {
    return request('/api/clusters')
  }

  async function createCluster(data: { name: string; mode: string; addrs: string[]; password?: string }): Promise<Cluster> {
    return request('/api/clusters', { method: 'POST', body: JSON.stringify(data) })
  }

  async function deleteCluster(id: string): Promise<void> {
    return request(`/api/clusters/${id}`, { method: 'DELETE' })
  }

  async function getClusterNodes(clusterId: string): Promise<ClusterNode[]> {
    return request(`/api/clusters/${clusterId}/nodes`)
  }

  async function getClusterHealth(clusterId: string): Promise<Record<string, unknown>> {
    return request(`/api/clusters/${clusterId}/health`)
  }

  async function getSlowlogs(params?: {
    clusterId?: string
    nodeAddr?: string
    command?: string
    start?: string
    end?: string
    minDuration?: number
    page?: number
    pageSize?: number
  }): Promise<{ data: SlowlogEntry[]; total: number }> {
    const query = new URLSearchParams()
    if (params) {
      if (params.clusterId) query.set('cluster_id', params.clusterId)
      if (params.nodeAddr) query.set('node_addr', params.nodeAddr)
      if (params.command) query.set('command', params.command)
      if (params.start) query.set('start_time', params.start)
      if (params.end) query.set('end_time', params.end)
      if (params.minDuration) query.set('min_duration', String(params.minDuration))
      if (params.page) query.set('page', String(params.page))
      if (params.pageSize) query.set('page_size', String(params.pageSize))
    }
    const qs = query.toString()
    return request(`/api/slowlogs${qs ? `?${qs}` : ''}`)
  }

  async function getSlowlogStats(clusterId?: string): Promise<SlowlogStats> {
    const qs = clusterId ? `?cluster_id=${clusterId}` : ''
    return request(`/api/slowlogs/stats${qs}`)
  }

  async function getSlowlogTrend(clusterId?: string, hours = 24): Promise<{ time: string; count: number }[]> {
    const params = new URLSearchParams()
    if (clusterId) params.set('cluster_id', clusterId)
    params.set('interval', 'hour')
    return request(`/api/slowlogs/trend?${params}`)
  }

  async function getSlowlogDistribution(clusterId?: string): Promise<{ range: string; count: number }[]> {
    const qs = clusterId ? `?cluster_id=${clusterId}` : ''
    return request(`/api/slowlogs/distribution${qs}`)
  }

  async function getSlowlogCommands(clusterId?: string): Promise<{ command: string; count: number }[]> {
    const qs = clusterId ? `?cluster_id=${clusterId}` : ''
    return request(`/api/slowlogs/commands${qs}`)
  }

  async function getSlowlogFingerprints(clusterId?: string, limit = 15): Promise<{
    fingerprint: string
    count: number
    totalDurationUs: number
    avgDurationUs: number
    maxDurationUs: number
    percentage: number
  }[]> {
    const params = new URLSearchParams()
    if (clusterId) params.set('cluster_id', clusterId)
    params.set('limit', String(limit))
    return request(`/api/slowlogs/fingerprints?${params.toString()}`)
  }

  return {
    loading,
    getOverview,
    getRecentSlowlogs,
    getClusters,
    createCluster,
    deleteCluster,
    getClusterNodes,
    getClusterHealth,
    getSlowlogs,
    getSlowlogStats,
    getSlowlogTrend,
    getSlowlogDistribution,
    getSlowlogCommands,
    getSlowlogFingerprints,
  }
}
