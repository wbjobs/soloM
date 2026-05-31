import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import type {
  Container,
  ContainerStats,
  MemoryHistoryPoint,
  TopologyData,
  LogEntry,
  ImageLayer,
  CommandOutput
} from '../types'

export const dockerApi = {
  async listContainers(): Promise<Container[]> {
    return invoke<Container[]>('list_containers')
  },

  async getContainerStats(containerId: string): Promise<ContainerStats> {
    return invoke<ContainerStats>('get_container_stats', { containerId })
  },

  async getAllContainerStats(): Promise<ContainerStats[]> {
    return invoke<ContainerStats[]>('get_all_container_stats')
  },

  async getContainerLogs(containerId: string, tail: number = 50): Promise<LogEntry[]> {
    return invoke<LogEntry[]>('get_container_logs', { containerId, tail })
  },

  async getTopology(): Promise<TopologyData> {
    return invoke<TopologyData>('get_topology')
  },

  async getMemoryHistory(): Promise<MemoryHistoryPoint[]> {
    return invoke<MemoryHistoryPoint[]>('get_memory_history')
  },

  async clearMemoryHistory(): Promise<void> {
    return invoke<void>('clear_memory_history')
  },

  async getTransportInfo(): Promise<string> {
    return invoke<string>('get_transport_info')
  },

  async getImageLayers(imageName: string): Promise<ImageLayer[]> {
    return invoke<ImageLayer[]>('get_image_layers', { imageName })
  },

  async executeDockerCommand(
    dockerCommand: string,
    containerId: string,
    containerName: string
  ): Promise<void> {
    return invoke<void>('execute_docker_command', {
      dockerCommand,
      containerId,
      containerName
    })
  },

  onCommandOutput(
    containerId: string,
    callback: (output: CommandOutput) => void
  ): Promise<() => void> {
    const eventName = `docker-cmd-${containerId}`
    return listen<CommandOutput>(eventName, (event) => {
      callback(event.payload)
    }).then((unlisten) => () => unlisten())
  }
}
