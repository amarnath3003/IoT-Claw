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
    <div style={{ height: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ── */}
      <header style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 32px',
        height: 72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: '#000',
            border: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <img src="/logo.jpg" alt="iotClaw logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 0.5, lineHeight: 1.1 }}>
              iot<span style={{ color: 'var(--accent)' }}>Claw</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', marginTop: 1 }}>
              AI-Powered Automation
            </div>
          </div>
        </div>

        {/* Status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 14px',
          borderRadius: 99,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
        }}>
          <div className={isConnected ? 'led-pulse' : 'led led-red'} />
          <span style={{ fontSize: 12, color: isConnected ? '#22c55e' : '#f87171', fontWeight: 600 }}>
            {isConnected ? 'System Online' : 'Offline'}
          </span>
          {isConnected && deviceCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
              · {deviceCount} device{deviceCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* ── SIDEBAR NAV ── */}
        <nav style={{
          width: 220,
          background: 'var(--bg-dark)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          padding: '20px 12px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          flexShrink: 0,
          zIndex: 10,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, paddingLeft: 12 }}>
            Navigation
          </div>
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}`}
              onClick={() => setActiveTab(tab.id)}
              className={`neu-tab${activeTab === tab.id ? ' active' : ''}`}
            >
              <span style={{ fontSize: 15, width: 22, textAlign: 'center', opacity: activeTab === tab.id ? 1 : 0.7 }}>{tab.icon}</span>
              {tab.id}
            </button>
          ))}

          {/* Spacer + connection status at bottom */}
          <div style={{ flex: 1 }} />
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.05)',
            paddingTop: 16,
            paddingLeft: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div className={isConnected ? 'led-pulse' : 'led led-red'} style={{ width: 8, height: 8 }} />
              <span style={{ fontSize: 11, color: isConnected ? '#22c55e' : '#f87171', fontWeight: 600 }}>
                {isConnected ? 'System Online' : 'Offline'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>All systems operational</div>
          </div>
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
