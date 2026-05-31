import { useState, useEffect } from 'react'
import type { SystemData, ChartDataPoint } from './types'
import CpuChart from './components/CpuChart'
import MemoryChart from './components/MemoryChart'
import NetworkChart from './components/NetworkChart'
import DiskChart from './components/DiskChart'
import ProcessList from './components/ProcessList'
import StatusCard from './components/StatusCard'
import AlertBanner from './components/AlertBanner'
import RecordingControls from './components/RecordingControls'

const MAX_DATA_POINTS = 60

function App() {
  const [systemData, setSystemData] = useState<SystemData | null>(null)
  const [cpuHistory, setCpuHistory] = useState<ChartDataPoint[]>([])
  const [memoryHistory, setMemoryHistory] = useState<ChartDataPoint[]>([])
  const [networkHistory, setNetworkHistory] = useState<{ time: string; upload: number; download: number }[]>([])
  const [diskHistory, setDiskHistory] = useState<{ time: string; read: number; write: number }[]>([])
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')

  useEffect(() => {
    const handleData = (data: SystemData) => {
      setSystemData(data)
      const time = new Date(data.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      setCpuHistory((prev) => {
        const newHistory = [...prev, { time, value: data.cpu.usage }]
        return newHistory.slice(-MAX_DATA_POINTS)
      })

      setMemoryHistory((prev) => {
        const newHistory = [...prev, { time, value: data.memory.percentage }]
        return newHistory.slice(-MAX_DATA_POINTS)
      })

      setNetworkHistory((prev) => {
        const newHistory = [...prev, { time, upload: data.network.upload, download: data.network.download }]
        return newHistory.slice(-MAX_DATA_POINTS)
      })

      setDiskHistory((prev) => {
        const newHistory = [...prev, { time, read: data.disk.read, write: data.disk.write }]
        return newHistory.slice(-MAX_DATA_POINTS)
      })

      if (data.cpu.usage > 90) {
        setAlertMessage(`CPU 占用过高: ${data.cpu.usage}%`)
        setShowAlert(true)
        setTimeout(() => setShowAlert(false), 5000)
      }
    }

    if (window.electronAPI) {
      window.electronAPI.onSystemData(handleData)
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeSystemDataListener()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <AlertBanner show={showAlert} message={alertMessage} />
      
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">系统监控</h1>
        <p className="text-slate-400">实时监控系统资源使用情况</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatusCard
          title="CPU 使用率"
          value={systemData?.cpu.usage || 0}
          unit="%"
          color="blue"
          subValue={`${systemData?.cpu.temperature || 0}°C`}
          subLabel="温度"
        />
        <StatusCard
          title="内存使用"
          value={systemData?.memory.percentage || 0}
          unit="%"
          color="green"
          subValue={`${systemData?.memory.used || 0} / ${systemData?.memory.total || 0} GB`}
          subLabel="已用/总计"
        />
        <StatusCard
          title="网络下载"
          value={systemData?.network.download || 0}
          unit="MB/s"
          color="purple"
          subValue={`${systemData?.network.upload || 0} MB/s`}
          subLabel="上传"
        />
        <StatusCard
          title="磁盘写入"
          value={systemData?.disk.write || 0}
          unit="IO/s"
          color="orange"
          subValue={`${systemData?.disk.read || 0} IO/s`}
          subLabel="读取"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <CpuChart data={cpuHistory} />
        <MemoryChart data={memoryHistory} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <NetworkChart data={networkHistory} />
        <DiskChart data={diskHistory} />
      </div>

      <div className="mb-8">
        <RecordingControls />
      </div>

      <ProcessList processes={systemData?.processes || []} />
    </div>
  )
}

export default App
