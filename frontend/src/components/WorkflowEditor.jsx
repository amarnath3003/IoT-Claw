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
import { createWorkflow, getState, getWorkflows } from '../api'
import WorkflowList from './WorkflowList'

const OPERATORS = ['>', '<', '>=', '<=', '==', '!=']

const BLOCKS = [
  { type: 'trigger.sensor', label: 'Sensor Trigger' },
  { type: 'trigger.chat', label: 'Chat Code Trigger' },
  { type: 'trigger.schedule', label: 'Schedule Trigger' },
  { type: 'action.device', label: 'Device Action' },
  { type: 'action.brightness', label: 'Brightness Action' },
  { type: 'action.log', label: 'Log Action' },
]

const DEFAULT_CONFIG = {
  'trigger.sensor': { device: '', operator: '>', value: '' },
  'trigger.chat': { code: '' },
  'trigger.schedule': { time: '07:30' },
  'action.device': { device: '', command: 'ON' },
  'action.brightness': { device: '', level: 50 },
  'action.log': { message: 'Workflow fired' },
}

const INITIAL_NODES = [
  {
    id: 'trigger-1',
    type: 'default',
    position: { x: 80, y: 120 },
    data: makeNodeData('trigger.sensor'),
  },
  {
    id: 'action-1',
    type: 'default',
    position: { x: 430, y: 120 },
    data: makeNodeData('action.device'),
  },
]

const INITIAL_EDGES = [{ id: 'trigger-1-action-1', source: 'trigger-1', target: 'action-1' }]

function makeNodeData(blockType) {
  const block = BLOCKS.find(item => item.type === blockType)
  return {
    blockType,
    label: block?.label || blockType,
    config: { ...(DEFAULT_CONFIG[blockType] || {}) },
  }
}

function buildNodeLabel(data) {
  const config = data.config || {}
  let detail = ''
  if (data.blockType === 'trigger.sensor') detail = `${config.device || 'device'} ${config.operator} ${config.value || 'value'}`
  if (data.blockType === 'trigger.chat') detail = config.code ? `"${config.code}"` : 'secret phrase'
  if (data.blockType === 'trigger.schedule') detail = config.time || 'HH:MM'
  if (data.blockType === 'action.device') detail = `${config.device || 'device'} -> ${config.command}`
  if (data.blockType === 'action.brightness') detail = `${config.device || 'device'} -> ${config.level}%`
  if (data.blockType === 'action.log') detail = config.message || 'log message'

  return (
    <div className="text-left">
      <div className="text-xs font-semibold text-gray-100">{data.label}</div>
      <div className="text-[11px] text-gray-400 mt-1 max-w-[160px] truncate">{detail}</div>
    </div>
  )
}

function toCanvasNode(node) {
  return {
    ...node,
    data: {
      ...node.data,
      label: buildNodeLabel(node.data),
    },
  }
}

