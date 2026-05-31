const dgram = require('dgram')
const os = require('os')

const DISCOVERY_PORT = 58888
const DISCOVERY_BROADCAST_INTERVAL = 3000
const PEER_TIMEOUT = 10000
const DISCOVERY_MESSAGE_TYPE = {
  HELLO: 'HELLO',
  RESPONSE: 'RESPONSE',
  BYE: 'BYE'
}

function createDiscoveryService({ deviceName, localIp, onPeerDiscovered, onPeerLost }) {
  const socket = dgram.createSocket('udp4')
  const peers = new Map()
  let broadcastTimer = null
  let cleanupTimer = null
  let tcpPort = 0

  const getBroadcastAddress = () => {
    const interfaces = os.networkInterfaces()
    const addresses = []
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.')
          parts[3] = '255'
          addresses.push(parts.join('.'))
        }
      }
    }
    return addresses.length > 0 ? addresses : ['255.255.255.255']
  }

  const getPeerId = (ip, port) => `${ip}:${port}`

  const sendBroadcast = () => {
    const message = JSON.stringify({
      type: DISCOVERY_MESSAGE_TYPE.HELLO,
      name: deviceName,
      ip: localIp,
      port: tcpPort,
      timestamp: Date.now()
    })

    const broadcastAddresses = getBroadcastAddress()
    broadcastAddresses.forEach((addr) => {
      socket.send(message, DISCOVERY_PORT, addr, (err) => {
        if (err) {
          console.error('广播发送失败:', err)
        }
      })
    })
  }

  const handleMessage = (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString())
      const peerId = getPeerId(data.ip, data.port)

      if (data.ip === localIp && data.port === tcpPort) {
        return
      }

      if (data.type === DISCOVERY_MESSAGE_TYPE.HELLO || data.type === DISCOVERY_MESSAGE_TYPE.RESPONSE) {
        const existingPeer = peers.get(peerId)
        const peer = {
          id: peerId,
          name: data.name,
          ip: data.ip,
          port: data.port,
          lastSeen: Date.now()
        }

        if (!existingPeer) {
          peers.set(peerId, peer)
          onPeerDiscovered(peer)
        } else {
          existingPeer.lastSeen = Date.now()
        }

        if (data.type === DISCOVERY_MESSAGE_TYPE.HELLO) {
          const response = JSON.stringify({
            type: DISCOVERY_MESSAGE_TYPE.RESPONSE,
            name: deviceName,
            ip: localIp,
            port: tcpPort,
            timestamp: Date.now()
          })
          socket.send(response, DISCOVERY_PORT, data.ip)
        }
      } else if (data.type === DISCOVERY_MESSAGE_TYPE.BYE) {
        if (peers.has(peerId)) {
          peers.delete(peerId)
          onPeerLost(peerId)
        }
      }
    } catch (err) {
      console.error('解析发现消息失败:', err)
    }
  }

  const cleanupPeers = () => {
    const now = Date.now()
    for (const [peerId, peer] of peers.entries()) {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        peers.delete(peerId)
        onPeerLost(peerId)
      }
    }
  }

  const start = () => {
    socket.on('message', handleMessage)

    socket.on('error', (err) => {
      console.error('UDP socket 错误:', err)
    })

    socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
      socket.setBroadcast(true)
      broadcastTimer = setInterval(sendBroadcast, DISCOVERY_BROADCAST_INTERVAL)
      sendBroadcast()
    })

    cleanupTimer = setInterval(cleanupPeers, 5000)
  }

  const stop = () => {
    const byeMessage = JSON.stringify({
      type: DISCOVERY_MESSAGE_TYPE.BYE,
      name: deviceName,
      ip: localIp,
      port: tcpPort,
      timestamp: Date.now()
    })

    const broadcastAddresses = getBroadcastAddress()
    broadcastAddresses.forEach((addr) => {
      socket.send(byeMessage, DISCOVERY_PORT, addr)
    })

    if (broadcastTimer) {
      clearInterval(broadcastTimer)
      broadcastTimer = null
    }
    if (cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }

    socket.close(() => {
      console.log('发现服务已停止')
    })
  }

  const refresh = () => {
    sendBroadcast()
  }

  const getPeers = () => {
    return Array.from(peers.values())
  }

  const setTcpPort = (port) => {
    tcpPort = port
  }

  return {
    start,
    stop,
    refresh,
    getPeers,
    setTcpPort
  }
}

module.exports = { createDiscoveryService }
