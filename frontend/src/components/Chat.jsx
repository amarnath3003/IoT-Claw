import { useState, useRef, useEffect } from 'react'
import { sendChat } from '../api'

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: "Hello! I'm iotClaw. Ask me to control devices, read sensors, or set up automations.\n\nTry: \"Register a fan called living_room_fan, topic home/living_room/fan, type switch\""
}

export default function Chat() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      // Build history in OpenAI format — skip the initial greeting, exclude the latest user msg
      const history = newMessages.slice(1, -1).map(m => ({ role: m.role, content: m.content }))
      const res = await sendChat(text, history)
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠️ Error connecting to backend. Is the server running?' }
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-cyan-900 border border-cyan-700 flex items-center justify-center mr-2 mt-1 flex-shrink-0 text-xs">
                🤖
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                ${msg.role === 'user'
                  ? 'bg-cyan-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm border border-gray-700'
                }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-cyan-900 border border-cyan-700 flex items-center justify-center mr-2 mt-1 flex-shrink-0 text-xs">
              🤖
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
              <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="flex gap-2 flex-wrap mt-3 mb-2">
        {['List my devices', 'Create a workflow', 'What sensors are active?'].map(prompt => (
          <button
            key={prompt}
            onClick={() => { setInput(prompt); inputRef.current?.focus() }}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="flex gap-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about your devices... (Enter to send)"
          rows={1}
          className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-cyan-500 resize-none transition-colors"
          style={{ minHeight: 48, maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors flex-shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  )
}