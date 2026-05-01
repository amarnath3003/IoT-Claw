import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createWorkflow, deleteWorkflow, getState, getWorkflows } from '../api'
import WorkflowList from './WorkflowList'

const OPERATORS = ['>', '<', '>=', '<=', '==', '!=']

const BLOCKS = [
  { type: 'trigger.sensor',        label: 'Sensor Trigger',   icon: '◈', cat: 'trigger' },
  { type: 'trigger.chat',          label: 'Chat Code',        icon: '⌘', cat: 'trigger' },
  { type: 'trigger.schedule',      label: 'Schedule',         icon: '⏱', cat: 'trigger' },
  { type: 'trigger.device_event',  label: 'Device Event',     icon: '⚡', cat: 'trigger' },
  { type: 'action.device',         label: 'Device Action',    icon: '⏻', cat: 'action'  },
  { type: 'action.brightness',     label: 'Brightness',       icon: '◑', cat: 'action'  },
  { type: 'action.camera_monitor', label: 'Camera CV',        icon: '⊙', cat: 'action'  },
  { type: 'action.log',            label: 'Log Message',      icon: '⊟', cat: 'action'  },
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
  return {
    blockType,
    label: block?.label || blockType,
    config: { ...(DEFAULT_CONFIG[blockType] || {}) },
  }
}

