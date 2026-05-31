const net = require('net')
const fs = require('fs')
const path = require('path')
const os = require('os')

const TCP_PORT_RANGE_START = 58889
const TCP_PORT_RANGE_END = 58999
const CHUNK_SIZE = 64 * 1024

const TRANSFER_STATUS = {
  WAITING: 'waiting',
  TRANSFERRING: 'transferring',
  COMPLETED: 'completed',
  ERROR: 'error',
  REJECTED: 'rejected',
  INTERRUPTED: 'interrupted'
}

let tcpPort = 0
const pendingTransfers = new Map()
const activeTransfers = new Map()
const interruptedTransfers = new Map()

function findAvailablePort(start, end) {
  return new Promise((resolve, reject) => {
    const findPort = (port) => {
      if (port > end) {
        reject(new Error('没有可用的端口'))
        return
      }
      const server = net.createServer()
      server.once('error', () => {
        server.close()
        findPort(port + 1)
      })
      server.once('listening', () => {
        server.close()
        resolve(port)
      })
      server.listen(port, '0.0.0.0')
    }
    findPort(start)
  })
}

function createTcpServer({ localIp, onTransferProgress, onTransferComplete, onTransferError, onIncomingRequest }) {
  const server = net.createServer()

  const handleIncomingConnection = (socket) => {
    let buffer = Buffer.alloc(0)
    let headerParsed = false
    let transferInfo = null
    let currentTransfer = null

    const cleanup = () => {
      if (currentTransfer && currentTransfer.fileStream) {
        currentTransfer.fileStream.close()
        currentTransfer.fileStream = null
      }
      if (transferInfo && pendingTransfers.has(transferInfo.transferId)) {
        pendingTransfers.delete(transferInfo.transferId)
      }
      if (transferInfo && activeTransfers.has(transferInfo.transferId)) {
        activeTransfers.delete(transferInfo.transferId)
      }
      currentTransfer = null
      socket.destroy()
    }

    const saveInterruptedTransfer = () => {
      if (!currentTransfer) return
      if (currentTransfer.fileStream) {
        currentTransfer.fileStream.close()
        currentTransfer.fileStream = null
      }
      interruptedTransfers.set(currentTransfer.transferId, {
        transferId: currentTransfer.transferId,
        fileName: currentTransfer.fileName,
        fileSize: currentTransfer.fileSize,
        senderName: currentTransfer.senderName,
        senderIp: currentTransfer.senderIp,
        senderPort: currentTransfer.senderPort,
        savePath: currentTransfer.savePath,
        receivedBytes: currentTransfer.receivedBytes
      })
    }

    const processFileData = (data) => {
      if (!currentTransfer || !currentTransfer.fileStream) return

      currentTransfer.fileStream.write(data)
      currentTransfer.receivedBytes += data.length

      const now = Date.now()
      if (now - currentTransfer.lastUpdateTime >= 500) {
        const elapsed = (now - currentTransfer.lastUpdateTime) / 1000
        const bytesInInterval = currentTransfer.receivedBytes - currentTransfer.lastReceivedBytes
        const speed = elapsed > 0 ? bytesInInterval / elapsed : 0

        onTransferProgress({
          transferId: currentTransfer.transferId,
          fileName: currentTransfer.fileName,
          fileSize: currentTransfer.fileSize,
          transferred: currentTransfer.receivedBytes,
          progress: Math.round((currentTransfer.receivedBytes / currentTransfer.fileSize) * 100),
          speed,
          direction: 'receive'
        })

        currentTransfer.lastUpdateTime = now
        currentTransfer.lastReceivedBytes = currentTransfer.receivedBytes
      }

      if (currentTransfer.receivedBytes >= currentTransfer.fileSize) {
        currentTransfer.fileStream.end(() => {
          const elapsed = currentTransfer.startTime
            ? (Date.now() - currentTransfer.startTime) / 1000
            : 1
          onTransferComplete({
            transferId: currentTransfer.transferId,
            fileName: currentTransfer.fileName,
            fileSize: currentTransfer.fileSize,
            savePath: currentTransfer.savePath,
            duration: elapsed,
            direction: 'receive'
          })
          interruptedTransfers.delete(currentTransfer.transferId)
          cleanup()
        })
      }
    }

    socket.on('data', (data) => {
      if (!headerParsed) {
        buffer = Buffer.concat([buffer, data])
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex !== -1) {
          const headerJson = buffer.slice(0, newlineIndex).toString()
          const remainingData = buffer.slice(newlineIndex + 1)
          buffer = Buffer.alloc(0)

          try {
            transferInfo = JSON.parse(headerJson)
            headerParsed = true

            if (transferInfo.type === 'TRANSFER_REQUEST') {
              const request = {
                transferId: transferInfo.transferId,
                fileName: transferInfo.fileName,
                fileSize: transferInfo.fileSize,
                senderName: transferInfo.senderName,
                senderIp: socket.remoteAddress,
                senderPort: transferInfo.senderPort,
                status: TRANSFER_STATUS.WAITING,
                socket,
                pendingData: remainingData,
                receivedBytes: 0,
                lastUpdateTime: Date.now(),
                lastReceivedBytes: 0,
                startOffset: 0
              }
              pendingTransfers.set(transferInfo.transferId, request)
              onIncomingRequest(request)
            } else if (transferInfo.type === 'TRANSFER_RESPONSE') {
              if (transferInfo.accepted) {
                const activeTransfer = activeTransfers.get(transferInfo.transferId)
                if (activeTransfer) {
                  if (transferInfo.offset && transferInfo.offset > 0) {
                    startSending(activeTransfer, transferInfo.offset)
                  } else {
                    startSending(activeTransfer)
                  }
                }
              } else {
                const transfer = activeTransfers.get(transferInfo.transferId)
                if (transfer) {
                  onTransferError({
                    transferId: transferInfo.transferId,
                    error: '传输被拒绝'
                  })
                  activeTransfers.delete(transferInfo.transferId)
                }
                cleanup()
              }
            } else if (transferInfo.type === 'RESUME_REQUEST') {
              handleResumeRequest(socket, transferInfo)
            }
          } catch (err) {
            console.error('解析传输头失败:', err)
            cleanup()
          }
        }
      } else if (transferInfo && (transferInfo.type === 'TRANSFER_REQUEST' || transferInfo.type === 'RESUME_REQUEST')) {
        if (!currentTransfer) {
          currentTransfer = activeTransfers.get(transferInfo.transferId)
        }
        if (currentTransfer && currentTransfer.fileStream) {
          processFileData(data)
        }
      }
    })

    socket.on('error', (err) => {
      console.error('TCP 连接错误:', err)
      if (transferInfo) {
        saveInterruptedTransfer()
        onTransferError({
          transferId: transferInfo.transferId,
          error: err.message,
          resumable: true
        })
      }
      cleanup()
    })

    socket.on('close', () => {
      if (
        currentTransfer &&
        currentTransfer.fileStream &&
        currentTransfer.receivedBytes < currentTransfer.fileSize
      ) {
        saveInterruptedTransfer()
        onTransferError({
          transferId: currentTransfer.transferId,
          error: '连接断开',
          resumable: true
        })
      }
    })
  }

  const handleResumeRequest = (socket, info) => {
    const interrupted = interruptedTransfers.get(info.transferId)
    if (!interrupted) {
      const response = JSON.stringify({
        type: 'RESUME_RESPONSE',
        transferId: info.transferId,
        canResume: false,
        offset: 0,
        reason: '没有找到可续传的记录'
      }) + '\n'
      socket.write(response)
      socket.destroy()
      return
    }

    if (interrupted.fileName !== info.fileName || interrupted.fileSize !== info.fileSize) {
      const response = JSON.stringify({
        type: 'RESUME_RESPONSE',
        transferId: info.transferId,
        canResume: false,
        offset: 0,
        reason: '文件信息不匹配'
      }) + '\n'
      socket.write(response)
      socket.destroy()
      return
    }

    const response = JSON.stringify({
      type: 'RESUME_RESPONSE',
      transferId: info.transferId,
      canResume: true,
      offset: interrupted.receivedBytes,
      savePath: interrupted.savePath
    }) + '\n'
    socket.write(response)

    interrupted.socket = socket
    interrupted.status = TRANSFER_STATUS.WAITING
    interrupted.pendingData = Buffer.alloc(0)
    interrupted.lastUpdateTime = Date.now()
    interrupted.lastReceivedBytes = interrupted.receivedBytes
    interrupted.startOffset = interrupted.receivedBytes

    pendingTransfers.set(info.transferId, interrupted)
    interruptedTransfers.delete(info.transferId)

    onIncomingRequest({
      transferId: interrupted.transferId,
      fileName: interrupted.fileName,
      fileSize: interrupted.fileSize,
      senderName: interrupted.senderName,
      senderIp: interrupted.senderIp,
      senderPort: interrupted.senderPort,
      isResume: true,
      startOffset: interrupted.receivedBytes,
      status: TRANSFER_STATUS.WAITING
    })
  }

  const startSending = (transfer, offset = 0) => {
    const { filePath, socket, transferId } = transfer
    const fileName = path.basename(filePath)
    const fileSize = fs.statSync(filePath).size
    const startOffset = offset || 0
    const fileStream = fs.createReadStream(filePath, {
      start: startOffset,
      highWaterMark: CHUNK_SIZE
    })
    let sentBytes = startOffset
    let startTime = Date.now()
    let lastUpdateTime = Date.now()
    let lastSentBytes = startOffset

    transfer.status = TRANSFER_STATUS.TRANSFERRING

    fileStream.on('data', (chunk) => {
      socket.write(chunk)
      sentBytes += chunk.length

      const now = Date.now()
      if (now - lastUpdateTime >= 500) {
        const elapsed = (now - lastUpdateTime) / 1000
        const bytesInInterval = sentBytes - lastSentBytes
        const speed = elapsed > 0 ? bytesInInterval / elapsed : 0

        onTransferProgress({
          transferId,
          fileName,
          fileSize,
          transferred: sentBytes,
          progress: Math.round((sentBytes / fileSize) * 100),
          speed,
          direction: 'send'
        })

        lastUpdateTime = now
        lastSentBytes = sentBytes
      }
    })

    fileStream.on('end', () => {
      socket.end(() => {
        const elapsed = (Date.now() - startTime) / 1000
        onTransferComplete({
          transferId,
          fileName,
          fileSize,
          duration: elapsed,
          direction: 'send'
        })
        activeTransfers.delete(transferId)
      })
    })

    fileStream.on('error', (err) => {
      console.error('读取文件错误:', err)
      onTransferError({
        transferId,
        error: '读取文件失败: ' + err.message
      })
      socket.destroy()
      activeTransfers.delete(transferId)
    })
  }

  server.on('connection', handleIncomingConnection)

  const start = async () => {
    tcpPort = await findAvailablePort(TCP_PORT_RANGE_START, TCP_PORT_RANGE_END)
    server.listen(tcpPort, '0.0.0.0', () => {
      console.log(`TCP 服务器监听端口: ${tcpPort}`)
    })
  }

  const stop = () => {
    server.close(() => {
      console.log('TCP 服务器已停止')
    })
    for (const [, transfer] of activeTransfers) {
      if (transfer.socket) {
        transfer.socket.destroy()
      }
    }
    activeTransfers.clear()
    pendingTransfers.clear()
    interruptedTransfers.clear()
  }

  const getPort = () => tcpPort

  const acceptTransfer = (transferId, savePath) => {
    const pending = pendingTransfers.get(transferId)
    if (!pending) return

    const isResume = pending.isResume === true
    const startOffset = pending.startOffset || 0
    let fileStream

    if (isResume && startOffset > 0) {
      const existingPath = pending.savePath || path.join(savePath, pending.fileName)
      if (!fs.existsSync(existingPath)) {
        fileStream = fs.createWriteStream(path.join(savePath, pending.fileName))
        pending.receivedBytes = 0
        pending.startOffset = 0
      } else {
        fileStream = fs.createWriteStream(existingPath, { flags: 'r+', start: startOffset })
      }
      pending.savePath = existingPath
    } else {
      const fullPath = path.join(savePath, pending.fileName)
      fileStream = fs.createWriteStream(fullPath)
      pending.savePath = fullPath
    }

    const transfer = pending
    transfer.fileStream = fileStream
    transfer.startTime = Date.now()
    transfer.status = TRANSFER_STATUS.TRANSFERRING

    pendingTransfers.delete(transferId)
    activeTransfers.set(transferId, transfer)

    if (transfer.pendingData && transfer.pendingData.length > 0) {
      fileStream.write(transfer.pendingData)
      transfer.receivedBytes = (transfer.startOffset || 0) + transfer.pendingData.length
      transfer.lastReceivedBytes = transfer.receivedBytes
      transfer.pendingData = null
    } else if (isResume && startOffset > 0) {
      transfer.receivedBytes = startOffset
      transfer.lastReceivedBytes = startOffset
    }

    const response = JSON.stringify({
      type: 'TRANSFER_RESPONSE',
      transferId,
      accepted: true,
      offset: isResume ? startOffset : 0
    }) + '\n'
    transfer.socket.write(response)
  }

  const rejectTransfer = (transferId) => {
    const pending = pendingTransfers.get(transferId)
    if (!pending) return

    const response = JSON.stringify({
      type: 'TRANSFER_RESPONSE',
      transferId,
      accepted: false
    }) + '\n'
    pending.socket.write(response)
    pending.socket.destroy()
    pendingTransfers.delete(transferId)

    onTransferError({
      transferId,
      error: '已拒绝传输'
    })
  }

  return {
    start,
    stop,
    getPort,
    acceptTransfer,
    rejectTransfer
  }
}

