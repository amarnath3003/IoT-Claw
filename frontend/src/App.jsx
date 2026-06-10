import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Cpu, MessageSquare, GitBranch,
  Library, Zap, Home,
  Radio, Wifi, WifiOff, ChevronRight
} from 'lucide-react'
import Chat from './components/Chat'
import Dashboard from './components/Dashboard'
import Devices from './components/Devices'
import ZigbeeManager from './components/ZigbeeManager'
import HAManager from './components/HAManager'
import WorkflowEditor from './components/WorkflowEditor'
import TemplateLibrary from './components/TemplateLibrary'
import FlashDevice from './components/FlashDevice'
import ClawModeToggle from './components/ClawModeToggle'
import NotificationBell from './components/NotificationBell'
import useWebSocket from './hooks/useWebSocket'
import { API_BASE } from './api'
import { zigbeePermitJoin } from './api'
import './index.css'

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'Hello. I can control devices, read sensors, and create automations. Try: "Register a fan called living_room_fan, topic home/living_room/fan, type switch".',
}

const TABS = [
  { id: 'Dashboard',     icon: LayoutDashboard,  label: 'Dashboard' },
  { id: 'Devices',       icon: Cpu,              label: 'Devices' },
  { id: 'Chat',          icon: MessageSquare,    label: 'AI Chat' },
  { id: 'Workflows',     icon: GitBranch,        label: 'Workflows' },
  { id: 'Templates',     icon: Library,          label: 'Templates' },
  { id: 'Flash',         icon: Zap,              label: 'Flash' },
  { id: 'HomeAssistant', icon: Home,             label: 'HA Manager' },
]

/* ── shared inline style tokens ── */
const S = {
  border:      'rgba(255,255,255,0.07)',
  borderFocus: 'rgba(26,46,255,0.45)',
  text1:       'rgba(255,255,255,0.82)',
  text2:       'rgba(255,255,255,0.50)',
  text3:       'rgba(255,255,255,0.25)',
  mono:        '"JetBrains Mono", ui-monospace, monospace',
  sans:        '"Outfit", sans-serif',
}

