import { useState, useRef, useEffect, useCallback } from 'react'
import { API_BASE } from '../api'

const QUICK_PROMPTS = [
  { label: 'List devices',      text: 'List all my registered devices and their current status.' },
  { label: 'Turn on light',     text: 'Turn on the living room light.' },
  { label: 'New workflow',      text: 'Create a secret code workflow.' },
  { label: 'System status',     text: 'What is the current status of all my devices?' },
  { label: 'Turn off all',      text: 'Turn off all devices.' },
  { label: 'Help',              text: 'What can you help me with?' },
]

/* Tiny markdown-ish renderer — bolds **text**, monospace `code`, newlines */
function MessageContent({ content }) {
  const parts = content.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} style={{ color: 'var(--text-main)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
        if (part.startsWith('`') && part.endsWith('`'))
          return <code key={i} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.88em', color: 'var(--accent)', background: 'rgba(26,77,255,0.12)', padding: '1px 5px', borderRadius: 4 }}>{part.slice(1, -1)}</code>
        return part.split('\n').map((line, j, arr) => (
          <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
        ))
      })}
    </span>
  )
}

/* Tool call badge */
function ToolBadge({ tool }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      background: 'rgba(26,77,255,0.12)',
      border: '1px solid rgba(26,77,255,0.25)',
      color: 'var(--accent)', fontSize: 10,
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 600, letterSpacing: '0.04em',
    }}>
      ⚙ {tool}
    </span>
  )
}

/* AI avatar */
function AIAvatar() {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 10,
      background: 'var(--bg-dark)',
      boxShadow: 'var(--sh-flat)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, marginTop: 2,
      overflow: 'hidden',
    }}>
      <img src="/logo.jpg" alt="AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  )
}

/* Single message bubble */
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      gap: 10,
      alignItems: 'flex-start',
      animation: 'msgIn 0.18s ease-out both',
    }}>
      {!isUser && <AIAvatar />}

      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {/* bubble */}
        <div
          style={{
            padding: '11px 16px',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            fontSize: 13.5,
            lineHeight: 1.7,
            wordBreak: 'break-word',
            position: 'relative',
            ...(isUser ? {
              background: 'linear-gradient(135deg, rgba(26,77,255,0.22), rgba(26,77,255,0.10))',
              border: '1px solid rgba(26,77,255,0.30)',
              color: 'var(--text-main)',
              boxShadow: '0 0 14px rgba(26,77,255,0.15)',
            } : {
              background: 'var(--bg-dark)',
              boxShadow: 'var(--sh-trough)',
              color: '#c8d0dc',
            }),
          }}
        >
          <MessageContent content={msg.content} />
        </div>

        {/* tool calls */}
        {msg.toolCalls?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {msg.toolCalls.map((t, i) => <ToolBadge key={i} tool={t} />)}
          </div>
        )}

        {/* copy button (appears on hover via CSS class) */}
        <button
          onClick={copy}
          className="msg-copy-btn"
          title="Copy"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 10,
            padding: '2px 6px', borderRadius: 4,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.04em',
            transition: 'color 0.15s',
          }}
        >
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>

      {/* user avatar */}
      {isUser && (
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'var(--bg-dark)',
          boxShadow: 'var(--sh-flat)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 2,
          fontSize: 14, color: 'var(--accent)',
        }}>
          ⌂
        </div>
      )}
    </div>
  )
}

