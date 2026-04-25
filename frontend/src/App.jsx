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
    <div style={{ height: '100vh', background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ── */}
      <header style={{
        background: 'var(--bg-card)',
        boxShadow: '0 4px 24px #0d0f11, 0 1px 0 rgba(255,255,255,0.04)',
        padding: '0 32px',
        height: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
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
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', textShadow: 'var(--glow-sm)', letterSpacing: 1.5 }}>
              iotClaw
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.2, marginTop: 2 }}>
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

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* ── SIDEBAR NAV ── */}
        <nav style={{
          width: 240,
          background: 'var(--bg-card)',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          boxShadow: '2px 0 12px #0d0f11',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
          zIndex: 10,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, paddingLeft: 12 }}>
            Main Menu
          </div>
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}`}
              onClick={() => setActiveTab(tab.id)}
              className={`neu-tab${activeTab === tab.id ? ' active' : ''}`}
            >
              <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{tab.icon}</span>
              {tab.id}
            </button>
          ))}
        </nav>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', height: '100%' }}>
            {activeTab === 'Dashboard'  && <Dashboard deviceStates={deviceStates} />}
            {activeTab === 'Devices'    && <Devices deviceStates={deviceStates} />}
            {activeTab === 'Chat'       && <Chat messages={chatMessages} setMessages={setChatMessages} />}
            {activeTab === 'Workflows'  && <WorkflowEditor deviceStates={deviceStates} />}
            {activeTab === 'Templates'  && <TemplateLibrary />}
          </div>
        </main>
      </div>
    </div>
  )
}
