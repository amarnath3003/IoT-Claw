import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Check, X, Power, PowerOff,
  ChevronDown, ChevronRight, Pencil, Layers,
} from 'lucide-react'
import {
  getGroups, createGroup, updateGroup, deleteGroup,
  addDeviceToGroup, removeDeviceFromGroup, commandGroup,
} from '../api'

/* ── Design tokens (match rest of app) ── */
const C = {
  panel:  'rgba(255,255,255,0.03)',
  depth:  'rgba(255,255,255,0.02)',
  border: 'rgba(255,255,255,0.07)',
  text1:  'rgba(255,255,255,0.82)',
  text2:  'rgba(255,255,255,0.50)',
  text3:  'rgba(255,255,255,0.25)',
  accent: '#1a2eff',
  blue:   '#6b8cff',
  green:  '#22c55e',
  red:    '#ef4444',
  sans:   "'Outfit', sans-serif",
  mono:   "'JetBrains Mono', ui-monospace, monospace",
}

const PRESET_COLORS = [
  '#6b8cff', '#a78bfa', '#f59e0b', '#22c55e',
  '#ef4444', '#ec4899', '#06b6d4', '#f97316',
]

const PRESET_ICONS = [
  '⬡', '◉', '◎', '◈', '⊙', '⬢', '◐', '⏻',
  '◭', '▣', '◫', '⚡', '◑', '⬛', '◧', '⬤',
]

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid rgba(255,255,255,0.07)`,
  borderRadius: 8, padding: '7px 10px',
  fontFamily: "'Outfit', sans-serif",
  fontSize: '0.8rem', color: 'rgba(255,255,255,0.82)',
  outline: 'none',
}

/* Derive a friendly label from snake_case device name */
function deviceLabel(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/* ── Mini ColorPicker ── */
function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{
            all: 'unset', cursor: 'pointer',
            width: 22, height: 22, borderRadius: 6,
            background: c,
            outline: value === c ? `2px solid white` : '2px solid transparent',
            outlineOffset: 2,
            transition: 'outline 0.1s',
          }}
        />
      ))}
    </div>
  )
}

/* ── Mini IconPicker ── */
function IconPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {PRESET_ICONS.map(ic => (
        <button
          key={ic}
          type="button"
          onClick={() => onChange(ic)}
          style={{
            all: 'unset', cursor: 'pointer',
            width: 32, height: 28, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
            background: value === ic ? 'rgba(26,46,255,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${value === ic ? 'rgba(26,46,255,0.5)' : 'rgba(255,255,255,0.07)'}`,
            transition: 'all 0.12s',
          }}
        >
          {ic}
        </button>
      ))}
    </div>
  )
}

