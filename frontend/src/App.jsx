import { useState } from 'react'
import Chat from './components/Chat'
import Dashboard from './components/Dashboard'
import Devices from './components/Devices'
import WorkflowEditor from './components/WorkflowEditor'
import TemplateLibrary from './components/TemplateLibrary'
import useWebSocket from './hooks/useWebSocket'
import './App.css'

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'Hello. I can control devices, read sensors, and create automations. Try: "Register a fan called living_room_fan, topic home/living_room/fan, type switch".',
}

const TABS = [
  { id: 'Dashboard', icon: 'D' },
  { id: 'Devices', icon: '+' },
  { id: 'Chat', icon: 'C' },
  { id: 'Workflows', icon: 'W' },
  { id: 'Templates', icon: 'T' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [chatMessages, setChatMessages] = useState([INITIAL_MESSAGE])
  const { deviceStates, isConnected } = useWebSocket('ws://127.0.0.1:8000/ws')
  const deviceCount = Object.keys(deviceStates).length

  return (
    <div className="app-shell min-h-screen bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-cyan-950 text-sm font-semibold text-cyan-300 border border-cyan-800">
            IC
          </span>
          <h1 className="text-lg font-semibold text-cyan-400 tracking-tight">iotClaw</h1>
          <span className="text-xs text-gray-600 hidden sm:block">AI-powered IoT automation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full transition-colors ${isConnected ? 'bg-green-400' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-400">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          {isConnected && deviceCount > 0 && (
            <span className="text-xs text-gray-600 ml-1 hidden sm:block">
              / {deviceCount} device{deviceCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      <nav className="flex border-b border-gray-800 px-4 bg-gray-900">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2
              ${activeTab === tab.id
                ? 'text-cyan-400 border-cyan-400'
                : 'text-gray-400 border-transparent hover:text-white'
              }`}
          >
            <span className="text-[11px] font-semibold">{tab.icon}</span>
            {tab.id}
          </button>
        ))}
      </nav>

      <main className="p-6">
        {activeTab === 'Dashboard' && <Dashboard deviceStates={deviceStates} />}
        {activeTab === 'Devices' && <Devices deviceStates={deviceStates} />}
        {activeTab === 'Chat' && (
          <Chat messages={chatMessages} setMessages={setChatMessages} />
        )}
        {activeTab === 'Workflows' && <WorkflowEditor deviceStates={deviceStates} />}
        {activeTab === 'Templates' && <TemplateLibrary />}
      </main>
    </div>
  )
}
