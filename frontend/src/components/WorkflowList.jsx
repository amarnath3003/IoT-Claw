import { deleteWorkflow } from '../api'

export default function WorkflowList({ workflows, onDeleted }) {
  const handleDelete = async (id, name) => {
    if (!confirm(`Delete workflow "${name}"?`)) return
    try {
      await deleteWorkflow(id)
      onDeleted(id)
    } catch (e) {
      console.error('Failed to delete workflow:', e)
    }
  }

  if (workflows.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-6">
        No workflows yet. Create one above or via Chat.
      </p>
    )
  }

  const opLabel = { '>': '>', '<': '<', '>=': '≥', '<=': '≤', '==': '=', '!=': '≠' }

  return (
    <div className="space-y-3">
      {workflows.map(w => (
        <div
          key={w.id}
          className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 gap-4"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${w.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
              <span className="text-sm font-medium text-gray-200 truncate">{w.name}</span>
            </div>
            <p className="text-xs text-gray-500 truncate">
              IF <span className="text-cyan-400">{w.trigger?.device}</span>{' '}
              <span className="text-gray-300">{opLabel[w.trigger?.operator] ?? w.trigger?.operator}</span>{' '}
              <span className="text-cyan-400">{w.trigger?.value}</span>{' '}
              → THEN <span className="text-cyan-400">{w.action?.device}</span>{' '}
              <span className="text-gray-300">{w.action?.command}</span>
            </p>
          </div>
          <button
            onClick={() => handleDelete(w.id, w.name)}
            className="flex-shrink-0 text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-900/30"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}