/* ── New Group Form (inline) ── */
function NewGroupForm({ onCreated, onCancel }) {
  const [name, setName]   = useState('')
  const [color, setColor] = useState('#6b8cff')
  const [icon, setIcon]   = useState('⬡')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setErr('Name is required.')
    setBusy(true); setErr('')
    try {
      const res = await createGroup(name.trim(), color, icon)
      onCreated(res.data)
    } catch {
      setErr('Failed to create group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: C.panel, border: `1px solid rgba(26,46,255,0.3)`,
        borderRadius: 12, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ fontFamily: C.sans, fontSize: '0.78rem', fontWeight: 700, color: C.text1 }}>
        New Group
      </div>

      <input
        autoFocus
        style={inputStyle}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Group name (e.g. Living Room)"
      />

      <div>
        <div style={{ fontFamily: C.sans, fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.text3, marginBottom: 6 }}>Color</div>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div>
        <div style={{ fontFamily: C.sans, fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.text3, marginBottom: 6 }}>Icon</div>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      {err && (
        <div style={{ fontFamily: C.sans, fontSize: '0.72rem', color: C.red }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            all: 'unset', cursor: busy ? 'not-allowed' : 'pointer',
            flex: 1, padding: '8px 0', borderRadius: 8, textAlign: 'center',
            fontFamily: C.sans, fontSize: '0.75rem', fontWeight: 700,
            background: 'rgba(26,46,255,0.15)',
            border: '1px solid rgba(26,46,255,0.4)',
            color: C.blue,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            all: 'unset', cursor: 'pointer',
            padding: '8px 14px', borderRadius: 8,
            fontFamily: C.sans, fontSize: '0.75rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.border}`,
            color: C.text2,
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/* ── Edit Group inline form ── */
function EditGroupForm({ group, onSaved, onCancel }) {
  const [name, setName]   = useState(group.name)
  const [color, setColor] = useState(group.color)
  const [icon, setIcon]   = useState(group.icon)
  const [busy, setBusy]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await updateGroup(group.id, { name: name.trim(), color, icon })
      onSaved(res.data)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
      <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Group name" />
      <div>
        <div style={{ fontFamily: C.sans, fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.text3, marginBottom: 5 }}>Color</div>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div>
        <div style={{ fontFamily: C.sans, fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.text3, marginBottom: 5 }}>Icon</div>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" disabled={busy} style={{
          all: 'unset', cursor: 'pointer', padding: '6px 14px', borderRadius: 7,
          fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 700,
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: C.green,
          opacity: busy ? 0.6 : 1,
        }}>
          <Check size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Save
        </button>
        <button type="button" onClick={onCancel} style={{
          all: 'unset', cursor: 'pointer', padding: '6px 14px', borderRadius: 7,
          fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 600,
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text2,
        }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/* ── Single Group Card ── */
function GroupCard({ group, allDevices, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing]   = useState(false)
  const [cmdBusy, setCmdBusy]   = useState(false)
  const [addOpen, setAddOpen]   = useState(false)
  const [addSearch, setAddSearch] = useState('')

  const memberNames = group.devices || []
  const memberCount = memberNames.length

  // Devices not yet in this group
  const allDeviceNames = Object.keys(allDevices || {})
  const availableToAdd = allDeviceNames.filter(n => !memberNames.includes(n))
  const filteredAvailable = addSearch.trim()
    ? availableToAdd.filter(n => n.toLowerCase().includes(addSearch.toLowerCase()))
    : availableToAdd

  const handleDelete = async () => {
    if (!confirm(`Delete group "${group.name}"? Devices will NOT be removed.`)) return
    try { await deleteGroup(group.id); onRefresh() }
    catch { /* ignore */ }
  }

  const handleCommand = async (cmd) => {
    if (memberCount === 0) return
    setCmdBusy(true)
    try { await commandGroup(group.id, cmd); onRefresh() }
    finally { setCmdBusy(false) }
  }

  const handleAddDevice = async (deviceName) => {
    try { await addDeviceToGroup(group.id, deviceName); onRefresh() }
    catch { /* ignore */ }
  }

  const handleRemoveDevice = async (deviceName) => {
    try { await removeDeviceFromGroup(group.id, deviceName); onRefresh() }
    catch { /* ignore */ }
  }

  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${group.color}`,
      borderRadius: 12, overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header row */}
      <div
        style={{
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        }}
        onClick={() => { if (!editing) setExpanded(v => !v) }}
      >
        {/* Icon bubble */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem',
          background: `${group.color}18`,
          border: `1px solid ${group.color}40`,
        }}>
          {group.icon}
        </div>

        {/* Name + count */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 700, color: C.text1 }}>
            {group.name}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.text3, marginTop: 1 }}>
            {memberCount === 0 ? 'No devices' : `${memberCount} device${memberCount !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          {/* All ON */}
          <button
            title="Turn all ON"
            disabled={cmdBusy || memberCount === 0}
            onClick={() => handleCommand('ON')}
            style={{
              all: 'unset', cursor: memberCount === 0 ? 'not-allowed' : 'pointer',
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
              color: C.green, opacity: memberCount === 0 ? 0.3 : 1, transition: 'all 0.15s',
            }}
          >
            <Power size={13} />
          </button>
          {/* All OFF */}
          <button
            title="Turn all OFF"
            disabled={cmdBusy || memberCount === 0}
            onClick={() => handleCommand('OFF')}
            style={{
              all: 'unset', cursor: memberCount === 0 ? 'not-allowed' : 'pointer',
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              color: C.text3, opacity: memberCount === 0 ? 0.3 : 1, transition: 'all 0.15s',
            }}
          >
            <PowerOff size={13} />
          </button>
          {/* Edit */}
          <button
            title="Edit group"
            onClick={() => { setEditing(v => !v); setExpanded(true) }}
            style={{
              all: 'unset', cursor: 'pointer',
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: editing ? 'rgba(26,46,255,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${editing ? 'rgba(26,46,255,0.35)' : C.border}`,
              color: editing ? C.blue : C.text3,
              transition: 'all 0.15s',
            }}
          >
            <Pencil size={12} />
          </button>
          {/* Delete */}
          <button
            title="Delete group"
            onClick={handleDelete}
            style={{
              all: 'unset', cursor: 'pointer',
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              color: C.text3, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = C.text3; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = C.border }}
          >
            <Trash2 size={12} />
          </button>

          {/* Expand chevron */}
          <div style={{ color: C.text3, display: 'flex', alignItems: 'center' }}>
            {expanded
              ? <ChevronDown size={14} />
              : <ChevronRight size={14} />
            }
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Edit form */}
          {editing && (
            <EditGroupForm
              group={group}
              onSaved={() => { setEditing(false); onRefresh() }}
              onCancel={() => setEditing(false)}
            />
          )}

          {/* Device list */}
          {!editing && (
            <>
              {memberNames.length === 0 ? (
                <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.text3, textAlign: 'center', padding: '12px 0' }}>
                  No devices in this group yet. Add some below.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {memberNames.map(dName => {
                    const dev = allDevices?.[dName]
                    const isOn = dev ? String(dev.status).toUpperCase() === 'ON' : false
                    return (
                      <div key={dName} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 10px', borderRadius: 8,
                        background: C.depth, border: `1px solid ${C.border}`,
                      }}>
                        {/* Status dot */}
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: isOn ? C.green : 'rgba(255,255,255,0.15)',
                          boxShadow: isOn ? `0 0 5px ${C.green}` : 'none',
                        }} />
                        <span style={{ flex: 1, fontFamily: C.sans, fontSize: '0.8rem', color: C.text1 }}>
                          {deviceLabel(dName)}
                        </span>
                        {dev?.location && (
                          <span style={{ fontFamily: C.sans, fontSize: '0.68rem', color: C.text3 }}>
                            {dev.location}
                          </span>
                        )}
                        <button
                          onClick={() => handleRemoveDevice(dName)}
                          title="Remove from group"
                          style={{
                            all: 'unset', cursor: 'pointer',
                            width: 22, height: 22, borderRadius: 5,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: C.text3, transition: 'all 0.12s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.text3; e.currentTarget.style.background = 'transparent' }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add device section */}
              <div>
                <button
                  type="button"
                  onClick={() => setAddOpen(v => !v)}
                  style={{
                    all: 'unset', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 7,
                    fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 600,
                    background: addOpen ? 'rgba(26,46,255,0.1)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${addOpen ? 'rgba(26,46,255,0.3)' : C.border}`,
                    color: addOpen ? C.blue : C.text2,
                    transition: 'all 0.15s',
                  }}
                >
                  <Plus size={12} />
                  Add device
                </button>

                {addOpen && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      style={{ ...inputStyle, fontSize: '0.75rem' }}
                      placeholder="Search devices to add…"
                      value={addSearch}
                      onChange={e => setAddSearch(e.target.value)}
                    />
                    {filteredAvailable.length === 0 ? (
                      <div style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.text3, padding: '4px 2px' }}>
                        {availableToAdd.length === 0 ? 'All devices are already in this group.' : 'No match.'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                        {filteredAvailable.map(dName => {
                          const dev = allDevices?.[dName]
                          return (
                            <button
                              key={dName}
                              type="button"
                              onClick={() => { handleAddDevice(dName); setAddSearch('') }}
                              style={{
                                all: 'unset', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px', borderRadius: 7,
                                fontFamily: C.sans, fontSize: '0.78rem', color: C.text1,
                                background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
                                transition: 'background 0.12s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,46,255,0.08)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            >
                              <Plus size={11} style={{ color: C.blue, flexShrink: 0 }} />
                              <span style={{ flex: 1 }}>{deviceLabel(dName)}</span>
                              {dev?.location && (
                                <span style={{ fontSize: '0.65rem', color: C.text3 }}>{dev.location}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main GroupManager component ── */
export default function GroupManager({ deviceStates }) {
  const [groups, setGroups]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)

  const fetchGroups = useCallback(async () => {
    try {
      const res = await getGroups()
      setGroups(res.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const handleCreated = (newGroup) => {
    setGroups(prev => [...prev, { ...newGroup, devices: [] }])
    setShowNewForm(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={14} style={{ color: C.blue }} />
          <span style={{
            fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text2,
          }}>
            Device Groups
          </span>
          {groups.length > 0 && (
            <span style={{
              fontFamily: C.mono, fontSize: '0.6rem', color: C.text3,
              background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 4, padding: '1px 6px',
            }}>
              {groups.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowNewForm(v => !v)}
          style={{
            all: 'unset', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 8,
            fontFamily: C.sans, fontSize: '0.72rem', fontWeight: 700,
            background: showNewForm ? 'rgba(26,46,255,0.15)' : 'rgba(26,46,255,0.08)',
            border: `1px solid ${showNewForm ? 'rgba(26,46,255,0.45)' : 'rgba(26,46,255,0.2)'}`,
            color: C.blue,
            transition: 'all 0.15s',
          }}
        >
          {showNewForm ? <X size={12} /> : <Plus size={12} />}
          {showNewForm ? 'Cancel' : 'New Group'}
        </button>
      </div>

      {/* New group form */}
      {showNewForm && (
        <NewGroupForm
          onCreated={handleCreated}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Groups list */}
      {loading ? (
        <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.text3, padding: '16px 0', textAlign: 'center' }}>
          Loading groups…
        </div>
      ) : groups.length === 0 && !showNewForm ? (
        <div style={{
          background: C.panel, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '32px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⬡</div>
          <div style={{ fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 600, color: C.text2, marginBottom: 6 }}>
            No groups yet
          </div>
          <div style={{ fontFamily: C.sans, fontSize: '0.75rem', color: C.text3, lineHeight: 1.6 }}>
            Create groups to organize devices by room, floor, or function.<br />
            Then control them all at once.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              allDevices={deviceStates}
              onRefresh={fetchGroups}
            />
          ))}
        </div>
      )}
    </div>
  )
}
