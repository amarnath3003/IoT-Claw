import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Trash2, Zap, ArrowDown } from 'lucide-react'
import { API_BASE } from '../api'

let _activeAbort = null

const QUICK_PROMPTS = [
  { label: 'List devices',   text: 'List all my registered devices and their current status.' },
  { label: 'Turn on light',  text: 'Turn on the living room light.' },
  { label: 'New workflow',   text: 'Create a secret code workflow.' },
  { label: 'System status',  text: 'What is the current status of all my devices?' },
  { label: 'Turn off all',   text: 'Turn off all devices.' },
  { label: 'Help',           text: 'What can you help me with?' },
]

function relativeTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MessageContent({ content }) {
  const parts = content.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith('`') && part.endsWith('`'))
          return (
            <code key={i} style={{
              fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
              fontSize: '0.83em',
              background: 'rgba(26,46,255,0.12)',
              color: '#7fa8ff',
              padding: '1px 5px',
              borderRadius: 4,
              border: '1px solid rgba(26,46,255,0.18)',
            }}>{part.slice(1, -1)}</code>
          )
        return part.split('\n').map((line, j, arr) => (
          <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
        ))
      })}
    </span>
  )
}

function MessageRow({ msg }) {
  const isUser = msg.role === 'user'
  const time   = msg._time || ''

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: '5px 0',
      animation: 'rowIn 0.2s ease both',
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28,
        borderRadius: isUser ? 8 : 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800,
        flexShrink: 0,
        alignSelf: 'flex-end',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        letterSpacing: '-0.03em',
        ...(isUser ? {
          background: '#1a2eff',
          color: '#fff',
          boxShadow: '0 2px 12px rgba(26,46,255,0.5)',
        } : {
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.5)',
        }),
      }}>
        {isUser ? 'U' : '✦'}
      </div>

      {/* Bubble column */}
      <div style={{
        maxWidth: '72%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: 4,
      }}>
        {/* Name + time */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 7,
          flexDirection: isUser ? 'row-reverse' : 'row',
          paddingLeft: isUser ? 0 : 2,
          paddingRight: isUser ? 2 : 0,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: isUser ? '#6680ff' : 'rgba(255,255,255,0.40)',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.02em',
          }}>
            {isUser ? 'you' : 'claw'}
          </span>
          {time && (
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.18)',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}>
              {time}
            </span>
          )}
        </div>

        {/* Bubble */}
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          fontSize: 14,
          lineHeight: 1.75,
          wordBreak: 'break-word',
          fontFamily: '"Outfit", sans-serif',
          fontWeight: 400,
          ...(isUser ? {
            background: 'rgba(26,46,255,0.13)',
            border: '1px solid rgba(26,46,255,0.28)',
            color: '#c8d4ff',
          } : {
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.80)',
          }),
        }}>
          {msg._streaming && !msg.content ? (
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              {[0, 140, 280].map(d => (
                <span key={d} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'rgba(26,46,255,0.8)',
                  display: 'inline-block',
                  animation: 'dot 1.1s ease-in-out infinite',
                  animationDelay: `${d}ms`,
                }} />
              ))}
            </span>
          ) : (
            <MessageContent content={msg.content} />
          )}
        </div>

        {/* Tool calls */}
        {msg.toolCalls?.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 5,
            justifyContent: isUser ? 'flex-end' : 'flex-start',
          }}>
            {msg.toolCalls.map((t, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 4,
                fontSize: 10,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                color: '#5571cc',
                background: 'rgba(26,46,255,0.07)',
                border: '1px solid rgba(26,46,255,0.15)',
                letterSpacing: '0.03em',
              }}>
                <Zap size={8} /> {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Chat({ messages, setMessages }) {
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef(null)
  const inputRef                = useRef(null)
  const listRef                 = useRef(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, atBottom])

  const handleScroll = () => {
    const el = listRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg       = { role: 'user',      content: text,  _time: relativeTime() }
    const newMessages   = [...messages, userMsg]
    const aiPlaceholder = { role: 'assistant', content: '',    toolCalls: [], _streaming: true, _time: relativeTime() }
    setMessages([...newMessages, aiPlaceholder])
    setInput('')
    setLoading(true)
    setAtBottom(true)

    try {
      if (_activeAbort) _activeAbort.abort()
      const controller = new AbortController()
      _activeAbort = controller

      const history  = newMessages.slice(1, -1).map(m => ({ role: m.role, content: m.content }))
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      })

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer      = ''
      let accumulated = ''
      let toolCalls   = []

      const updateLast = (patch) =>
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?._streaming) updated[updated.length - 1] = { ...last, ...patch }
          return updated
        })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'token')      { accumulated += evt.content; updateLast({ content: accumulated }) }
            else if (evt.type === 'tool_call') { toolCalls = [...toolCalls, evt.tool]; updateLast({ toolCalls }) }
            else if (evt.type === 'error') { updateLast({ content: evt.content || 'Error.', _streaming: false }) }
            else if (evt.type === 'done')  { updateLast({ _streaming: false, content: accumulated || 'Done.' }) }
          } catch { /* skip */ }
        }
      }

      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?._streaming) updated[updated.length - 1] = { ...last, _streaming: false, content: accumulated || 'Done.' }
        return updated
      })
    } catch (err) {
      if (err?.name === 'AbortError') return
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?._streaming) {
          updated[updated.length - 1] = { role: 'assistant', content: 'Cannot reach backend. Is the server running?', toolCalls: [], _time: relativeTime() }
        } else {
          return [...prev, { role: 'assistant', content: 'Cannot reach backend. Is the server running?', toolCalls: [], _time: relativeTime() }]
        }
        return updated
      })
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, messages, setMessages])

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleInputChange = e => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const insertQuick = text => {
    setInput(text)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.style.height = 'auto'
        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
      }
    }, 10)
  }

  const clearChat = () => { setMessages([messages[0]]); setInput('') }

  const msgCount = messages.filter(m => m.role === 'user').length
  const canSend  = input.trim().length > 0 && !loading
  const visibleMsgs = messages.filter(m => m.role !== 'system')

  return (
    <>
      <style>{`
        @keyframes dot {
          0%, 60%, 100% { opacity: 0.25; transform: scale(1); }
          30%            { opacity: 1;    transform: scale(1.4); }
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .chat-root {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 136px);
          background: #0b0b14;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
        }

        /* ── Header ── */
        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }

        /* ── Messages ── */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 8px 16px 0;
          min-height: 0;
          scroll-behavior: smooth;
        }
        .chat-messages::-webkit-scrollbar { width: 3px; }
        .chat-messages::-webkit-scrollbar-track { background: transparent; }
        .chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }

        /* ── Quick chips ── */
        .qchip {
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          font-family: 'Outfit', sans-serif;
          cursor: pointer;
          white-space: nowrap;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.35);
          transition: all 0.14s ease;
          flex-shrink: 0;
        }
        .qchip:hover {
          border-color: rgba(26,46,255,0.45);
          color: #7fa8ff;
          background: rgba(26,46,255,0.08);
        }

        /* ── Input area ── */
        .chat-input-area {
          flex-shrink: 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 12px 20px;
        }
        .chat-input-row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
        }
        .chat-textarea {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          resize: none;
          outline: none;
          color: rgba(255,255,255,0.85);
          font-family: 'Outfit', sans-serif;
          font-size: 13.5px;
          line-height: 1.6;
          padding: 10px 14px;
          min-height: 42px;
          max-height: 120px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .chat-textarea::placeholder { color: rgba(255,255,255,0.2); }
        .chat-textarea:focus {
          border-color: rgba(26,46,255,0.45);
          box-shadow: 0 0 0 3px rgba(26,46,255,0.1);
        }
        .chat-send {
          width: 42px; height: 42px;
          border-radius: 10px;
          border: none;
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.14s ease;
        }
        .chat-send:disabled {
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.15);
          cursor: not-allowed;
        }
        .chat-send:not(:disabled) {
          background: #1a2eff;
          color: #fff;
          box-shadow: 0 2px 12px rgba(26,46,255,0.45);
        }
        .chat-send:not(:disabled):hover {
          background: #2d3fff;
          box-shadow: 0 4px 18px rgba(26,46,255,0.6);
          transform: translateY(-1px);
        }
        .chat-send:not(:disabled):active {
          transform: translateY(0);
        }

        .scroll-down-btn {
          position: absolute;
          bottom: 80px; right: 24px;
          width: 32px; height: 32px;
          border-radius: 50%;
          background: rgba(26,46,255,0.2);
          border: 1px solid rgba(26,46,255,0.35);
          color: #7fa8ff;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          animation: fadeUp 0.15s ease both;
          transition: background 0.15s;
          z-index: 10;
        }
        .scroll-down-btn:hover { background: rgba(26,46,255,0.35); }

        .clear-chat-btn {
          background: none;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 7px;
          padding: 5px 8px;
          color: rgba(255,255,255,0.25);
          cursor: pointer;
          display: flex; align-items: center;
          transition: all 0.14s;
        }
        .clear-chat-btn:hover {
          border-color: rgba(239,68,68,0.3);
          color: #f87171;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="chat-root" style={{ position: 'relative' }}>

        {/* ── Header ── */}
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: loading ? '#f59e0b' : '#22c55e',
              boxShadow: `0 0 8px ${loading ? '#f59e0b88' : '#22c55e88'}`,
              flexShrink: 0,
              transition: 'all 0.3s',
            }} />
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: 'rgba(255,255,255,0.6)',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.03em',
            }}>
              claw/ai
            </span>
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.18)',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}>
              · {msgCount} msg{msgCount !== 1 ? 's' : ''}
            </span>
          </div>

          <button className="clear-chat-btn" onClick={clearChat} title="Clear">
            <Trash2 size={13} />
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="chat-messages" ref={listRef} onScroll={handleScroll}>

          {/* Welcome state */}
          {visibleMsgs.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: 320,
              gap: 12, textAlign: 'center',
              animation: 'fadeUp 0.4s ease both',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                overflow: 'hidden',
                background: 'rgba(26,46,255,0.1)',
                border: '1px solid rgba(26,46,255,0.2)',
                marginBottom: 4,
              }}>
                <img src="/logo.jpg" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: '-0.02em' }}>
                IoT Claw AI
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', maxWidth: 320, lineHeight: 1.7 }}>
                Control devices, read sensor data, and build automation workflows through conversation.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 8 }}>
                {QUICK_PROMPTS.map(p => (
                  <button key={p.label} className="qchip" onClick={() => insertQuick(p.text)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibleMsgs.map((msg, i) => (
            <MessageRow key={`${msg.role}-${i}`} msg={msg} />
          ))}

          {/* Quick prompts row after welcome (when there are messages) */}
          {visibleMsgs.length > 0 && !loading && (
            <div style={{
              padding: '12px 0 16px',
              display: 'flex', gap: 7, flexWrap: 'nowrap',
              overflowX: 'auto',
            }}>
              {QUICK_PROMPTS.map(p => (
                <button key={p.label} className="qchip" onClick={() => insertQuick(p.text)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} style={{ height: 1 }} />
        </div>

        {/* Scroll to bottom */}
        {!atBottom && (
          <button
            className="scroll-down-btn"
            onClick={() => { setAtBottom(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          >
            <ArrowDown size={14} />
          </button>
        )}

        {/* ── Input ── */}
        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea
              id="chat-input"
              ref={inputRef}
              className="chat-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Claw AI…"
              rows={1}
            />
            <button
              id="chat-send-btn"
              className="chat-send"
              onClick={handleSend}
              disabled={!canSend}
              title="Send (Enter)"
            >
              {loading
                ? <span style={{ fontSize: 16, animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>⟳</span>
                : <Send size={15} />
              }
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
