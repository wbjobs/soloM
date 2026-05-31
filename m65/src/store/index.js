import { reactive } from 'vue'

export const store = reactive({
  deviceInfo: {
    name: '',
    ip: '',
    port: 0
  },
  peers: [],
  transfers: [],
  pendingTransfers: [],

  setDeviceInfo(info) {
    this.deviceInfo = info
  },

  addPeer(peer) {
    const existing = this.peers.find(p => p.id === peer.id)
    if (!existing) {
      this.peers.push(peer)
    } else {
      existing.lastSeen = peer.lastSeen
    }
  },

  removePeer(peerId) {
    const index = this.peers.findIndex(p => p.id === peerId)
    if (index !== -1) {
      this.peers.splice(index, 1)
    }
  },

  setPeers(peers) {
    this.peers = peers
  },

  addPendingTransfer(request) {
    this.pendingTransfers.push(request)
  },

  removePendingTransfer(transferId) {
    const index = this.pendingTransfers.findIndex(t => t.transferId === transferId)
    if (index !== -1) {
      this.pendingTransfers.splice(index, 1)
    }
  },

  addTransfer(transfer) {
    this.transfers.unshift(transfer)
  },

  updateTransferProgress(progress) {
    const transfer = this.transfers.find(t => t.transferId === progress.transferId)
    if (transfer) {
      transfer.progress = progress.progress
      transfer.transferred = progress.transferred
      transfer.speed = progress.speed
      transfer.status = 'transferring'
    }
  },

  completeTransfer(transferId, result) {
    const transfer = this.transfers.find(t => t.transferId === transferId)
    if (transfer) {
      transfer.status = 'completed'
      transfer.progress = 100
      transfer.duration = result.duration
      transfer.savePath = result.savePath
    }
  },

  failTransfer(transferId, error, resumable = false) {
    const transfer = this.transfers.find(t => t.transferId === transferId)
    if (transfer) {
      transfer.status = 'error'
      transfer.error = error
      transfer.resumable = resumable
    }
    const pending = this.pendingTransfers.find(t => t.transferId === transferId)
    if (pending) {
      this.removePendingTransfer(transferId)
    }
  },

  markTransferResuming(transferId) {
    const transfer = this.transfers.find(t => t.transferId === transferId)
    if (transfer) {
      transfer.status = 'transferring'
      transfer.error = null
      transfer.resumable = false
    }
  }
})
