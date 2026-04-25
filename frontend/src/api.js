import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
})

// ── Chat ──
export const sendChat = (message, history) =>
  api.post('/chat', { message, history })

// ── Devices ──
export const getState = () =>
  api.get('/state')

export const registerDevice = (device) =>
  api.post('/devices', device)

// ── Workflows ──
export const getWorkflows = () =>
  api.get('/workflows')

export const createWorkflow = (workflow) =>
  api.post('/workflows', workflow)

export const deleteWorkflow = (id) =>
  api.delete(`/workflows/${id}`)

export default api