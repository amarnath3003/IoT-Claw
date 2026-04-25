import { deleteWorkflow, runWorkflow, toggleWorkflow } from '../api'

function summarizeTrigger(trigger = {}) {
  if (trigger.type === 'chat') return `Chat phrase: "${trigger.code || ''}"`
  if (trigger.type === 'schedule') return `Daily at ${trigger.time || '--:--'}`
  return `${trigger.device || 'device'} ${trigger.operator || '>'} ${trigger.value ?? 'value'}`
}

export default function WorkflowList({ workflows, onChanged }) {
  const handleDelete = async (id, name) => {
    if (!confirm(`Delete workflow "${name}"?`)) return
    try {
      await deleteWorkflow(id)
      onChanged?.()
    } catch (e) {
      console.error('Failed to delete workflow:', e)
    }
  }

  const handleToggle = async (id) => {
    try {
      await toggleWorkflow(id)
      onChanged?.()
    } catch (e) {
      console.error('Failed to toggle workflow:', e)
    }
  }

  const handleRun = async (id) => {
    try {
      await runWorkflow(id)
      onChanged?.()
    } catch (e) {
      console.error('Failed to run workflow:', e)
    }
  }

  if (!workflows || workflows.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-6 border border-dashed border-gray-800 rounded-lg">
        No workflows yet. Create one with the builder or via Chat.
      </p>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Workflows</h3>
        <span className="text-xs text-gray-500">{workflows.length} saved</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {workflows.map(workflow => {
          const actions = workflow.actions || (workflow.action ? [workflow.action] : [])
          return (
            <div key={workflow.id} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${workflow.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
                    <span className="text-sm font-medium text-gray-200 truncate">{workflow.name}</span>
                  </div>
                  <p className="text-xs text-gray-500">{workflow.description || summarizeTrigger(workflow.trigger)}</p>
                </div>
                <span className="text-[11px] uppercase text-cyan-400 bg-cyan-950/60 border border-cyan-900 rounded px-2 py-1">
                  {workflow.trigger?.type || 'sensor'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Metric label="Actions" value={actions.length} />
                <Metric label="Runs" value={workflow.run_count || 0} />
                <Metric label="Cooldown" value={`${workflow.cooldown_seconds || 60}s`} />
                <Metric
                  label="Last run"
                  value={workflow.last_run ? new Date(workflow.last_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                />
              </div>

              <p className="text-xs text-gray-500">
                Trigger: <span className="text-gray-300">{summarizeTrigger(workflow.trigger)}</span>
              </p>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleToggle(workflow.id)} className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200">
                  {workflow.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => handleRun(workflow.id)} className="text-xs px-3 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white">
                  Run
                </button>
                <button onClick={() => handleDelete(workflow.id, workflow.name)} className="text-xs px-3 py-1.5 rounded bg-red-950/50 hover:bg-red-900/60 text-red-300">
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Metric({ label, value }) {
  return (
    <div className="bg-gray-900 rounded px-2 py-1.5">
      <div className="text-[10px] uppercase text-gray-600">{label}</div>
      <div className="text-gray-300 truncate">{value}</div>
    </div>
  )
}
