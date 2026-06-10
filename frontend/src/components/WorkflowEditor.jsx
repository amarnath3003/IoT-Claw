import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Download, Upload, Play, RefreshCw, Save, ChevronLeft, ChevronRight, Settings2, Plus, X, MoreVertical } from 'lucide-react'
import { createWorkflow, getState, getWorkflows } from '../api'
import WorkflowList from './WorkflowList'
import useMediaQuery from '../hooks/useMediaQuery'

const S = {
  sans: '"Outfit", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  text1: 'rgba(255,255,255,0.82)',
  text2: 'rgba(255,255,255,0.50)',
  text3: 'rgba(255,255,255,0.25)',
  border: 'rgba(255,255,255,0.07)',
  surface: 'rgba(255,255,255,0.03)',
}

const OPERATORS = ['>', '<', '>=', '<=', '==', '!=']

const BLOCKS = [
  { type: 'trigger.sensor',       label: 'Sensor',       icon: '◈', cat: 'trigger', hint: 'value condition' },
  { type: 'trigger.chat',         label: 'Chat',         icon: '⌘', cat: 'trigger', hint: 'secret phrase'   },
  { type: 'trigger.schedule',     label: 'Schedule',     icon: '⏱', cat: 'trigger', hint: 'daily at time'   },
  { type: 'trigger.device_event', label: 'Device Event', icon: '⚡', cat: 'trigger', hint: 'online/offline'  },
  { type: 'action.device',        label: 'Switch',       icon: '⏻', cat: 'action',  hint: 'on / off'        },
  { type: 'action.brightness',    label: 'Brightness',   icon: '◑', cat: 'action',  hint: 'set level 0–100' },
  { type: 'action.camera_monitor',label: 'Camera CV',    icon: '⊙', cat: 'action',  hint: 'start / stop'    },
  { type: 'action.log',           label: 'Log',          icon: '⊟', cat: 'action',  hint: 'write a message' },
]

const DEFAULT_CONFIG = {
  'trigger.sensor':        { device: '', operator: '>', value: '' },
  'trigger.chat':          { code: '' },
  'trigger.schedule':      { time: '07:30' },
  'trigger.device_event':  { device: '', event: 'offline' },
  'action.device':         { device: '', command: 'ON' },
  'action.brightness':     { device: '', level: 50 },
  'action.camera_monitor': { device: 'laptop_security_camera', command: 'ON' },
  'action.log':            { message: 'Workflow fired' },
}

function makeNodeData(blockType) {
  const block = BLOCKS.find(b => b.type === blockType)
  return { blockType, label: block?.label || blockType, config: { ...(DEFAULT_CONFIG[blockType] || {}) } }
}

