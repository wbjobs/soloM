import React from 'react'
import { ContainerInfo } from '../types'

interface ContainerListProps {
  containers: ContainerInfo[]
  selectedContainerId: string | null
  onSelectContainer: (container: ContainerInfo) => void
  onRefresh: () => void
  isLoading: boolean
  onStart: (id: string) => void
  onStop: (id: string) => void
  onRestart: (id: string) => void
  onRemove: (id: string) => void
}

const ContainerList: React.FC<ContainerListProps> = ({
  containers,
  selectedContainerId,
  onSelectContainer,
  onRefresh,
  isLoading,
  onStart,
  onStop,
  onRestart,
  onRemove,
}) => {
  return (
    <div className="container-list">
      <div className="list-header">
        <h2>运行中容器</h2>
        <button onClick={onRefresh} disabled={isLoading} className="refresh-btn">
          {isLoading ? '刷新中...' : '刷新'}
        </button>
      </div>
      <div className="list-content">
        {containers.length === 0 ? (
          <div className="empty-state">
            <p>没有找到运行中的容器</p>
            <small>请确保 Docker 正在运行</small>
          </div>
        ) : (
          containers.map((container) => (
            <div
              key={container.Id}
              className={`container-item ${selectedContainerId === container.Id ? 'selected' : ''}`}
              onClick={() => onSelectContainer(container)}
            >
              <div className="container-info">
                <div className="container-name">
                  <span className={`status-dot ${container.State}`}></span>
                  {container.Names[0]?.replace('/', '') || 'Unknown'}
                </div>
                <div className="container-image">{container.Image}</div>
                <div className="container-status">{container.Status}</div>
              </div>
              <div className="container-actions" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onStart(container.Id)} title="启动">▶</button>
                <button onClick={() => onStop(container.Id)} title="停止">■</button>
                <button onClick={() => onRestart(container.Id)} title="重启">↻</button>
                <button onClick={() => onRemove(container.Id)} title="删除" className="danger">✕</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ContainerList