function WorkflowCanvas({ deviceStates }) {
  const [devices, setDevices] = useState(deviceStates || {})
  const [workflows, setWorkflows] = useState([])
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES.map(toCanvasNode))
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [selectedNodeId, setSelectedNodeId] = useState('trigger-1')
  const [meta, setMeta] = useState({ name: '', description: '', cooldown_seconds: 60, enabled: true })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const { screenToFlowPosition } = useReactFlow()

  useEffect(() => {
    if (Object.keys(deviceStates || {}).length) setDevices(deviceStates)
  }, [deviceStates])

  useEffect(() => {
    getState().then(res => setDevices(res.data)).catch(() => {})
    refreshWorkflows()
  }, [])

  const deviceNames = Object.keys(devices)
  const selectedNode = nodes.find(node => node.id === selectedNodeId)

  const renderedNodes = useMemo(() => nodes, [nodes])

  const refreshWorkflows = () => {
    getWorkflows().then(res => setWorkflows(res.data)).catch(() => {})
  }

  const onConnect = useCallback(
    params => setEdges(current => addEdge({ ...params, animated: true }, current)),
    [setEdges],
  )

  const addBlock = (blockType, position = null) => {
    const isTrigger = blockType.startsWith('trigger.')
    setNodes(current => {
      const withoutExtraTrigger = isTrigger ? current.filter(node => !node.data.raw?.blockType?.startsWith('trigger.') && !node.data.blockType?.startsWith('trigger.')) : current
      const id = `${blockType.replace('.', '-')}-${Date.now()}`
      const rawData = makeNodeData(blockType)
      const node = {
        id,
        type: 'default',
        position: position || { x: isTrigger ? 80 : 430, y: 120 + current.length * 40 },
        data: {
          ...rawData,
          raw: rawData,
          label: buildNodeLabel(rawData),
        },
      }
      return [...withoutExtraTrigger, node]
    })
  }

  const onDragStart = (event, blockType) => {
    event.dataTransfer.setData('application/reactflow', blockType)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (event) => {
    event.preventDefault()
    const blockType = event.dataTransfer.getData('application/reactflow')
    if (!blockType) return
    addBlock(blockType, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const updateSelectedConfig = (field, value) => {
    setNodes(current => current.map(node => {
      if (node.id !== selectedNodeId) return node
      const rawData = node.data.raw || { ...node.data, label: undefined }
      const nextData = {
        ...rawData,
        config: { ...rawData.config, [field]: value },
      }
      return {
        ...node,
        data: {
          ...nextData,
          raw: nextData,
          label: buildNodeLabel(nextData),
        },
      }
    }))
  }

  const getRaw = node => node.data.raw || { ...node.data, label: undefined }

  const orderedActions = (triggerNode, actionNodes) => {
    const byId = new Map(actionNodes.map(node => [node.id, node]))
    const visited = new Set()
    const order = []
    const walk = (sourceId) => {
      edges.filter(edge => edge.source === sourceId).forEach(edge => {
        const action = byId.get(edge.target)
        if (action && !visited.has(action.id)) {
          visited.add(action.id)
          order.push(action)
          walk(action.id)
        }
      })
    }
    walk(triggerNode.id)
    return order
  }

  const actionPayload = (node) => {
    const data = getRaw(node)
    const config = data.config
    if (data.blockType === 'action.device') return { type: 'device', device: config.device, command: config.command }
    if (data.blockType === 'action.brightness') return { type: 'brightness', device: config.device, level: Number(config.level) }
    return { type: 'log', message: config.message }
  }

  const triggerPayload = (node) => {
    const data = getRaw(node)
    const config = data.config
    if (data.blockType === 'trigger.sensor') return { type: 'sensor', device: config.device, operator: config.operator, value: isNaN(Number(config.value)) ? config.value : Number(config.value) }
    if (data.blockType === 'trigger.chat') return { type: 'chat', code: config.code }
    return { type: 'schedule', time: config.time }
  }

  const validateAndBuild = () => {
    const rawNodes = nodes.map(node => ({ ...node, data: getRaw(node) }))
    const triggerNodes = rawNodes.filter(node => node.data.blockType.startsWith('trigger.'))
    const actionNodes = rawNodes.filter(node => node.data.blockType.startsWith('action.'))
    if (!meta.name.trim()) throw new Error('Workflow name is required.')
    if (triggerNodes.length !== 1) throw new Error('Add exactly one trigger block.')
    if (actionNodes.length === 0) throw new Error('Add at least one action block.')

    const trigger = triggerPayload(triggerNodes[0])
    if (trigger.type === 'sensor' && (!trigger.device || trigger.value === '')) throw new Error('Sensor trigger needs a device and value.')
    if (trigger.type === 'chat' && !trigger.code.trim()) throw new Error('Chat trigger needs a secret phrase.')
    if (trigger.type === 'schedule' && !/^\d{2}:\d{2}$/.test(trigger.time)) throw new Error('Schedule trigger time must be HH:MM.')

    const connectedActions = orderedActions(triggerNodes[0], actionNodes)
    if (connectedActions.length === 0) throw new Error('Connect the trigger block to at least one action block.')

    const actions = connectedActions.map(actionPayload)
    for (const action of actions) {
      if ((action.type === 'device' || action.type === 'brightness') && !action.device) {
        throw new Error('Device and brightness actions need a target device.')
      }
    }

    return {
      name: meta.name.trim(),
      description: meta.description.trim(),
      enabled: meta.enabled,
      cooldown_seconds: Number(meta.cooldown_seconds) || 60,
      trigger,
      actions,
      graph: {
        nodes: rawNodes.map(node => ({ id: node.id, blockType: node.data.blockType, position: node.position, config: node.data.config })),
        edges,
      },
    }
  }

  const handleSave = async () => {
    setMessage('')
    setSaving(true)
    try {
      const payload = validateAndBuild()
      const res = await createWorkflow(payload)
      setWorkflows(current => [...current, res.data])
      setMeta({ name: '', description: '', cooldown_seconds: 60, enabled: true })
      setMessage(`Saved workflow "${res.data.name}".`)
    } catch (err) {
      setMessage(err.message || 'Failed to save workflow.')
    } finally {
      setSaving(false)
    }
  }

  const resetCanvas = () => {
    setNodes(INITIAL_NODES.map(toCanvasNode))
    setEdges(INITIAL_EDGES)
    setSelectedNodeId('trigger-1')
  }

  const fieldClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors'
  const labelClass = 'block text-xs text-gray-400 mb-1'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr_320px] gap-4">
        <aside className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-white">Block Palette</h2>
            <p className="text-xs text-gray-500 mt-1">Drag blocks onto the canvas and connect them left to right.</p>
          </div>
          <div className="space-y-2">
            {BLOCKS.map(block => (
              <button
                key={block.type}
                draggable
                onDragStart={event => onDragStart(event, block.type)}
                onClick={() => addBlock(block.type)}
                className="w-full text-left bg-gray-900 border border-gray-700 hover:border-cyan-700 rounded-lg px-3 py-2 text-xs text-gray-300 transition-colors"
              >
                {block.label}
              </button>
            ))}
          </div>
          <button onClick={resetCanvas} className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded-lg text-xs">
            Reset Canvas
          </button>
        </aside>

        <section className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden h-[620px]">
          <ReactFlow
            nodes={renderedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={event => event.preventDefault()}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </section>

        <aside className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-white">Workflow Details</h2>
            <p className="text-xs text-gray-500 mt-1">Configure the selected block and save the graph.</p>
          </div>

          <div>
            <label className={labelClass}>Name</label>
            <input className={fieldClass} value={meta.name} onChange={e => setMeta(current => ({ ...current, name: e.target.value }))} placeholder="Secret light code" />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={fieldClass} rows={2} value={meta.description} onChange={e => setMeta(current => ({ ...current, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Cooldown</label>
              <input type="number" min="0" className={fieldClass} value={meta.cooldown_seconds} onChange={e => setMeta(current => ({ ...current, cooldown_seconds: e.target.value }))} />
            </div>
            <label className="flex items-end gap-2 text-xs text-gray-400 pb-2">
              <input type="checkbox" checked={meta.enabled} onChange={e => setMeta(current => ({ ...current, enabled: e.target.checked }))} />
              Enabled
            </label>
          </div>

          {selectedNode ? (
            <BlockInspector
              node={selectedNode}
              deviceNames={deviceNames}
              fieldClass={fieldClass}
              labelClass={labelClass}
              onChange={updateSelectedConfig}
            />
          ) : (
            <p className="text-xs text-gray-500">Select a block to edit it.</p>
          )}

          {message && <p className={`text-xs ${message.startsWith('Saved') ? 'text-green-400' : 'text-red-400'}`}>{message}</p>}
          <button onClick={handleSave} disabled={saving} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Saving...' : 'Save Workflow'}
          </button>
        </aside>
      </div>

      <WorkflowList workflows={workflows} onChanged={refreshWorkflows} />
    </div>
  )
}

function BlockInspector({ node, deviceNames, fieldClass, labelClass, onChange }) {
  const data = node.data.raw || node.data
  const config = data.config || {}

  return (
    <div className="border-t border-gray-700 pt-4 space-y-3">
      <h3 className="text-xs font-medium text-cyan-400">{data.label}</h3>

      {data.blockType === 'trigger.sensor' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} fieldClass={fieldClass} labelClass={labelClass} onChange={value => onChange('device', value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Operator</label>
              <select className={fieldClass} value={config.operator} onChange={e => onChange('operator', e.target.value)}>
                {OPERATORS.map(operator => <option key={operator} value={operator}>{operator}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Value</label>
              <input className={fieldClass} value={config.value} onChange={e => onChange('value', e.target.value)} />
            </div>
          </div>
        </>
      )}

      {data.blockType === 'trigger.chat' && (
        <div>
          <label className={labelClass}>Secret phrase</label>
          <input className={fieldClass} value={config.code} onChange={e => onChange('code', e.target.value)} placeholder="open sesame" />
        </div>
      )}

      {data.blockType === 'trigger.schedule' && (
        <div>
          <label className={labelClass}>Daily time</label>
          <input type="time" className={fieldClass} value={config.time} onChange={e => onChange('time', e.target.value)} />
        </div>
      )}

      {data.blockType === 'action.device' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} fieldClass={fieldClass} labelClass={labelClass} onChange={value => onChange('device', value)} />
          <div>
            <label className={labelClass}>Command</label>
            <select className={fieldClass} value={config.command} onChange={e => onChange('command', e.target.value)}>
              <option value="ON">Turn ON</option>
              <option value="OFF">Turn OFF</option>
            </select>
          </div>
        </>
      )}

      {data.blockType === 'action.brightness' && (
        <>
          <DeviceSelect value={config.device} deviceNames={deviceNames} fieldClass={fieldClass} labelClass={labelClass} onChange={value => onChange('device', value)} />
          <div>
            <label className={labelClass}>Brightness</label>
            <input type="number" min="0" max="100" className={fieldClass} value={config.level} onChange={e => onChange('level', e.target.value)} />
          </div>
        </>
      )}

      {data.blockType === 'action.log' && (
        <div>
          <label className={labelClass}>Log message</label>
          <textarea rows={3} className={fieldClass} value={config.message} onChange={e => onChange('message', e.target.value)} />
        </div>
      )}
    </div>
  )
}

function DeviceSelect({ value, deviceNames, fieldClass, labelClass, onChange }) {
  return (
    <div>
      <label className={labelClass}>Device</label>
      <select className={fieldClass} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Select device</option>
        {deviceNames.map(name => <option key={name} value={name}>{name}</option>)}
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