export default function App() {
  const [activeTab, setActiveTab]     = useState('Dashboard')
  const [chatMessages, setChatMessages] = useState([INITIAL_MESSAGE])
  const [clawEnabled, setClawEnabled] = useState(false)

  const { deviceStates, isConnected, brokerConnected, lastMessage, zigbeePairing } =
    useWebSocket('ws://127.0.0.1:8000/ws')
  const deviceCount = Object.keys(deviceStates).length

  // Fetch initial Claw Mode state from backend
  useEffect(() => {
    fetch(`${API_BASE}/autonomous/status`)
      .then(r => r.json())
      .then(d => setClawEnabled(d.enabled ?? false))
      .catch(() => {})
  }, [])

  return (
    <div style={{
      height: '100vh',
      background: '#09090f',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ── HEADER ── */}
      <header style={{
        background: '#0b0b14',
        borderBottom: `1px solid ${S.border}`,
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexShrink: 0,
      }}>
        {/* Left: Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: 8,
            overflow: 'hidden',
            flexShrink: 0,
            background: '#000',
          }}>
            <img
              src="/logo.jpg"
              alt="iotClaw"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          <div>
            <div style={{
              fontFamily: S.sans,
              fontSize: '1.05rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              lineHeight: 1,
              color: S.text1,
            }}>
              iot<span style={{ color: '#1a2eff' }}>CLAW</span>
            </div>
            <div style={{
              fontFamily: S.mono,
              fontSize: '0.58rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: S.text3,
              marginTop: 2,
            }}>
              IoT Platform
            </div>
          </div>
        </div>

        {/* Right: Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Claw Mode active indicator — only shown when enabled */}
          {clawEnabled && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 11px',
              border: '1px solid rgba(26,46,255,0.25)',
              borderRadius: 8,
              background: 'rgba(26,46,255,0.06)',
              fontFamily: S.sans,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6b8cff',
              animation: 'fadeIn 0.3s ease',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#1a2eff',
                flexShrink: 0,
                animation: 'ledBlink 2.5s ease-in-out infinite',
              }} />
              Claw Active
            </div>
          )}

          {/* Telegram badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 11px',
            border: '1px solid rgba(26,46,255,0.2)',
            borderRadius: 8,
            background: 'rgba(26,46,255,0.05)',
            fontFamily: S.sans,
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.50)',
          }}>
            <Radio size={11} />
            Telegram
          </div>

          {/* Connection status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 11px',
            border: `1px solid ${isConnected ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 8,
            background: isConnected ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
            fontFamily: S.sans,
            fontSize: '0.75rem',
            fontWeight: 500,
            color: isConnected ? '#22c55e' : '#ef4444',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isConnected ? '#22c55e' : '#ef4444',
              flexShrink: 0,
              animation: isConnected ? 'ledBlink 2.5s ease-in-out infinite' : 'none',
            }} />
            {isConnected ? 'Online' : 'Offline'}
            {isConnected && deviceCount > 0 && (
              <span style={{
                color: S.text3,
                fontFamily: S.mono,
                fontSize: '0.65rem',
                marginLeft: 2,
              }}>
                · {deviceCount}
              </span>
            )}
          </div>

          <NotificationBell />
        </div>
      </header>

      {/* ── BROKER OFFLINE BANNER ── */}
      {isConnected && !brokerConnected && (
        <div style={{
          background: 'rgba(245,158,11,0.06)',
          borderBottom: '1px solid rgba(245,158,11,0.18)',
          borderLeft: '3px solid #f59e0b',
          padding: '7px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          color: '#f59e0b',
          fontFamily: S.sans,
          fontSize: '0.78rem',
          fontWeight: 600,
          flexShrink: 0,
          animation: 'fadeIn 0.3s ease',
        }}>
          <span>⚠</span>
          MQTT Broker Offline — Commands queued for 60s
        </div>
      )}

      {/* ── ZIGBEE PAIRING BANNER ── */}
      {zigbeePairing?.active && (
        <div style={{
          background: 'rgba(26,46,255,0.06)',
          borderBottom: '1px solid rgba(26,46,255,0.18)',
          borderLeft: '3px solid #1a2eff',
          padding: '7px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
          color: '#6b8cff',
          fontFamily: S.sans,
          fontSize: '0.78rem',
          fontWeight: 600,
          flexShrink: 0,
          animation: 'fadeIn 0.3s ease',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#1a2eff',
            animation: 'ledBlink 1s ease-in-out infinite',
            flexShrink: 0,
          }} />
          Zigbee Pairing Mode Active — Power on device ({zigbeePairing.duration}s window)
          <button
            onClick={() => zigbeePermitJoin(false)}
            style={{
              marginLeft: 'auto',
              padding: '4px 12px',
              fontFamily: S.sans,
              fontSize: '0.72rem',
              fontWeight: 600,
              background: 'rgba(26,46,255,0.12)',
              border: '1px solid rgba(26,46,255,0.35)',
              borderRadius: 7,
              color: '#6b8cff',
              cursor: 'pointer',
            }}
          >
            Close Pairing
          </button>
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── SIDEBAR NAV ── */}
        <nav style={{
          width: 210,
          background: '#0b0b14',
          borderRight: `1px solid ${S.border}`,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          zIndex: 10,
          overflowY: 'auto',
        }}>
          {/* Section label */}
          <div style={{
            fontFamily: S.sans,
            fontSize: '0.62rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: S.text3,
            padding: '0 8px',
            marginBottom: 6,
          }}>
            Navigation
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id.toLowerCase()}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tac-tab${isActive ? ' active' : ''}`}
                >
                  <Icon
                    size={15}
                    strokeWidth={isActive ? 2.2 : 1.7}
                    style={{ flexShrink: 0, transition: 'all 0.15s' }}
                  />
                  <span style={{ flex: 1 }}>{tab.label}</span>
                  {isActive && (
                    <ChevronRight size={11} style={{ opacity: 0.45, flexShrink: 0 }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Claw Mode toggle — persistent, always visible */}
          <ClawModeToggle
            wsMessages={lastMessage}
            enabled={clawEnabled}
            onToggle={setClawEnabled}
          />

          {/* Bottom system status */}
          <div style={{
            borderTop: `1px solid ${S.border}`,
            margin: '10px 4px 0',
            paddingTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {isConnected
                ? <Wifi size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                : <WifiOff size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
              }
              <span style={{
                fontFamily: S.sans,
                fontSize: '0.75rem',
                fontWeight: 500,
                color: isConnected ? '#22c55e' : '#ef4444',
              }}>
                {isConnected ? 'System Online' : 'Offline'}
              </span>
            </div>
            {deviceCount > 0 && (
              <div style={{
                fontFamily: S.mono,
                fontSize: '0.62rem',
                color: S.text3,
                paddingLeft: 19,
              }}>
                {deviceCount} device{deviceCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </nav>

        {/* ── MAIN CONTENT ── */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 28px',
          minWidth: 0,
        }}>
          <div style={{ maxWidth: 1500, margin: '0 auto', height: '100%' }}>
            {activeTab === 'Dashboard'     && <Dashboard deviceStates={deviceStates} wsMessages={lastMessage} clawEnabled={clawEnabled} />}
            {activeTab === 'Devices'       && <Devices deviceStates={deviceStates} wsMessages={lastMessage} />}
            {activeTab === 'Chat'          && <Chat messages={chatMessages} setMessages={setChatMessages} />}
            {activeTab === 'Workflows'     && <WorkflowEditor deviceStates={deviceStates} />}
            {activeTab === 'Templates'     && <TemplateLibrary />}
            {activeTab === 'Flash'         && <FlashDevice />}
            {activeTab === 'HomeAssistant' && <HAManager deviceStates={deviceStates} />}
          </div>
        </main>
      </div>
    </div>
  )
}
