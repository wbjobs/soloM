import { io, Socket } from 'socket.io-client'
import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'

const CHUNK_SIZE = 16384
const MAX_RETRIES = 3
const ICE_CHECKING_TIMEOUT = 10000

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]

interface FileMeta {
  type: 'file-meta'
  fileId: string
  fileName: string
  fileSize: number
  fileType: string
}

interface FileChunkMsg {
  type: 'file-chunk'
  fileId: string
  index: number
  total: number
}

interface FileEndMsg {
  type: 'file-end'
  fileId: string
}

interface TextMsg {
  type: 'text'
  text: string
}

type DataMsg = FileMeta | FileChunkMsg | FileEndMsg | TextMsg

function getCurrentRoomId(): string | null {
  return useStore.getState().roomId
}

export function useWebRTC() {
  const socketRef = useRef<Socket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const receiveBuffersRef = useRef<Map<string, ArrayBuffer[]>>(new Map())
  const receivedMetaRef = useRef<Map<string, FileMeta>>(new Map())
  const chunkCountRef = useRef<Map<string, number>>(new Map())
  const startTimeRef = useRef<Map<string, number>>(new Map())
  const iceCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rebuildFnRef = useRef<() => void>(() => {})

  const connectionState = useStore((s) => s.connectionState)
  const roomId = useStore((s) => s.roomId)

  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = 'arraybuffer'

    dc.onopen = () => {
      useStore.getState().setConnectionState('connected')
    }

    dc.onclose = () => {
      useStore.getState().setConnectionState('disconnected')
    }

    dc.onmessage = (event) => {
      const data = event.data

      if (typeof data === 'string') {
        const msg: DataMsg = JSON.parse(data)

        if (msg.type === 'text') {
          useStore.getState().addTextMessage({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            content: msg.text,
            direction: 'receiving',
            timestamp: Date.now(),
          })
          try {
            navigator.clipboard.writeText(msg.text)
          } catch (e) {
            console.warn('无法写入剪贴板:', e)
          }
          return
        }

        if (msg.type === 'file-meta') {
          receiveBuffersRef.current.set(msg.fileId, [])
          receivedMetaRef.current.set(msg.fileId, msg)
          chunkCountRef.current.set(msg.fileId, 0)
          startTimeRef.current.set(msg.fileId, Date.now())

          useStore.getState().addTransfer({
            fileId: msg.fileId,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            fileType: msg.fileType,
            direction: 'receiving',
            progress: 0,
            speed: 0,
            status: 'transferring',
          })
        }

        if (msg.type === 'file-end') {
          const buffers = receiveBuffersRef.current.get(msg.fileId)
          const meta = receivedMetaRef.current.get(msg.fileId)
          if (buffers && meta) {
            const blob = new Blob(buffers, { type: meta.fileType })
            useStore.getState().updateTransfer(msg.fileId, {
              progress: 100,
              status: 'completed',
              blob,
              speed: 0,
            })
            receiveBuffersRef.current.delete(msg.fileId)
            receivedMetaRef.current.delete(msg.fileId)
            chunkCountRef.current.delete(msg.fileId)
            startTimeRef.current.delete(msg.fileId)
          }
        }
        return
      }

      if (data instanceof ArrayBuffer) {
        const header = new Uint8Array(data, 0, 1)
        const fileIdLen = header[0]
        const decoder = new TextDecoder()
        const fileId = decoder.decode(new Uint8Array(data, 1, fileIdLen))
        const chunk = new Uint8Array(data, 1 + fileIdLen)

        const buffers = receiveBuffersRef.current.get(fileId)
        if (buffers) {
          buffers.push(chunk.buffer)

          const count = (chunkCountRef.current.get(fileId) || 0) + 1
          chunkCountRef.current.set(fileId, count)

          const meta = receivedMetaRef.current.get(fileId)
          if (meta) {
            const received = buffers.reduce((acc, b) => acc + b.byteLength, 0)
            const progress = Math.min(100, (received / meta.fileSize) * 100)
            const elapsed = (Date.now() - (startTimeRef.current.get(fileId) || Date.now())) / 1000
            const speed = elapsed > 0 ? received / elapsed : 0

            useStore.getState().updateTransfer(fileId, { progress, speed })
          }
        }
      }
    }
  }, [])

  const createOffer = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !socketRef.current) return

    const dc = pc.createDataChannel('fileTransfer', { ordered: true })
    setupDataChannel(dc)
    dcRef.current = dc

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const rid = getCurrentRoomId()
      socketRef.current.emit('offer', { roomId: rid, sdp: offer })
    } catch (err) {
      console.error('创建 Offer 失败:', err)
    }
  }, [setupDataChannel])

  const initSocket = useCallback((socket: Socket) => {
    socket.on('room-created', ({ roomId: id }) => {
      useStore.getState().setRoomId(id)
      useStore.getState().setIsInitiator(true)
    })

    socket.on('room-joined', ({ roomId: id }) => {
      useStore.getState().setRoomId(id)
      useStore.getState().setIsInitiator(false)
    })

    socket.on('peer-joined', () => {
      useStore.getState().setConnectionState('connecting')
      createOffer()
    })

    socket.on('offer', async ({ sdp }) => {
      const pc = pcRef.current
      if (!pc || !socketRef.current) return
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        const rid = getCurrentRoomId()
        socketRef.current.emit('answer', { roomId: rid, sdp: answer })
      } catch (err) {
        console.error('处理 Offer 失败:', err)
      }
    })

    socket.on('answer', async ({ sdp }) => {
      const pc = pcRef.current
      if (!pc) return
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      } catch (err) {
        console.error('处理 Answer 失败:', err)
      }
    })

    socket.on('ice-candidate', async ({ candidate }) => {
      const pc = pcRef.current
      if (!pc) return
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('添加 ICE Candidate 失败:', err)
      }
    })

    socket.on('peer-left', () => {
      useStore.getState().setConnectionState('disconnected')
      cleanupPeer()
    })

    socket.on('error', ({ message }) => {
      useStore.getState().setError(message)
    })
  }, [createOffer])

  const initPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    })
    pcRef.current = pc

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        const rid = getCurrentRoomId()
        socketRef.current.emit('ice-candidate', {
          roomId: rid,
          candidate: event.candidate,
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      const store = useStore.getState()

      if (state === 'checking') {
        if (iceCheckTimerRef.current) {
          clearTimeout(iceCheckTimerRef.current)
        }
        iceCheckTimerRef.current = setTimeout(() => {
          const currentPc = pcRef.current
          if (!currentPc) return
          if (
            currentPc.iceConnectionState === 'checking' ||
            currentPc.iceConnectionState === 'new'
          ) {
            const retry = store.retryCount + 1
            if (retry <= MAX_RETRIES) {
              console.warn(`[ICE] checking 超时，第 ${retry} 次重试...`)
              store.setRetryCount(retry)
              store.setConnectionState('reconnecting')
              rebuildFnRef.current()
            } else {
              console.error('[ICE] 重试次数耗尽，连接失败')
              store.setConnectionState('disconnected')
              store.setError('连接失败，请重新创建房间')
              cleanupPeer()
            }
          }
        }, ICE_CHECKING_TIMEOUT)
      }

      if (state === 'connected' || state === 'completed') {
        if (iceCheckTimerRef.current) {
          clearTimeout(iceCheckTimerRef.current)
          iceCheckTimerRef.current = null
        }
        useStore.getState().setRetryCount(0)
        useStore.getState().setConnectionState('connected')
      }

      if (state === 'failed') {
        if (iceCheckTimerRef.current) {
          clearTimeout(iceCheckTimerRef.current)
          iceCheckTimerRef.current = null
        }
        const store = useStore.getState()
        const retry = store.retryCount + 1
        if (retry <= MAX_RETRIES) {
          console.warn(`[ICE] 连接失败，第 ${retry} 次重试...`)
          store.setRetryCount(retry)
          store.setConnectionState('reconnecting')
          rebuildFnRef.current()
        } else {
          store.setConnectionState('disconnected')
          store.setError('连接失败，请重新创建房间')
        }
      }

      if (state === 'disconnected') {
        if (iceCheckTimerRef.current) {
          clearTimeout(iceCheckTimerRef.current)
          iceCheckTimerRef.current = null
        }
        useStore.getState().setConnectionState('disconnected')
      }
    }

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          if (iceCheckTimerRef.current) {
            clearTimeout(iceCheckTimerRef.current)
            iceCheckTimerRef.current = null
          }
          useStore.getState().setConnectionState('connected')
          break
        case 'disconnected':
        case 'failed':
          useStore.getState().setConnectionState('disconnected')
          break
      }
    }

    pc.ondatachannel = (event) => {
      const dc = event.channel
      dcRef.current = dc
      setupDataChannel(dc)
    }
  }, [setupDataChannel])

  const rebuildPeerConnection = useCallback(() => {
    cleanupPeer()
    initPeerConnection()
    const store = useStore.getState()
    if (store.isInitiator) {
      createOffer()
    }
  }, [initPeerConnection, createOffer])

  useEffect(() => {
    rebuildFnRef.current = rebuildPeerConnection
  }, [rebuildPeerConnection])

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket
    initSocket(socket)
    initPeerConnection()

    return () => {
      cleanupPeer()
      socket.disconnect()
      socketRef.current = null
    }
  }, [initSocket, initPeerConnection])

  function cleanupPeer() {
    if (iceCheckTimerRef.current) {
      clearTimeout(iceCheckTimerRef.current)
      iceCheckTimerRef.current = null
    }
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
  }

  async function sendFiles(files: File[]) {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open') return

    for (const file of files) {
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      const metaMsg: FileMeta = {
        type: 'file-meta',
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
      }
      dc.send(JSON.stringify(metaMsg))

      useStore.getState().addTransfer({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        direction: 'sending',
        progress: 0,
        speed: 0,
        status: 'transferring',
      })

      const startTime = Date.now()
      let sentBytes = 0

      const encoder = new TextEncoder()
      const fileIdBytes = encoder.encode(fileId)
      const fileIdLen = fileIdBytes.length

      let offset = 0
      while (offset < file.size) {
        const chunkData = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
        const chunk = new Uint8Array(chunkData)

        const packet = new Uint8Array(1 + fileIdLen + chunk.length)
        packet[0] = fileIdLen
        packet.set(fileIdBytes, 1)
        packet.set(chunk, 1 + fileIdLen)

        if (dc.bufferedAmount > 1048576) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (dc.readyState !== 'open') {
                resolve()
                return
              }
              if (dc.bufferedAmount < 524288) {
                resolve()
              } else {
                setTimeout(check, 10)
              }
            }
            check()
          })
        }

        if (dc.readyState !== 'open') break

        dc.send(packet.buffer)
        offset += CHUNK_SIZE
        sentBytes = Math.min(offset, file.size)
        const progress = (sentBytes / file.size) * 100
        const elapsed = (Date.now() - startTime) / 1000
        const speed = elapsed > 0 ? sentBytes / elapsed : 0

        useStore.getState().updateTransfer(fileId, { progress, speed })
      }

      if (dc.readyState === 'open') {
        const endMsg: FileEndMsg = { type: 'file-end', fileId }
        dc.send(JSON.stringify(endMsg))
      }

      useStore.getState().updateTransfer(fileId, { progress: 100, status: 'completed', speed: 0 })
    }
  }

  function createRoom() {
    if (socketRef.current) {
      socketRef.current.emit('create-room')
    }
  }

  function sendText(text: string) {
    const dc = dcRef.current
    if (!dc || dc.readyState !== 'open' || !text.trim()) return

    const msg: TextMsg = { type: 'text', text }
    dc.send(JSON.stringify(msg))

    useStore.getState().addTextMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: text,
      direction: 'sending',
      timestamp: Date.now(),
    })
  }

  function joinRoom(id: string) {
    if (socketRef.current) {
      useStore.getState().setRoomId(id)
      socketRef.current.emit('join-room', { roomId: id })
    }
  }

  function leaveRoom() {
    cleanupPeer()
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    useStore.getState().reset()

    const socket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket
    initSocket(socket)
    initPeerConnection()
  }

  return {
    connectionState,
    roomId,
    createRoom,
    joinRoom,
    leaveRoom,
    sendFiles,
    sendText,
  }
}
