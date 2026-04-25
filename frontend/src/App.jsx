import { useState } from 'react'
import Chat from './components/Chat'
import Dashboard from './components/Dashboard'
import WorkflowEditor from './components/WorkflowEditor'
import TemplateLibrary from './components/TemplateLibrary'
import useWebSocket from './hooks/useWebSocket'
import './App.css'

const TABS = [
  { id: 'Dashboard', icon: '📡' },
  { id: 'Chat', icon: '💬' },
  { id: 'Workflows', icon: '⚙️' },
  { id: 'Templates', icon: '📋' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const { deviceStates, isConnected } = useWebSocket('ws://localhost:8000/ws')

  return (
    <div className="app-shell min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🦞</span>
          <h1 className="text-lg font-semibold text-cyan-400 tracking-tight">iotClaw</h1>
          <span className="text-xs text-gray-600 hidden sm:block">AI-powered IoT automation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full transition-colors ${isConnected ? 'bg-green-400' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-400">
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          {isConnected && Object.keys(deviceStates).length > 0 && (
            <span className="text-xs text-gray-600 ml-1 hidden sm:block">
              · {Object.keys(deviceStates).length} device{Object.keys(deviceStates).length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      {/* Tab Nav */}
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
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.id}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="p-6">
        {activeTab === 'Dashboard' && <Dashboard deviceStates={deviceStates} />}
        {activeTab === 'Chat' && <Chat />}
        {activeTab === 'Workflows' && <WorkflowEditor />}
        {activeTab === 'Templates' && <TemplateLibrary />}
      </main>
    </div>
  )
}