/* Typing indicator */
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <AIAvatar />
      <div className="neu-trough" style={{ padding: '12px 18px', display: 'flex', gap: 5, alignItems: 'center', borderRadius: '18px 18px 18px 4px' }}>
        {[0, 160, 320].map(d => (
          <span key={d} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--accent)', boxShadow: 'var(--glow-sm)',
            display: 'inline-block',
            animation: 'typingDot 1.2s ease-in-out infinite',
            animationDelay: `${d}ms`,
          }} />
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────── */
export default function Chat({ messages, setMessages }) {
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [charCount, setCharCount] = useState(0)
  const bottomRef               = useRef(null)
  const inputRef                = useRef(null)
  const listRef                 = useRef(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, atBottom])

  /* detect if user scrolled up */
  const handleScroll = () => {
    const el = listRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg     = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    const aiPlaceholder = { role: 'assistant', content: '', toolCalls: [], _streaming: true }
    setMessages([...newMessages, aiPlaceholder])
    setInput('')
    setCharCount(0)
    setLoading(true)
    setAtBottom(true)

    try {
      const history = newMessages.slice(1, -1).map(m => ({ role: m.role, content: m.content }))
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
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
            if (evt.type === 'token') {
              accumulated += evt.content
              updateLast({ content: accumulated })
            } else if (evt.type === 'tool_call') {
              toolCalls = [...toolCalls, evt.tool]
              updateLast({ toolCalls })
            } else if (evt.type === 'error') {
              updateLast({ content: evt.content || 'Error processing request.', _streaming: false })
            } else if (evt.type === 'done') {
              updateLast({ _streaming: false, content: accumulated || 'Done.' })
            }
          } catch { /* malformed chunk — skip */ }
        }
      }

      // Finalize in case 'done' event wasn't received
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?._streaming) updated[updated.length - 1] = { ...last, _streaming: false, content: accumulated || 'Done.' }
        return updated
      })
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?._streaming) {
          updated[updated.length - 1] = { role: 'assistant', content: 'Error connecting to backend. Is the server running?', toolCalls: [] }
        } else {
          return [...prev, { role: 'assistant', content: 'Error connecting to backend. Is the server running?', toolCalls: [] }]
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
    setCharCount(e.target.value.length)
    /* auto-resize textarea */
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const insertQuick = text => {
    setInput(text)
    setCharCount(text.length)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.style.height = 'auto'
        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
      }
    }, 10)
  }

  const clearChat = () => {
    setMessages([messages[0]])   // keep initial assistant greeting
    setInput('')
    setCharCount(0)
  }

  const msgCount = messages.filter(m => m.role === 'user').length
  const canSend  = input.trim().length > 0 && !loading

  return (
    <>
      <style>{`
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%           { transform: translateY(-5px); opacity: 1; }
        }
        .msg-copy-btn { opacity: 0; transition: opacity 0.15s; }
        .msg-copy-btn:hover { color: var(--accent) !important; }
        [style*="flex-start"] .msg-copy-btn:hover,
        [style*="flex-end"]   .msg-copy-btn:hover { opacity: 1; }
        /* show copy on bubble hover */
        div:has(> div > .msg-copy-btn):hover .msg-copy-btn { opacity: 1; }
        .chat-input-wrap:focus-within { box-shadow: var(--sh-trough), 0 0 0 2px rgba(26,77,255,0.35) !important; }
      `}</style>

      <div style={{
        display: 'grid',
        gridTemplateRows: '1fr auto',
        height: 'calc(100vh - 136px)',
        gap: 0,
        minHeight: 0,
      }}>

        {/* ════════ MAIN PANEL ════════ */}
        <div className="neu-section" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

          {/* ── header ── */}
          <div className="neu-section-header" style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/logo.jpg" alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4, background: '#000' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  AI Command Console
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {msgCount} message{msgCount !== 1 ? 's' : ''} · powered by OpenAI
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={loading ? 'led led-amber' : 'led-pulse'} />
              <span style={{ fontSize: 10, color: loading ? '#fbbf24' : '#22c55e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {loading ? 'Thinking…' : 'Ready'}
              </span>
              <button
                id="clear-chat-btn"
                onClick={clearChat}
                className="neu-btn-sm"
                title="Clear conversation"
                style={{ fontSize: 12, marginLeft: 4 }}
              >⊟</button>
            </div>
          </div>

          {/* ── messages ── */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              minHeight: 0,
            }}
          >
            {/* welcome state */}
            {messages.length === 1 && (
              <div style={{
                margin: 'auto',
                textAlign: 'center',
                padding: '32px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: '#000', boxShadow: 'var(--sh-flat)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  <img src="/logo.jpg" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-main)' }}>IoT-Claw AI Assistant</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 360, lineHeight: 1.6 }}>
                  Control devices, read sensor data, create automation workflows — all through natural language.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                  {QUICK_PROMPTS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => insertQuick(p.text)}
                      className="neu-btn"
                      style={{ padding: '7px 14px', fontSize: 12 }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={`${msg.role}-${i}`} msg={msg} />
            ))}

            {loading && <TypingIndicator />}

            {/* scroll anchor */}
            <div ref={bottomRef} style={{ height: 1 }} />
          </div>

          {/* scroll-to-bottom fab */}
          {!atBottom && (
            <button
              onClick={() => { setAtBottom(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
              style={{
                position: 'absolute',
                bottom: 180,
                right: 36,
                zIndex: 10,
                width: 36, height: 36,
                borderRadius: '50%',
                background: 'var(--bg-card)',
                boxShadow: 'var(--sh-flat)',
                border: '1px solid rgba(26,77,255,0.25)',
                color: 'var(--accent)',
                fontSize: 16,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Scroll to latest"
            >↓</button>
          )}

          {/* ── divider ── */}
          <hr className="neu-divider" style={{ flexShrink: 0 }} />

          {/* ── input area ── */}
          <div style={{
            padding: '0 16px 16px',
            display: 'flex', gap: 10,
            flexShrink: 0,
          }}>
            {/* textarea wrapper */}
            <div
              className="chat-input-wrap"
              style={{
                flex: 1,
                background: 'var(--bg-dark)',
                borderRadius: 12,
                boxShadow: 'var(--sh-trough)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'box-shadow 0.2s',
                overflow: 'hidden',
              }}
            >
              <textarea
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything… (Enter to send, Shift+Enter for newline)"
                rows={1}
                style={{
                  flex: 1, resize: 'none', border: 'none', outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  fontFamily: 'inherit', fontSize: 13.5,
                  lineHeight: 1.6, padding: '12px 14px 4px',
                  minHeight: 44, maxHeight: 120,
                }}
              />
              {/* char counter */}
              <div style={{
                padding: '2px 14px 6px',
                textAlign: 'right',
                fontSize: 10,
                color: charCount > 400 ? '#f87171' : 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                transition: 'color 0.2s',
              }}>
                {charCount > 0 ? `${charCount} chars` : ''}
              </div>
            </div>

            {/* send button */}
            <button
              id="chat-send-btn"
              onClick={handleSend}
              disabled={!canSend}
              style={{
                flexShrink: 0,
                width: 52,
                alignSelf: 'flex-end',
                height: 52,
                borderRadius: 12,
                background: canSend ? 'var(--bg-base)' : 'var(--bg-dark)',
                border: 'none',
                boxShadow: canSend ? 'var(--sh-flat)' : 'var(--sh-trough)',
                color: canSend ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 20,
                cursor: canSend ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
                ...(canSend ? { textShadow: 'var(--glow-sm)' } : {}),
              }}
              onMouseDown={e => { if (canSend) e.currentTarget.style.boxShadow = 'var(--sh-press)' }}
              onMouseUp={e => { if (canSend) e.currentTarget.style.boxShadow = 'var(--sh-flat)' }}
              title="Send (Enter)"
            >
              {loading ? (
                <span style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>⟳</span>
              ) : '➤'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
