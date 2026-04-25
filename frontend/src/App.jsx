import { useState } from 'react'
import Chat from './components/Chat'
import Dashboard from './components/Dashboard'
import Devices from './components/Devices'
import WorkflowEditor from './components/WorkflowEditor'
import TemplateLibrary from './components/TemplateLibrary'
import useWebSocket from './hooks/useWebSocket'
import './index.css'

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'Hello. I can control devices, read sensors, and create automations. Try: "Register a fan called living_room_fan, topic home/living_room/fan, type switch".',
}

const TABS = [
  { id: 'Dashboard', icon: '⊞' },
  { id: 'Devices',   icon: '⊡' },
  { id: 'Chat',      icon: '⌘' },
  { id: 'Workflows', icon: '⟳' },
  { id: 'Templates', icon: '⊟' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [chatMessages, setChatMessages] = useState([INITIAL_MESSAGE])
  const { deviceStates, isConnected } = useWebSocket('ws://127.0.0.1:8000/ws')
  const deviceCount = Object.keys(deviceStates).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>

      {/* ── HEADER ── */}
      <header style={{
        background: 'var(--bg-card)',
        boxShadow: '0 4px 24px #0d0f11, 0 1px 0 rgba(255,255,255,0.04)',
        padding: '0 24px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#000',
            boxShadow: 'var(--sh-flat)',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <img
              src="/logo.jpg"
              alt="iotClaw logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', textShadow: 'var(--glow-sm)', letterSpacing: 1 }}>
              iotClaw
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>
              AI-Powered Automation
            </div>
          </div>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isConnected && deviceCount > 0 && (
            <span className="neu-badge" style={{ marginRight: 4 }}>
              {deviceCount} device{deviceCount !== 1 ? 's' : ''}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className={isConnected ? 'led-pulse' : 'led led-red'} />
            <span style={{ fontSize: 11, color: isConnected ? '#22c55e' : '#f87171', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* ── NAV ── */}
      <nav style={{
        background: 'var(--bg-card)',
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        padding: '0 16px',
        boxShadow: '0 2px 12px #0d0f11',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id.toLowerCase()}`}
            onClick={() => setActiveTab(tab.id)}
            className={`neu-tab${activeTab === tab.id ? ' active' : ''}`}
          >
            <span style={{ fontSize: 13 }}>{tab.icon}</span>
            {tab.id}
          </button>
        ))}
      </nav>

      {/* ── MAIN ── */}
      <main style={{ padding: '28px 24px', maxWidth: 1400, margin: '0 auto' }}>
        {activeTab === 'Dashboard'  && <Dashboard deviceStates={deviceStates} />}
        {activeTab === 'Devices'    && <Devices deviceStates={deviceStates} />}
        {activeTab === 'Chat'       && <Chat messages={chatMessages} setMessages={setChatMessages} />}
        {activeTab === 'Workflows'  && <WorkflowEditor deviceStates={deviceStates} />}
        {activeTab === 'Templates'  && <TemplateLibrary />}
      </main>
    </div>
  )
}