function sendFile({ transferId, targetIp, targetPort, filePath, onProgress, onComplete, onError }) {
  const socket = new net.Socket()
  const fileName = path.basename(filePath)
  const fileSize = fs.statSync(filePath).size
  const deviceName = os.hostname()

  socket.connect(targetPort, targetIp, () => {
    const header = JSON.stringify({
      type: 'TRANSFER_REQUEST',
      transferId,
      fileName,
      fileSize,
      senderName: deviceName,
      senderPort: tcpPort,
      timestamp: Date.now()
    }) + '\n'

    socket.write(header)

    activeTransfers.set(transferId, {
      transferId,
      filePath,
      fileName,
      fileSize,
      socket,
      status: 'waiting_accept'
    })
  })

  socket.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        if (msg.type === 'TRANSFER_RESPONSE' && msg.accepted && msg.offset > 0) {
          const transfer = activeTransfers.get(transferId)
          if (transfer) {
            const fileStream = fs.createReadStream(filePath, {
              start: msg.offset,
              highWaterMark: CHUNK_SIZE
            })
            let sentBytes = msg.offset
            let startTime = Date.now()
            let lastUpdateTime = Date.now()
            let lastSentBytes = msg.offset

            transfer.status = 'transferring'

            fileStream.on('data', (chunk) => {
              socket.write(chunk)
              sentBytes += chunk.length

              const now = Date.now()
              if (now - lastUpdateTime >= 500) {
                const elapsed = (now - lastUpdateTime) / 1000
                const bytesInInterval = sentBytes - lastSentBytes
                const speed = elapsed > 0 ? bytesInInterval / elapsed : 0

                onProgress({
                  transferId,
                  fileName,
                  fileSize,
                  transferred: sentBytes,
                  progress: Math.round((sentBytes / fileSize) * 100),
                  speed,
                  direction: 'send'
                })

                lastUpdateTime = now
                lastSentBytes = sentBytes
              }
            })

            fileStream.on('end', () => {
              socket.end(() => {
                const elapsed = (Date.now() - startTime) / 1000
                onComplete({
                  transferId,
                  fileName,
                  fileSize,
                  duration: elapsed,
                  direction: 'send'
                })
                activeTransfers.delete(transferId)
              })
            })

            fileStream.on('error', (err) => {
              onError({
                transferId,
                error: '读取文件失败: ' + err.message,
                resumable: true
              })
              socket.destroy()
              activeTransfers.delete(transferId)
            })
          }
          return
        }
      } catch (err) {
        console.error('解析消息失败:', err)
      }
    }
  })

  socket.on('error', (err) => {
    console.error('发送文件错误:', err)
    onError({
      transferId,
      error: '连接失败: ' + err.message,
      resumable: false
    })
    activeTransfers.delete(transferId)
    socket.destroy()
  })

  socket.on('close', () => {
    const transfer = activeTransfers.get(transferId)
    if (transfer && transfer.status !== 'completed' && transfer.status !== 'transferring') {
      onError({
        transferId,
        error: '连接关闭',
        resumable: transfer.status === 'waiting_accept' ? false : true
      })
      activeTransfers.delete(transferId)
    }
  })
}