function buildNodeLabel(data) {
  const c = data.config || {}
  const block = BLOCKS.find(b => b.type === data.blockType)
  const icon = block?.icon || '⬡'
  let detail = ''
  if (data.blockType === 'trigger.sensor')        detail = `${c.device || 'device'} ${c.operator} ${c.value || 'val'}`
  if (data.blockType === 'trigger.chat')          detail = c.code ? `"${c.code}"` : 'secret phrase'
  if (data.blockType === 'trigger.schedule')      detail = c.time || 'HH:MM'
  if (data.blockType === 'trigger.device_event')  detail = `${c.device || 'device'} goes ${c.event || 'offline'}`
  if (data.blockType === 'action.device')         detail = `${c.device || 'device'} → ${c.command}`
  if (data.blockType === 'action.brightness')     detail = `${c.device || 'device'} → ${c.level}%`
  if (data.blockType === 'action.camera_monitor') detail = `${c.device || 'camera'} CV ${c.command}`
  if (data.blockType === 'action.log')            detail = c.message || 'log…'

  const isTrigger = data.blockType.startsWith('trigger.')
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 10,
      background: isTrigger ? 'rgba(26,77,255,0.10)' : 'rgba(34,197,94,0.08)',
      border: `1px solid ${isTrigger ? 'rgba(26,77,255,0.30)' : 'rgba(34,197,94,0.25)'}`,
      minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: isTrigger ? 'var(--accent)' : '#22c55e' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: isTrigger ? 'var(--accent)' : '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{data.label}</span>
      </div>
      <div style={{ fontSize: 10, color: '#8a8f98', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{detail}</div>
    </div>
  )
}

function toCanvasNode(node) {
  return { ...node, data: { ...node.data, label: buildNodeLabel(node.data) } }
}

const INITIAL_NODES = [
  { id: 'trigger-1', type: 'default', position: { x: 80,  y: 120 }, data: makeNodeData('trigger.sensor') },
  { id: 'action-1',  type: 'default', position: { x: 430, y: 120 }, data: makeNodeData('action.device')  },
]
const INITIAL_EDGES = [{ id: 'e0', source: 'trigger-1', target: 'action-1', animated: true }]

/* ─────────────────────────────────────────────── */
function WorkflowCanvas({ deviceStates }) {
  const [devices, setDevices]           = useState(deviceStates || {})
  const [workflows, setWorkflows]       = useState([])
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES.map(toCanvasNode))
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [selectedNodeId, setSelectedNodeId] = useState('trigger-1')
  const [meta, setMeta]                 = useState({ name: '', description: '', cooldown_seconds: 60, enabled: true })
  const [message, setMessage]           = useState('')
  const [msgType, setMsgType]           = useState('error')
  const [saving, setSaving]             = useState(false)
  const [running, setRunning]           = useState(false)
  const { screenToFlowPosition }        = useReactFlow()

  useEffect(() => { if (Object.keys(deviceStates || {}).length) setDevices(deviceStates) }, [deviceStates])
  useEffect(() => {
    getState().then(r => setDevices(r.data)).catch(() => {})
    refreshWorkflows()
  }, [])

  const deviceNames   = Object.keys(devices)
  const selectedNode  = nodes.find(n => n.id === selectedNodeId)
  const renderedNodes = useMemo(() => nodes, [nodes])

  const refreshWorkflows = () => getWorkflows().then(r => setWorkflows(r.data)).catch(() => {})

  const onConnect = useCallback(
    params => setEdges(cur => addEdge({ ...params, animated: true, style: { stroke: 'var(--accent)', strokeWidth: 2 } }, cur)),
    [setEdges],
  )

  const addBlock = (blockType, position = null) => {
    const isTrigger = blockType.startsWith('trigger.')
    setNodes(cur => {
      const filtered = isTrigger
        ? cur.filter(n => !(n.data.raw?.blockType || n.data.blockType || '').startsWith('trigger.'))
        : cur
      const id      = `${blockType.replace('.', '-')}-${Date.now()}`
      const rawData = makeNodeData(blockType)
      const node    = {
        id,
        type: 'default',
        position: position || { x: isTrigger ? 80 : 430, y: 120 + cur.length * 50 },
        data: { ...rawData, raw: rawData, label: buildNodeLabel(rawData) },
      }
      return [...filtered, node]
    })
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
      const rawData = node.data.raw || { ...node.data, label: undefined }
      const nextData = { ...rawData, config: { ...rawData.config, [field]: value } }
      return { ...node, data: { ...nextData, raw: nextData, label: buildNodeLabel(nextData) } }
    }))
  }

  const getRaw = node => node.data.raw || { ...node.data, label: undefined }

  const orderedActions = (triggerNode, actionNodes) => {
    const byId = new Map(actionNodes.map(n => [n.id, n]))
    const visited = new Set()
    const order = []
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
    if (!meta.name.trim())          throw new Error('Workflow name is required.')
    if (triggerNodes.length !== 1)  throw new Error('Add exactly one trigger block.')
    if (actionNodes.length === 0)   throw new Error('Add at least one action block.')

    const trigger = triggerPayload(triggerNodes[0])
    if (trigger.type === 'sensor'       && (!trigger.device || trigger.value === '')) throw new Error('Sensor trigger needs a device and value.')
    if (trigger.type === 'chat'         && !trigger.code.trim()) throw new Error('Chat trigger needs a secret phrase.')
    if (trigger.type === 'schedule'     && !/^\d{2}:\d{2}$/.test(trigger.time)) throw new Error('Schedule time must be HH:MM.')
    if (trigger.type === 'device_event' && !trigger.device) throw new Error('Device Event trigger needs a device.')

    const connected = orderedActions(triggerNodes[0], actionNodes)
    if (connected.length === 0) throw new Error('Connect the trigger to at least one action block.')

    const actions = connected.map(actionPayload)
    for (const a of actions) {
      if (['device', 'brightness', 'camera_monitor'].includes(a.type) && !a.device)
        throw new Error('Device, brightness, and camera actions need a target device.')
    }

    return {
      name: meta.name.trim(),
      description: meta.description.trim(),
      enabled: meta.enabled,
      cooldown_seconds: Number(meta.cooldown_seconds) || 60,
      trigger,
      actions,
      graph: {
        nodes: rawNodes.map(n => ({ id: n.id, blockType: n.data.blockType, position: n.position, config: n.data.config })),
        edges,
      },
    }
  }

  // Export workflow as JSON file
  const handleExport = () => {
    try {
      const payload = validateAndBuild()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${payload.name.replace(/\s+/g, '_')}_workflow.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setMessage(err.message)
      setMsgType('error')
    }
  }

  // Import workflow JSON to pre-fill the form
  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wf = JSON.parse(ev.target.result)
        if (wf.name) setMeta(m => ({ ...m, name: wf.name, description: wf.description || '', cooldown_seconds: wf.cooldown_seconds || 60, enabled: wf.enabled ?? true }))
        setMessage(`Imported "${wf.name}" — configure nodes and save.`)
        setMsgType('success')
      } catch { setMessage('Invalid JSON file.'); setMsgType('error') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Test-run the last saved workflow that matches this name
  const handleTestRun = async () => {
    const match = workflows.find(w => w.name === meta.name.trim())
    if (!match) { setMessage('Save the workflow first, then test-run it.'); setMsgType('error'); return }
    setRunning(true)
    try {
      const res = await fetch(`/workflows/${match.id}/run`, { method: 'POST' })
      const data = await res.json()
      setMessage(`▶ Test run complete: ${JSON.stringify(data.result || 'ok')}`)
      setMsgType('success')
      refreshWorkflows()
    } catch (err) { setMessage(`Run failed: ${err.message}`); setMsgType('error') }
    finally { setRunning(false) }
  }

  // Delete selected node with Backspace/Delete key
  const onKeyDown = useCallback((e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      setNodes(cur => cur.filter(n => n.id !== selectedNodeId))
      setEdges(cur => cur.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
      setSelectedNodeId(null)
    }
  }, [selectedNodeId, setNodes, setEdges])

  const handleSave = async () => {
    setMessage('')
    setSaving(true)
    try {
      const payload = validateAndBuild()
      const res     = await createWorkflow(payload)
      setWorkflows(cur => [...cur, res.data])
      setMeta({ name: '', description: '', cooldown_seconds: 60, enabled: true })
      setMessage(`Workflow "${res.data.name}" saved successfully.`)
      setMsgType('success')
    } catch (err) {
      setMessage(err.message || 'Failed to save workflow.')
      setMsgType('error')
    } finally { setSaving(false) }
  }

  const resetCanvas = () => {
    setNodes(INITIAL_NODES.map(toCanvasNode))
    setEdges(INITIAL_EDGES)
    setSelectedNodeId('trigger-1')
    setMessage('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} onKeyDown={onKeyDown} tabIndex={-1}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="led-pulse" />
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Visual Workflow Builder
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="neu-badge">{workflows.length} saved</span>
          <span className="neu-badge" style={{ fontSize: 10, color: 'var(--text-muted)' }}>Del key removes selected node</span>
          {/* Import */}
          <label className="neu-btn" style={{ padding: '6px 14px', fontSize: 11, cursor: 'pointer' }} title="Import workflow JSON">
            ⬆ Import
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button id="export-workflow-btn" onClick={handleExport} className="neu-btn" style={{ padding: '6px 14px', fontSize: 11 }} title="Export as JSON">
            ⬇ Export
          </button>
          <button id="test-run-btn" onClick={handleTestRun} disabled={running} className="neu-btn" style={{ padding: '6px 14px', fontSize: 11, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }} title="Run the saved workflow now">
            {running ? '⏳' : '▶ Test Run'}
          </button>
          <button id="reset-canvas-btn" onClick={resetCanvas} className="neu-btn" style={{ padding: '6px 14px', fontSize: 11 }}>
            ↺ Reset
          </button>
        </div>
      </div>

      {/* ── Three-column builder ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT: Block Palette ── */}
        <div className="neu-section">
          <div className="neu-section-header">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Block Palette
            </span>
            <span className="neu-badge">drag / click</span>
          </div>

          <div className="neu-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Triggers */}
            <div>
              <div className="neu-chunk-header" style={{ marginBottom: 8 }}>Triggers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {BLOCKS.filter(b => b.cat === 'trigger').map(block => (
                  <button
                    key={block.type}
                    id={`palette-${block.type}`}
                    draggable
                    onDragStart={e => onDragStart(e, block.type)}
                    onClick={() => addBlock(block.type)}
                    className="neu-btn"
                    style={{
                      justifyContent: 'flex-start', padding: '8px 12px', gap: 8, fontSize: 12, textAlign: 'left',
                      borderLeft: '3px solid var(--accent)',
                    }}
                  >
                    <span style={{ color: 'var(--accent)', fontSize: 14 }}>{block.icon}</span>
                    <span style={{ color: 'var(--text-main)' }}>{block.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <hr className="neu-divider" />

            {/* Actions */}
            <div>
              <div className="neu-chunk-header" style={{ marginBottom: 8 }}>Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {BLOCKS.filter(b => b.cat === 'action').map(block => (
                  <button
                    key={block.type}
                    id={`palette-${block.type}`}
                    draggable
                    onDragStart={e => onDragStart(e, block.type)}
                    onClick={() => addBlock(block.type)}
                    className="neu-btn"
                    style={{
                      justifyContent: 'flex-start', padding: '8px 12px', gap: 8, fontSize: 12, textAlign: 'left',
                      borderLeft: '3px solid #22c55e',
                    }}
                  >
                    <span style={{ color: '#22c55e', fontSize: 14 }}>{block.icon}</span>
                    <span style={{ color: 'var(--text-main)' }}>{block.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="neu-alert-info" style={{ fontSize: 11 }}>
              Drag onto canvas or click to add. Connect trigger → action.
            </div>
          </div>
        </div>

        {/* ── CENTER: ReactFlow Canvas ── */}
        <div style={{
          borderRadius: 20,
          overflow: 'hidden',
          height: 620,
          boxShadow: 'var(--sh-deep)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <ReactFlow
            nodes={renderedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            deleteKeyCode={null}
            style={{ background: '#0d0f11' }}
          >
            <Background color="#2a2f34" gap={24} size={1} />
            <Controls style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              boxShadow: 'var(--sh-flat)',
            }} />
            <MiniMap
              nodeColor={n => {
                const bt = n.data?.raw?.blockType || n.data?.blockType || ''
                return bt.startsWith('trigger.') ? '#6366f1' : '#22c55e'
              }}
              maskColor="rgba(0,0,0,0.6)"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}
            />
          </ReactFlow>
        </div>

        {/* ── RIGHT: Inspector + Meta ── */}
        <div className="neu-section">
          <div className="neu-section-header">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Workflow Details
            </span>
            {selectedNode && (
              <span className="neu-badge neu-badge-accent" style={{ fontSize: 10 }}>
                {(selectedNode.data.raw?.blockType || selectedNode.data.blockType || '').split('.')[1] || 'block'}
              </span>
            )}
          </div>

          <div className="neu-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Workflow meta */}
            <div>
              <label className="neu-label" htmlFor="wf-name">Name</label>
              <input id="wf-name" className="neu-input" value={meta.name}
                onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
                placeholder="Secret light code" />
            </div>

            <div>
              <label className="neu-label" htmlFor="wf-desc">Description</label>
              <textarea id="wf-desc" className="neu-input" rows={2} value={meta.description}
                onChange={e => setMeta(m => ({ ...m, description: e.target.value }))}
                style={{ resize: 'none', color: 'var(--text-main)', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label className="neu-label" htmlFor="wf-cooldown">Cooldown (s)</label>
                <input id="wf-cooldown" type="number" min="0" className="neu-input" value={meta.cooldown_seconds}
                  onChange={e => setMeta(m => ({ ...m, cooldown_seconds: e.target.value }))} />
              </div>
              <div style={{ paddingBottom: 2 }}>
                <label className="hw-toggle" title="Enable / disable workflow">
                  <input type="checkbox" checked={meta.enabled}
                    onChange={e => setMeta(m => ({ ...m, enabled: e.target.checked }))} />
                  <div className="hw-toggle-track" />
                </label>
              </div>
            </div>

            <hr className="neu-divider" />

            {/* Block inspector */}
            {selectedNode
              ? <BlockInspector node={selectedNode} deviceNames={deviceNames} onChange={updateSelectedConfig} />
              : <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Click a node on the canvas to configure it.</p>
            }

            <hr className="neu-divider" />

            {message && (
              <div className={msgType === 'success' ? 'neu-alert-success' : 'neu-alert-error'}>
                {message}
              </div>
            )}

            <button
              id="save-workflow-btn"
              onClick={handleSave}
              disabled={saving}
              className="neu-btn-primary"
              style={{ padding: '12px 0', width: '100%', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
            >
              {saving ? 'Saving…' : '⊞ Save Workflow'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Workflow List ── */}
      <WorkflowList workflows={workflows} onChanged={refreshWorkflows} />
    </div>
  )
}

/* ─────────────────────────────────────────────── */
function BlockInspector({ node, deviceNames, onChange }) {
  const data   = node.data.raw || node.data
  const config = data.config || {}
  const block  = BLOCKS.find(b => b.type === data.blockType)
  const isTrigger = data.blockType.startsWith('trigger.')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16, color: isTrigger ? 'var(--accent)' : '#22c55e' }}>{block?.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: isTrigger ? 'var(--accent)' : '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {data.label}
        </span>
      </div>

      {data.blockType === 'trigger.sensor' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} label="Sensor device" onChange={v => onChange('device', v)} />
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
        </>
      )}

      {data.blockType === 'trigger.chat' && (
        <div>
          <label className="neu-label">Secret phrase</label>
          <input className="neu-input" value={config.code} onChange={e => onChange('code', e.target.value)} placeholder="open sesame" />
        </div>
      )}

      {data.blockType === 'trigger.device_event' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} label="Watch device" onChange={v => onChange('device', v)} />
          <div>
            <label className="neu-label">Event</label>
            <select className="neu-input" value={config.event || 'offline'} onChange={e => onChange('event', e.target.value)}>
              <option value="offline">Goes offline (heartbeat lost)</option>
              <option value="online">Comes back online</option>
            </select>
          </div>
          <div className="neu-alert-info" style={{ fontSize: 11 }}>
            ⚡ Fires when the device's heartbeat is missed or restored.
          </div>
        </>
      )}

      {data.blockType === 'trigger.schedule' && (
        <div>
          <label className="neu-label">Daily time</label>
          <input type="time" className="neu-input" value={config.time} onChange={e => onChange('time', e.target.value)} />
        </div>
      )}

      {data.blockType === 'action.device' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} label="Target device" onChange={v => onChange('device', v)} />
          <div>
            <label className="neu-label">Command</label>
            <select className="neu-input" value={config.command} onChange={e => onChange('command', e.target.value)}>
              <option value="ON">Turn ON</option>
              <option value="OFF">Turn OFF</option>
            </select>
          </div>
        </>
      )}

      {data.blockType === 'action.brightness' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} label="Target device" onChange={v => onChange('device', v)} />
          <div>
            <label className="neu-label">Brightness level (0–100)</label>
            <input type="number" min="0" max="100" className="neu-input" value={config.level} onChange={e => onChange('level', e.target.value)} />
            <div className="neu-progress-track" style={{ marginTop: 8 }}>
              <div className="neu-progress-fill" style={{ width: `${config.level}%` }} />
            </div>
          </div>
        </>
      )}

      {data.blockType === 'action.camera_monitor' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} label="Camera device" onChange={v => onChange('device', v)} />
          <div>
            <label className="neu-label">CV command</label>
            <select className="neu-input" value={config.command} onChange={e => onChange('command', e.target.value)}>
              <option value="ON">Start detecting (faces/bodies)</option>
              <option value="OFF">Stop camera monitor</option>
            </select>
          </div>
          <div className="neu-alert-warn" style={{ fontSize: 11 }}>
            Sends a Telegram alert on detection.
          </div>
        </>
      )}

      {data.blockType === 'action.log' && (
        <div>
          <label className="neu-label">Log message</label>
          <textarea rows={3} className="neu-input"
            value={config.message}
            onChange={e => onChange('message', e.target.value)}
            style={{ resize: 'none', color: 'var(--text-main)', fontFamily: 'inherit' }} />
        </div>
      )}
    </div>
  )
}

function DeviceSelect({ value, deviceNames, label = 'Device', onChange }) {
  return (
    <div>
      <label className="neu-label">{label}</label>
      <select className="neu-input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— select device —</option>
        {deviceNames.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
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
