import { useEffect, useState, useRef } from 'react'

export default function useWebSocket(url) {
  const [deviceStates, setDeviceStates] = useState({})
  const [isConnected, setIsConnected] = useState(false)
  const [brokerConnected, setBrokerConnected] = useState(true)
  const [lastMessage, setLastMessage] = useState(null)
  const [zigbeePairing, setZigbeePairing] = useState(null)
  const wsRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!cancelled) setIsConnected(true)
      }

      ws.onclose = () => {
        if (!cancelled) {
          setIsConnected(false)
          // Reconnect after 3 seconds
          setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        if (cancelled) return
        try {
          const msg = JSON.parse(event.data)
          setLastMessage(msg)
          if (msg.type === 'state') {
            setDeviceStates(msg.data)
          } else if (msg.type === 'broker_status') {
            setBrokerConnected(msg.connected)
          } else if (msg.type === 'device_update') {
            setDeviceStates(prev => {
              const updated = { ...prev }
              for (const [name, data] of Object.entries(updated)) {
                if (data.topic_base + '/state' === msg.topic) {
                  updated[name] = {
                    ...data,
                    status: msg.value,
                    last_updated: new Date().toISOString()
                  }
                }
              }
              return updated
            })
          } else if (msg.type === 'zigbee_pairing') {
            setZigbeePairing({ active: msg.active, duration: msg.duration })
          }
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e)
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [url])

  return { deviceStates, isConnected, brokerConnected, lastMessage, zigbeePairing }
}