import { useEffect, useRef } from 'react'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { useMarketStore } from '../store/marketStore'
import { WebSocketMessageType, SubscribeMessage } from '../types/market'

interface UseWebSocketOptions {
  symbol: string
  channels: readonly ('trade' | 'depth' | 'kline' | 'ticker' | 'metrics' | 'vwap')[]
  klineInterval?: '1m' | '5m' | '15m' | '1h'
}

export const useWebSocket = ({ symbol, channels, klineInterval = '1m' }: UseWebSocketOptions) => {
  const wsRef = useRef<ReconnectingWebSocket | null>(null)
  const statusRef = useRef<string>('disconnected')
  const optionsRef = useRef({ symbol, channels, klineInterval })

  useEffect(() => {
    optionsRef.current = { symbol, channels, klineInterval }
  }, [symbol, channels, klineInterval])

  const setStatus = (status: 'disconnected' | 'connecting' | 'connected' | 'error') => {
    if (statusRef.current !== status) {
      statusRef.current = status
      useMarketStore.getState().setConnectionStatus(status)
    }
  }

  useEffect(() => {
    const state = useMarketStore.getState()
    state.setSymbol(optionsRef.current.symbol)
    state.clearData()
    setStatus('connecting')

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'
    const rws = new ReconnectingWebSocket(wsUrl, [], {
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 5000,
      reconnectionDelayGrowFactor: 2,
      connectionTimeout: 5000,
      maxRetries: Infinity,
      debug: false,
    })

    rws.onopen = () => {
      setStatus('connected')
      const { symbol, channels, klineInterval } = optionsRef.current
      const subscribeMsg: SubscribeMessage = {
        type: 'subscribe',
        symbol,
        channels,
        klineInterval,
      }
      rws.send(JSON.stringify(subscribeMsg))
    }

    rws.onclose = () => {
      if (wsRef.current === rws) {
        setStatus('disconnected')
      }
    }

    rws.onerror = () => {
      if (wsRef.current === rws) {
        setStatus('error')
      }
    }

    rws.onmessage = (event) => {
      try {
        const message: WebSocketMessageType = JSON.parse(event.data)
        const store = useMarketStore.getState()

        switch (message.type) {
          case 'ticker':
            store.setTicker(message.data)
            break
          case 'depth':
            store.setOrderBook(message.data)
            break
          case 'kline':
            store.addKline(message.data)
            break
          case 'trade':
            store.addTrade(message.data)
            break
          case 'metrics':
            store.setMetrics(message.data)
            break
          case 'vwap':
            store.setVwap(message.data)
            break
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    wsRef.current = rws

    return () => {
      rws.onopen = null
      rws.onclose = null
      rws.onerror = null
      rws.onmessage = null
      rws.close()
      if (wsRef.current === rws) {
        wsRef.current = null
      }
      setStatus('disconnected')
    }
  }, [])

  return {}
}