function resumeFile({ transferId, targetIp, targetPort, filePath, fileName, fileSize, onProgress, onComplete, onError }) {
  const socket = new net.Socket()
  const deviceName = os.hostname()

  socket.connect(targetPort, targetIp, () => {
    const resumeRequest = JSON.stringify({
      type: 'RESUME_REQUEST',
      transferId,
      fileName,
      fileSize,
      senderName: deviceName,
      senderPort: tcpPort,
      timestamp: Date.now()
    }) + '\n'

    socket.write(resumeRequest)

    activeTransfers.set(transferId, {
      transferId,
      filePath,
      fileName,
      fileSize,
      socket,
      status: 'resuming'
    })
  })

  let resumeHandled = false

  socket.on('data', (data) => {
    if (resumeHandled) return
    const lines = data.toString().split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const msg = JSON.parse(line)

        if (msg.type === 'RESUME_RESPONSE') {
          resumeHandled = true

          if (!msg.canResume) {
            onError({
              transferId,
              error: msg.reason || '无法续传，接收端没有找到记录',
              resumable: false
            })
            activeTransfers.delete(transferId)
            socket.destroy()
            return
          }

          const offset = msg.offset || 0
          const actualFileSize = fs.statSync(filePath).size
          const fileStream = fs.createReadStream(filePath, {
            start: offset,
            highWaterMark: CHUNK_SIZE
          })
          let sentBytes = offset
          let startTime = Date.now()
          let lastUpdateTime = Date.now()
          let lastSentBytes = offset

          const transfer = activeTransfers.get(transferId)
          if (transfer) {
            transfer.status = 'transferring'
          }

          fileStream.on('data', (chunk) => {
            socket.write(chunk)
            sentBytes += chunk.length

            const now = Date.now()
            if (now - lastUpdateTime >= 500) {
              const elapsed = (now - lastUpdateTime) / 1000
              const bytesInInterval = sentBytes - lastSentBytes
              const speed = elapsed > 0 ? bytesInInterval / elapsed : 0

              onProgress({
                transferId,
                fileName,
                fileSize: actualFileSize,
                transferred: sentBytes,
                progress: Math.round((sentBytes / actualFileSize) * 100),
                speed,
                direction: 'send'
              })

              lastUpdateTime = now
              lastSentBytes = sentBytes
            }
          })

          fileStream.on('end', () => {
            socket.end(() => {
              const elapsed = (Date.now() - startTime) / 1000
              onComplete({
                transferId,
                fileName,
                fileSize: actualFileSize,
                duration: elapsed,
                direction: 'send'
              })
              activeTransfers.delete(transferId)
            })
          })

          fileStream.on('error', (err) => {
            onError({
              transferId,
              error: '读取文件失败: ' + err.message,
              resumable: true
            })
            socket.destroy()
            activeTransfers.delete(transferId)
          })

          onProgress({
            transferId,
            fileName,
            fileSize: actualFileSize,
            transferred: offset,
            progress: Math.round((offset / actualFileSize) * 100),
            speed: 0,
            direction: 'send'
          })

          return
        }

        if (msg.type === 'TRANSFER_RESPONSE') {
          resumeHandled = true
          if (msg.accepted) {
            const offset = msg.offset || 0
            const actualFileSize = fs.statSync(filePath).size
            const fileStream = fs.createReadStream(filePath, {
              start: offset,
              highWaterMark: CHUNK_SIZE
            })
            let sentBytes = offset
            let startTime = Date.now()
            let lastUpdateTime = Date.now()
            let lastSentBytes = offset

            const transfer = activeTransfers.get(transferId)
            if (transfer) {
              transfer.status = 'transferring'
            }

            fileStream.on('data', (chunk) => {
              socket.write(chunk)
              sentBytes += chunk.length

              const now = Date.now()
              if (now - lastUpdateTime >= 500) {
                const elapsed = (now - lastUpdateTime) / 1000
                const bytesInInterval = sentBytes - lastSentBytes
                const speed = elapsed > 0 ? bytesInInterval / elapsed : 0

                onProgress({
                  transferId,
                  fileName,
                  fileSize: actualFileSize,
                  transferred: sentBytes,
                  progress: Math.round((sentBytes / actualFileSize) * 100),
                  speed,
                  direction: 'send'
                })

                lastUpdateTime = now
                lastSentBytes = sentBytes
              }
            })

            fileStream.on('end', () => {
              socket.end(() => {
                const elapsed = (Date.now() - startTime) / 1000
                onComplete({
                  transferId,
                  fileName,
                  fileSize: actualFileSize,
                  duration: elapsed,
                  direction: 'send'
                })
                activeTransfers.delete(transferId)
              })
            })

            fileStream.on('error', (err) => {
              onError({
                transferId,
                error: '读取文件失败: ' + err.message,
                resumable: true
              })
              socket.destroy()
              activeTransfers.delete(transferId)
            })
          }
          return
        }
      } catch (err) {
        console.error('解析续传响应失败:', err)
      }
    }
  })

  socket.on('error', (err) => {
    console.error('续传连接错误:', err)
    onError({
      transferId,
      error: '续传连接失败: ' + err.message,
      resumable: true
    })
    activeTransfers.delete(transferId)
    socket.destroy()
  })

  socket.on('close', () => {
    const transfer = activeTransfers.get(transferId)
    if (transfer && transfer.status !== 'completed' && transfer.status !== 'transferring') {
      onError({
        transferId,
        error: '续传连接关闭',
        resumable: true
      })
      activeTransfers.delete(transferId)
    }
  })
}

module.exports = { createTcpServer, sendFile, resumeFile }