function buildNodeLabel(data) {
  const c = data.config || {}
  const block = BLOCKS.find(b => b.type === data.blockType)
  const icon  = block?.icon || '⬡'
  let detail  = ''
  if (data.blockType === 'trigger.sensor')        detail = `${c.device || '—'} ${c.operator} ${c.value || '?'}`
  if (data.blockType === 'trigger.chat')          detail = c.code ? `"${c.code}"` : 'set phrase'
  if (data.blockType === 'trigger.schedule')      detail = c.time || 'HH:MM'
  if (data.blockType === 'trigger.device_event')  detail = `${c.device || '—'} ${c.event || 'offline'}`
  if (data.blockType === 'action.device')         detail = `${c.device || '—'} → ${c.command}`
  if (data.blockType === 'action.brightness')     detail = `${c.device || '—'} → ${c.level}%`
  if (data.blockType === 'action.camera_monitor') detail = `${c.device || 'cam'} ${c.command}`
  if (data.blockType === 'action.log')            detail = c.message || 'log…'

  const isTrigger = data.blockType.startsWith('trigger.')
  return (
    <div style={{
      padding: '8px 12px',
      background: isTrigger ? 'rgba(26,46,255,0.10)' : 'rgba(34,197,94,0.08)',
      border: `1px solid ${isTrigger ? 'rgba(26,46,255,0.25)' : 'rgba(34,197,94,0.2)'}`,
      borderRadius: 8,
      minWidth: 150,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: isTrigger ? '#4d6aff' : '#22c55e' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: isTrigger ? '#4d6aff' : '#22c55e', fontFamily: S.sans }}>
          {data.label}
        </span>
      </div>
      <div style={{ fontSize: 10, color: S.text3, fontFamily: S.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
        {detail}
      </div>
    </div>
  )
}

function toCanvasNode(node) {
  return { ...node, data: { ...node.data, label: buildNodeLabel(node.data) } }
}

const INITIAL_NODES = [
  { id: 'trigger-1', type: 'default', position: { x: 80,  y: 140 }, data: makeNodeData('trigger.sensor') },
  { id: 'action-1',  type: 'default', position: { x: 380, y: 140 }, data: makeNodeData('action.device')  },
]
const INITIAL_EDGES = [{
  id: 'e0', source: 'trigger-1', target: 'action-1', animated: true,
  style: { stroke: '#1a2eff', strokeWidth: 1.5 },
}]

/* ── Device select ── */
function DeviceSelect({ value, deviceNames, label = 'Device', onChange }) {
  return (
    <div>
      <label className="neu-label">{label}</label>
      <select className="neu-input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— select —</option>
        {deviceNames.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )
}

/* ── Block inspector ── */
function BlockInspector({ node, deviceNames, onChange }) {
  const data      = node.data.raw || node.data
  const config    = data.config || {}
  const block     = BLOCKS.find(b => b.type === data.blockType)
  const isTrigger = data.blockType.startsWith('trigger.')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Block type badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: isTrigger ? 'rgba(26,46,255,0.07)' : 'rgba(34,197,94,0.07)',
        border: `1px solid ${isTrigger ? 'rgba(26,46,255,0.15)' : 'rgba(34,197,94,0.15)'}`,
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 15, color: isTrigger ? '#4d6aff' : '#22c55e' }}>{block?.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: isTrigger ? '#4d6aff' : '#22c55e', fontFamily: S.sans }}>
          {data.label}
        </span>
      </div>

      {data.blockType === 'trigger.sensor' && (<>
        <DeviceSelect value={config.device} deviceNames={deviceNames} label="Sensor" onChange={v => onChange('device', v)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="neu-label">Operator</label>
            <select className="neu-input" value={config.operator} onChange={e => onChange('operator', e.target.value)}>
              {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <div>
            <label className="neu-label">Value</label>
            <input className="neu-input" value={config.value} onChange={e => onChange('value', e.target.value)} placeholder="25" />
          </div>
        </div>
      </>)}

      {data.blockType === 'trigger.chat' && (
        <div>
          <label className="neu-label">Secret phrase</label>
          <input className="neu-input" value={config.code} onChange={e => onChange('code', e.target.value)} placeholder="open sesame" />
        </div>
      )}

      {data.blockType === 'trigger.device_event' && (<>
        <DeviceSelect value={config.device} deviceNames={deviceNames} label="Device to watch" onChange={v => onChange('device', v)} />
        <div>
          <label className="neu-label">Event</label>
          <select className="neu-input" value={config.event || 'offline'} onChange={e => onChange('event', e.target.value)}>
            <option value="offline">Goes offline</option>
            <option value="online">Comes back online</option>
          </select>
        </div>
      </>)}

      {data.blockType === 'trigger.schedule' && (
        <div>
          <label className="neu-label">Time (daily)</label>
          <input type="time" className="neu-input" value={config.time} onChange={e => onChange('time', e.target.value)} />
        </div>
      )}

      {data.blockType === 'action.device' && (<>
        <DeviceSelect value={config.device} deviceNames={deviceNames} label="Target device" onChange={v => onChange('device', v)} />
        <div>
          <label className="neu-label">Command</label>
          <select className="neu-input" value={config.command} onChange={e => onChange('command', e.target.value)}>
            <option value="ON">Turn ON</option>
            <option value="OFF">Turn OFF</option>
          </select>
        </div>
      </>)}

      {data.blockType === 'action.brightness' && (<>
        <DeviceSelect value={config.device} deviceNames={deviceNames} label="Target device" onChange={v => onChange('device', v)} />
        <div>
          <label className="neu-label">Brightness — {config.level}%</label>
          <input type="range" min="0" max="100" value={config.level}
            onChange={e => onChange('level', e.target.value)}
            style={{ width: '100%', accentColor: '#1a2eff' }} />
        </div>
      </>)}

      {data.blockType === 'action.camera_monitor' && (<>
        <DeviceSelect value={config.device} deviceNames={deviceNames} label="Camera device" onChange={v => onChange('device', v)} />
        <div>
          <label className="neu-label">Command</label>
          <select className="neu-input" value={config.command} onChange={e => onChange('command', e.target.value)}>
            <option value="ON">Start detecting</option>
            <option value="OFF">Stop monitoring</option>
          </select>
        </div>
        <div className="neu-alert-warn" style={{ fontSize: 11 }}>Sends Telegram alert on detection.</div>
      </>)}

      {data.blockType === 'action.log' && (
        <div>
          <label className="neu-label">Log message</label>
          <textarea rows={2} className="neu-input"
            value={config.message}
            onChange={e => onChange('message', e.target.value)}
            style={{ resize: 'none' }} />
        </div>
      )}
    </div>
  )
}

/* ── Canvas ── */
function WorkflowCanvas({ deviceStates }) {
  const [devices, setDevices]               = useState(deviceStates || {})
  const [workflows, setWorkflows]           = useState([])
  const [nodes, setNodes, onNodesChange]    = useNodesState(INITIAL_NODES.map(toCanvasNode))
  const [edges, setEdges, onEdgesChange]    = useEdgesState(INITIAL_EDGES)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [meta, setMeta]                     = useState({ name: '', cooldown_seconds: 60, enabled: true })
  const [showAdvanced, setShowAdvanced]     = useState(false)
  const [message, setMessage]               = useState('')
  const [msgType, setMsgType]               = useState('error')
  const [saving, setSaving]                 = useState(false)
  const [running, setRunning]               = useState(false)
  const [blocksOpen, setBlocksOpen]         = useState(true)
  const [detailsOpen, setDetailsOpen]       = useState(true)
  const [mobileBlocksOpen, setMobileBlocksOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSaveOpen, setMobileSaveOpen] = useState(false)
  const { screenToFlowPosition, screenToFlowPositionViewport } = useReactFlow()
  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => { if (Object.keys(deviceStates || {}).length) setDevices(deviceStates) }, [deviceStates])
  useEffect(() => {
    getState().then(r => setDevices(r.data)).catch(() => {})
    refreshWorkflows()
  }, [])

  // Auto-open details panel when a node is selected
  useEffect(() => { if (selectedNodeId) setDetailsOpen(true) }, [selectedNodeId])

  const deviceNames   = Object.keys(devices)
  const selectedNode  = nodes.find(n => n.id === selectedNodeId)
  const renderedNodes = useMemo(() => nodes, [nodes])

  const refreshWorkflows = () => getWorkflows().then(r => setWorkflows(r.data)).catch(() => {})

  const onConnect = useCallback(
    params => setEdges(cur => addEdge({ ...params, animated: true, style: { stroke: '#1a2eff', strokeWidth: 1.5 } }, cur)),
    [setEdges],
  )

  const addBlock = (blockType, position = null) => {
    const isTrigger = blockType.startsWith('trigger.')
    setNodes(cur => {
      const filtered = isTrigger ? cur.filter(n => !(n.data.raw?.blockType || n.data.blockType || '').startsWith('trigger.')) : cur
      const id       = `${blockType.replace('.', '-')}-${Date.now()}`
      const rawData  = makeNodeData(blockType)
      
      // On mobile without drag-and-drop, position should be centered roughly.
      let finalPosition = position
      if (!finalPosition) {
        // If no explicit position (e.g. tapped from mobile menu), stagger them down
        finalPosition = { x: isTrigger ? 80 : 250, y: 140 + cur.length * 80 }
      }

      const node = {
        id, type: 'default',
        position: finalPosition,
        data: { ...rawData, raw: rawData, label: buildNodeLabel(rawData) },
      }
      return [...filtered, node]
    })
    if (isMobile) setMobileBlocksOpen(false)
  }

  const onDragStart = (e, blockType) => {
    e.dataTransfer.setData('application/reactflow', blockType)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = e => {
    e.preventDefault()
    const blockType = e.dataTransfer.getData('application/reactflow')
    if (blockType) addBlock(blockType, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  const updateSelectedConfig = (field, value) => {
    setNodes(cur => cur.map(node => {
      if (node.id !== selectedNodeId) return node
      const rawData  = node.data.raw || { ...node.data, label: undefined }
      const nextData = { ...rawData, config: { ...rawData.config, [field]: value } }
      return { ...node, data: { ...nextData, raw: nextData, label: buildNodeLabel(nextData) } }
    }))
  }

  const getRaw = node => node.data.raw || { ...node.data, label: undefined }

  const orderedActions = (triggerNode, actionNodes) => {
    const byId = new Map(actionNodes.map(n => [n.id, n]))
    const visited = new Set(); const order = []
    const walk = srcId => {
      edges.filter(e => e.source === srcId).forEach(e => {
        const a = byId.get(e.target)
        if (a && !visited.has(a.id)) { visited.add(a.id); order.push(a); walk(a.id) }
      })
    }
    walk(triggerNode.id)
    return order
  }

  const actionPayload = node => {
    const { blockType, config: c } = getRaw(node)
    if (blockType === 'action.device')         return { type: 'device',         device: c.device, command: c.command }
    if (blockType === 'action.brightness')     return { type: 'brightness',     device: c.device, level: Number(c.level) }
    if (blockType === 'action.camera_monitor') return { type: 'camera_monitor', device: c.device, command: c.command }
    return { type: 'log', message: c.message }
  }

  const triggerPayload = node => {
    const { blockType, config: c } = getRaw(node)
    if (blockType === 'trigger.sensor')       return { type: 'sensor',       device: c.device, operator: c.operator, value: isNaN(Number(c.value)) ? c.value : Number(c.value) }
    if (blockType === 'trigger.chat')         return { type: 'chat',         code: c.code }
    if (blockType === 'trigger.device_event') return { type: 'device_event', device: c.device, event: c.event || 'offline' }
    return { type: 'schedule', time: c.time }
  }

  const validateAndBuild = () => {
    const rawNodes     = nodes.map(n => ({ ...n, data: getRaw(n) }))
    const triggerNodes = rawNodes.filter(n => n.data.blockType.startsWith('trigger.'))
    const actionNodes  = rawNodes.filter(n => n.data.blockType.startsWith('action.'))
    if (!meta.name.trim())         throw new Error('Workflow name is required.')
    if (triggerNodes.length !== 1) throw new Error('Add exactly one trigger block.')
    if (actionNodes.length === 0)  throw new Error('Add at least one action block.')
    const trigger = triggerPayload(triggerNodes[0])
    if (trigger.type === 'sensor'       && (!trigger.device || trigger.value === '')) throw new Error('Sensor trigger needs a device and value.')
    if (trigger.type === 'chat'         && !trigger.code.trim()) throw new Error('Chat trigger needs a phrase.')
    if (trigger.type === 'schedule'     && !/^\d{2}:\d{2}$/.test(trigger.time))     throw new Error('Schedule time must be HH:MM.')
    if (trigger.type === 'device_event' && !trigger.device)      throw new Error('Device Event trigger needs a device.')
    const connected = orderedActions(triggerNodes[0], actionNodes)
    if (connected.length === 0) throw new Error('Connect the trigger to at least one action.')
    const actions = connected.map(actionPayload)
    for (const a of actions) {
      if (['device', 'brightness', 'camera_monitor'].includes(a.type) && !a.device)
        throw new Error('Action needs a target device.')
    }
    return {
      name: meta.name.trim(), description: '',
      enabled: meta.enabled, cooldown_seconds: Number(meta.cooldown_seconds) || 60,
      trigger, actions,
      graph: { nodes: rawNodes.map(n => ({ id: n.id, blockType: n.data.blockType, position: n.position, config: n.data.config })), edges },
    }
  }

  const handleExport = () => {
    try {
      const payload = validateAndBuild()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `${payload.name.replace(/\s+/g, '_')}_workflow.json`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) { setMessage(err.message); setMsgType('error') }
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wf = JSON.parse(ev.target.result)
        if (wf.name) setMeta(m => ({ ...m, name: wf.name, cooldown_seconds: wf.cooldown_seconds || 60, enabled: wf.enabled ?? true }))
        setMessage(`Imported "${wf.name}"`); setMsgType('success')
      } catch { setMessage('Invalid JSON file.'); setMsgType('error') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleTestRun = async () => {
    const match = workflows.find(w => w.name === meta.name.trim())
    if (!match) { setMessage('Save first, then test run.'); setMsgType('error'); return }
    setRunning(true)
    try {
      const res  = await fetch(`/workflows/${match.id}/run`, { method: 'POST' })
      const data = await res.json()
      setMessage(`Run: ${JSON.stringify(data.result || 'ok')}`); setMsgType('success')
      refreshWorkflows()
    } catch (err) { setMessage(`Run failed: ${err.message}`); setMsgType('error') }
    finally { setRunning(false) }
  }

  const onKeyDown = useCallback((e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      setNodes(cur => cur.filter(n => n.id !== selectedNodeId))
      setEdges(cur => cur.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
      setSelectedNodeId(null)
    }
  }, [selectedNodeId, setNodes, setEdges])

  const handleSave = async () => {
    setMessage(''); setSaving(true)
    try {
      const payload = validateAndBuild()
      const res     = await createWorkflow(payload)
      setWorkflows(cur => [...cur, res.data])
      setMeta({ name: '', cooldown_seconds: 60, enabled: true })
      setMessage(`"${res.data.name}" saved`); setMsgType('success')
    } catch (err) {
      setMessage(err.message || 'Failed to save.'); setMsgType('error')
    } finally { setSaving(false) }
  }

  const resetCanvas = () => {
    setNodes(INITIAL_NODES.map(toCanvasNode)); setEdges(INITIAL_EDGES)
    setSelectedNodeId(null); setMessage('')
  }

  /* panel widths */
  const BW = blocksOpen ? 176 : 44
  const DW = detailsOpen ? 252 : 44

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onKeyDown={onKeyDown} tabIndex={-1}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#1a2eff',
            boxShadow: '0 0 6px rgba(26,46,255,0.6)',
            animation: 'ledBlink 2s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: S.sans, fontSize: 14, fontWeight: 700, color: S.text1 }}>
            Workflow Builder
          </span>
          <span style={{
            fontFamily: S.mono, fontSize: 10, color: S.text3,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${S.border}`,
            padding: '2px 7px', borderRadius: 6,
          }}>
            {workflows.length} saved
          </span>
        </div>

        {isMobile ? (
          <div>
            <button className="neu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ padding: '6px' }}>
              <MoreVertical size={16} />
            </button>
            {mobileMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 32,
                background: '#09090f', border: `1px solid ${S.border}`,
                borderRadius: 8, padding: 8,
                display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
              }}>
                <label className="neu-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 11px', width: '100%' }} title="Import JSON">
                  <Upload size={12} /> Import
                  <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                </label>
                <button className="neu-btn" onClick={() => { handleExport(); setMobileMenuOpen(false); }} style={{ fontSize: 12, padding: '6px 11px', display: 'flex', alignItems: 'center', gap: 5, width: '100%' }}>
                  <Download size={12} /> Export
                </button>
                <button className="neu-btn" onClick={() => { handleTestRun(); setMobileMenuOpen(false); }} disabled={running}
                  style={{ fontSize: 12, padding: '6px 11px', display: 'flex', alignItems: 'center', gap: 5, color: '#22c55e', borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)', width: '100%' }}>
                  {running ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} />}
                  {running ? 'Running…' : 'Test Run'}
                </button>
                <button className="neu-btn" onClick={() => { resetCanvas(); setMobileMenuOpen(false); }} style={{ fontSize: 12, padding: '6px 11px', width: '100%' }}>
                  ↺ Reset
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label className="neu-btn" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 11px' }} title="Import JSON">
              <Upload size={12} /> Import
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <button className="neu-btn" onClick={handleExport} style={{ fontSize: 12, padding: '6px 11px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Download size={12} /> Export
            </button>
            <button className="neu-btn" onClick={handleTestRun} disabled={running}
              style={{ fontSize: 12, padding: '6px 11px', display: 'flex', alignItems: 'center', gap: 5, color: '#22c55e', borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)' }}>
              {running ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} />}
              {running ? 'Running…' : 'Test Run'}
            </button>
            <button className="neu-btn" onClick={resetCanvas} style={{ fontSize: 12, padding: '6px 11px' }}>
              ↺ Reset
            </button>
          </div>
        )}
      </div>

      {/* ── Three-column builder ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : `${BW}px 1fr ${DW}px`,
        gap: 10,
        alignItems: 'start',
        transition: 'grid-template-columns 0.2s ease',
        position: 'relative'
      }}>

        {/* ── LEFT: Blocks palette ── */}
        {!isMobile && (
          <div className="neu-section" style={{ overflow: 'hidden', minWidth: 0 }}>
          {/* Header */}
          <button
            onClick={() => setBlocksOpen(o => !o)}
            style={{
              all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: blocksOpen ? '11px 14px' : '11px 10px',
              borderBottom: `1px solid ${S.border}`,
              transition: 'padding 0.2s',
            }}
          >
            {blocksOpen && (
              <span style={{ fontFamily: S.sans, fontSize: 12, fontWeight: 600, color: S.text2 }}>Blocks</span>
            )}
            <ChevronLeft size={13} style={{
              color: S.text3,
              transform: blocksOpen ? 'none' : 'rotate(180deg)',
              transition: 'transform 0.2s',
              marginLeft: blocksOpen ? 0 : 'auto', marginRight: blocksOpen ? 0 : 'auto',
            }} />
          </button>

          {/* Expanded: full block list */}
          {blocksOpen && (
            <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Triggers */}
              <div>
                <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 600, color: '#4d6aff', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, padding: '0 4px' }}>
                  When
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {BLOCKS.filter(b => b.cat === 'trigger').map(block => (
                    <button key={block.type}
                      draggable onDragStart={e => onDragStart(e, block.type)} onClick={() => addBlock(block.type)}
                      style={{
                        all: 'unset', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 8px', borderRadius: 8,
                        border: '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,46,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(26,46,255,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                    >
                      <span style={{ fontSize: 13, color: '#4d6aff', flexShrink: 0 }}>{block.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: S.sans, fontSize: 12, fontWeight: 500, color: S.text1 }}>{block.label}</div>
                        <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>{block.hint}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: 1, background: S.border }} />

              {/* Actions */}
              <div>
                <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, padding: '0 4px' }}>
                  Then
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {BLOCKS.filter(b => b.cat === 'action').map(block => (
                    <button key={block.type}
                      draggable onDragStart={e => onDragStart(e, block.type)} onClick={() => addBlock(block.type)}
                      style={{
                        all: 'unset', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 8px', borderRadius: 8,
                        border: '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.07)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                    >
                      <span style={{ fontSize: 13, color: '#22c55e', flexShrink: 0 }}>{block.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: S.sans, fontSize: 12, fontWeight: 500, color: S.text1 }}>{block.label}</div>
                        <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>{block.hint}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Collapsed: icon-only strip */}
          {!blocksOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0' }}>
              {BLOCKS.map(block => (
                <button key={block.type}
                  draggable onDragStart={e => onDragStart(e, block.type)} onClick={() => addBlock(block.type)}
                  title={block.label}
                  style={{
                    all: 'unset', cursor: 'grab', width: 32, height: 32,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 8, fontSize: 14, border: '1px solid transparent',
                    color: block.cat === 'trigger' ? '#4d6aff' : '#22c55e',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = block.cat === 'trigger' ? 'rgba(26,46,255,0.1)' : 'rgba(34,197,94,0.1)'; e.currentTarget.style.borderColor = block.cat === 'trigger' ? 'rgba(26,46,255,0.2)' : 'rgba(34,197,94,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                >
                  {block.icon}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* ── CENTER: Canvas ── */}
        <div style={{
          height: 540, overflow: 'hidden',
          border: `1px solid ${S.border}`,
          borderRadius: 12,
          background: '#09090f',
        }}>
          <ReactFlow
            nodes={renderedNodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onDrop={onDrop} onDragOver={e => e.preventDefault()}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView deleteKeyCode={null}
            style={{ background: '#09090f' }}
          >
            <Background color="rgba(255,255,255,0.025)" gap={24} size={1} />
            <Controls style={{
              background: '#0b0b14',
              border: `1px solid ${S.border}`,
              borderRadius: 10,
              boxShadow: 'none',
            }} />

          </ReactFlow>
        </div>

        {/* ── RIGHT: Details panel ── */}
        {!isMobile && (
          <div className="neu-section" style={{ overflow: 'hidden', minWidth: 0 }}>
          {/* Header */}
          <button
            onClick={() => setDetailsOpen(o => !o)}
            style={{
              all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: detailsOpen ? '11px 14px' : '11px 10px',
              borderBottom: `1px solid ${S.border}`,
              transition: 'padding 0.2s',
            }}
          >
            {detailsOpen && (
              <span style={{ fontFamily: S.sans, fontSize: 12, fontWeight: 600, color: S.text2 }}>Details</span>
            )}
            <ChevronRight size={13} style={{
              color: S.text3,
              transform: detailsOpen ? 'none' : 'rotate(180deg)',
              transition: 'transform 0.2s',
              marginLeft: detailsOpen ? 0 : 'auto', marginRight: detailsOpen ? 0 : 'auto',
            }} />
          </button>

          {/* Expanded */}
          {detailsOpen && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Block inspector or placeholder */}
              {selectedNode ? (
                <BlockInspector node={selectedNode} deviceNames={deviceNames} onChange={updateSelectedConfig} />
              ) : (
                <div style={{
                  padding: '16px', textAlign: 'center',
                  background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10,
                }}>
                  <div style={{ fontSize: 20, opacity: 0.15, marginBottom: 6 }}>⬡</div>
                  <div style={{ fontFamily: S.sans, fontSize: 12, color: S.text3 }}>
                    Click a node to configure
                  </div>
                </div>
              )}

              <div style={{ height: 1, background: S.border }} />

              {/* Name */}
              <div>
                <label className="neu-label">Workflow name</label>
                <input className="neu-input" value={meta.name}
                  onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
                  placeholder="e.g. Night lights off"
                  style={{ fontSize: 13 }} />
              </div>

              {/* Advanced toggle */}
              <button
                onClick={() => setShowAdvanced(a => !a)}
                style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: S.sans, fontSize: 11, color: S.text3,
                }}
              >
                <Settings2 size={11} />
                {showAdvanced ? 'Hide options' : 'More options'}
              </button>

              {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="neu-label">Cooldown (s)</label>
                      <input type="number" min="0" className="neu-input" value={meta.cooldown_seconds}
                        onChange={e => setMeta(m => ({ ...m, cooldown_seconds: e.target.value }))}
                        style={{ fontSize: 13 }} />
                    </div>
                    <div style={{ paddingTop: 18 }}>
                      <label className="hw-toggle" title="Enabled">
                        <input type="checkbox" checked={meta.enabled}
                          onChange={e => setMeta(m => ({ ...m, enabled: e.target.checked }))} />
                        <div className="hw-toggle-track" />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Feedback */}
              {message && (
                <div className={msgType === 'success' ? 'neu-alert-success' : 'neu-alert-error'} style={{ fontSize: 11 }}>
                  {message}
                </div>
              )}

              {/* Save */}
              <button className="neu-btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', justifyContent: 'center', gap: 6 }}>
                <Save size={13} />
                {saving ? 'Saving…' : 'Save Workflow'}
              </button>
            </div>
          )}

          {/* Collapsed: just save icon */}
          {!detailsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0' }}>
              <button className="neu-btn-sm" onClick={handleSave} disabled={saving} title="Save workflow">
                <Save size={13} />
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── MOBILE MODALS ── */}
      {isMobile && mobileBlocksOpen && (
         <div className="wf-overlay" onClick={() => setMobileBlocksOpen(false)}>
           <div className="wf-sidebar-mobile" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontFamily: S.sans, fontSize: 16, fontWeight: 600, color: S.text1 }}>Add Block</span>
                <button onClick={() => setMobileBlocksOpen(false)} style={{ all: 'unset', color: S.text3, cursor: 'pointer' }}><X size={20}/></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {BLOCKS.map(block => (
                    <button key={block.type}
                      onClick={() => addBlock(block.type)}
                      style={{
                        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', borderRadius: 8,
                        background: block.cat === 'trigger' ? 'rgba(26,46,255,0.08)' : 'rgba(34,197,94,0.08)',
                        border: `1px solid ${block.cat === 'trigger' ? 'rgba(26,46,255,0.2)' : 'rgba(34,197,94,0.2)'}`,
                      }}
                    >
                      <span style={{ fontSize: 18, color: block.cat === 'trigger' ? '#4d6aff' : '#22c55e', flexShrink: 0 }}>{block.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: S.sans, fontSize: 14, fontWeight: 500, color: S.text1 }}>{block.label}</div>
                        <div style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>{block.hint}</div>
                      </div>
                    </button>
                ))}
              </div>
           </div>
         </div>
      )}

      {isMobile && selectedNodeId && selectedNode && (
         <div className="wf-overlay" onClick={() => setSelectedNodeId(null)}>
           <div className="wf-sidebar-mobile" onClick={e => e.stopPropagation()}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontFamily: S.sans, fontSize: 16, fontWeight: 600, color: S.text1 }}>Configure Node</span>
                <button onClick={() => setSelectedNodeId(null)} style={{ all: 'unset', color: S.text3, cursor: 'pointer' }}><X size={20}/></button>
              </div>
              <BlockInspector node={selectedNode} deviceNames={deviceNames} onChange={updateSelectedConfig} />
           </div>
         </div>
      )}

      {isMobile && mobileSaveOpen && (
         <div className="wf-overlay" onClick={() => setMobileSaveOpen(false)}>
           <div className="wf-sidebar-mobile" onClick={e => e.stopPropagation()}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontFamily: S.sans, fontSize: 16, fontWeight: 600, color: S.text1 }}>Save Workflow</span>
                <button onClick={() => setMobileSaveOpen(false)} style={{ all: 'unset', color: S.text3, cursor: 'pointer' }}><X size={20}/></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="neu-label">Workflow name</label>
                  <input className="neu-input" value={meta.name} onChange={e => setMeta(m => ({ ...m, name: e.target.value }))} placeholder="e.g. Night lights off" style={{ fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="neu-label">Cooldown (s)</label>
                    <input type="number" min="0" className="neu-input" value={meta.cooldown_seconds} onChange={e => setMeta(m => ({ ...m, cooldown_seconds: e.target.value }))} style={{ fontSize: 13 }} />
                  </div>
                  <div style={{ paddingTop: 18 }}>
                    <label className="hw-toggle" title="Enabled">
                      <input type="checkbox" checked={meta.enabled} onChange={e => setMeta(m => ({ ...m, enabled: e.target.checked }))} />
                      <div className="hw-toggle-track" />
                    </label>
                  </div>
                </div>
                {message && <div className={msgType === 'success' ? 'neu-alert-success' : 'neu-alert-error'} style={{ fontSize: 11 }}>{message}</div>}
                <button className="neu-btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                  <Save size={13} />
                  {saving ? 'Saving…' : 'Save Workflow'}
                </button>
              </div>
           </div>
         </div>
      )}

      {/* Floating Add and Save Buttons on Mobile */}
      {isMobile && !selectedNodeId && !mobileBlocksOpen && !mobileSaveOpen && (
        <>
          <button className="wf-add-btn" onClick={() => setMobileBlocksOpen(true)} style={{ bottom: 90 }}>
            <Plus size={24} />
          </button>
          <button className="wf-add-btn" onClick={() => setMobileSaveOpen(true)} style={{ background: '#22c55e', boxShadow: '0 4px 20px rgba(34,197,94,0.4)' }}>
            <Save size={20} />
          </button>
        </>
      )}

      {/* ── Workflow List ── */}
      <WorkflowList workflows={workflows} onChanged={refreshWorkflows} />
    </div>
  )
}

export default function WorkflowEditor(props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas {...props} />
    </ReactFlowProvider>
  )
}
