import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
})

export const sendChat = (message, history) =>
  api.post('/chat', { message, history })

export const getState = () =>
  api.get('/state')

export const registerDevice = (device) =>
  api.post('/devices', device)

export const deleteDevice = (name) =>
  api.delete(`/devices/${encodeURIComponent(name)}`)

export const commandDevice = (name, command) =>
  api.post(`/devices/${encodeURIComponent(name)}/command`, { command })

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

export const deleteWorkflow = (id) =>
  api.delete(`/workflows/${id}`)

export default api
