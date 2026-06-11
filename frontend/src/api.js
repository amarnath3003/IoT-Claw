import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV 
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : '')

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

export const getSetupStatus = () =>
  api.get('/setup/status')

export const completeSetup = (config) =>
  api.post('/setup/complete', config)

export const sendChat = (message, history) =>
  api.post('/chat', { message, history })

export const getState = () =>
  api.get('/state')

export const registerDevice = (device) =>
  api.post('/devices', device)

export const deleteDevice = (name) =>
  api.delete(`/devices/${encodeURIComponent(name)}`)

export const commandDevice = (name, command, params = {}) =>
  api.post(`/devices/${encodeURIComponent(name)}/command`, { command, ...params })

export const getDevicePreviewUrl = (name, cacheBuster = Date.now()) =>
  `${API_BASE}/devices/${encodeURIComponent(name)}/preview?t=${cacheBuster}`

export const getLogs = (limit = 100) =>
  api.get('/logs', { params: { limit } })

export const getWorkflows = () =>
  api.get('/workflows')

export const createWorkflow = (workflow) =>
  api.post('/workflows', workflow)

export const toggleWorkflow = (id) =>
  api.patch(`/workflows/${id}/toggle`)

export const runWorkflow = (id) =>
  api.post(`/workflows/${id}/run`)

export const deployWorkflowToEdge = (id) =>
  api.post(`/workflows/${id}/deploy`)

export const deleteWorkflow = (id) =>
  api.delete(`/workflows/${id}`)

export const getTelemetry = (name) =>
  api.get(`/devices/${encodeURIComponent(name)}/telemetry`)

export const getScriptHistory = (name) =>
  api.get(`/devices/${encodeURIComponent(name)}/scripts`)

export const rollbackScript = (name, index) =>
  api.post(`/devices/${encodeURIComponent(name)}/scripts/${index}/rollback`)

export const callMcpTool = (name, tool, args = {}) =>
  api.post(`/devices/${encodeURIComponent(name)}/mcp/call`, { tool, arguments: args })

export const getTelemetryExportUrl = (name) =>
  `${API_BASE}/devices/${encodeURIComponent(name)}/telemetry/export`

export const zigbeeSet = (name, payload) =>
  api.post(`/devices/${encodeURIComponent(name)}/zigbee/set`, payload)

export const zigbeePermitJoin = (enable, duration = 120) =>
  api.post('/zigbee/permit_join', { enable, duration })

export const zigbeeRemoveDevice = (name, force = false) =>
  api.delete(`/zigbee/devices/${encodeURIComponent(name)}`, { params: { force } })

export const zigbeeRenameDevice = (name, newName) =>
  api.put(`/zigbee/devices/${encodeURIComponent(name)}/rename`, { newName })

export const getZigbeeStatus = () =>
  api.get('/zigbee/status')

// ── Home Assistant API ─────────────────────────────────────────────────────

export const getHAStatus = () =>
  api.get('/ha/status')

export const haSetEntity = (entityId, payload) =>
  api.post(`/ha/entities/${encodeURIComponent(entityId)}/set`, payload)

export const haCallService = (domain, service, entityId = '', data = {}) =>
  api.post('/ha/call_service', { domain, service, entity_id: entityId, data })

export const haRefresh = () =>
  api.post('/ha/refresh')

// haCommandDevice is superseded by commandDevice(name, command, extras)
export const haCommandDevice = (name, command, extras = {}) =>
  commandDevice(name, command, extras)

// ── Device Groups API ──────────────────────────────────────────────────────

export const getGroups = () =>
  api.get('/groups')

export const createGroup = (name, color, icon) =>
  api.post('/groups', { name, color, icon })

export const updateGroup = (id, data) =>
  api.put(`/groups/${id}`, data)

export const deleteGroup = (id) =>
  api.delete(`/groups/${id}`)

export const addDeviceToGroup = (groupId, deviceName) =>
  api.post(`/groups/${groupId}/devices`, { device_name: deviceName })

export const removeDeviceFromGroup = (groupId, deviceName) =>
  api.delete(`/groups/${groupId}/devices/${encodeURIComponent(deviceName)}`)

export const commandGroup = (groupId, command) =>
  api.post(`/groups/${groupId}/command`, { command })

export default api
