import { useState } from 'react'
import { Bot, Cpu, Network, ArrowRight, Check, Loader2 } from 'lucide-react'
import { completeSetup } from '../api'

const S = {
  border: 'rgba(255,255,255,0.07)',
  borderFocus: 'rgba(26,46,255,0.45)',
  text1: 'rgba(255,255,255,0.82)',
  text2: 'rgba(255,255,255,0.50)',
  text3: 'rgba(255,255,255,0.25)',
  sans: '"Outfit", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
}

const inputStyle = {
  width: '100%',
  background: 'rgba(0,0,0,0.2)',
  border: `1px solid ${S.border}`,
  borderRadius: 8,
  padding: '10px 14px',
  color: S.text1,
  fontFamily: S.sans,
  fontSize: '0.9rem',
  outline: 'none',
  transition: 'all 0.2s ease',
}

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  cursor: 'pointer',
}

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [config, setConfig] = useState({
    llm_provider: 'openai',
    llm_api_key: '',
    llm_model: 'gpt-4o',
    mqtt_broker_host: 'localhost',
    mqtt_broker_port: '1883',
    zigbee2mqtt_enabled: false,
    ha_enabled: false,
    ha_host: 'localhost',
    ha_port: '8123',
    ha_token: '',
  })

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }))

  const handleNext = () => {
    if (step < 3) setStep(step + 1)
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleFinish = async () => {
    setLoading(true)
    setError(null)
    try {
      await completeSetup(config)
      onComplete()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to complete setup.')
      setLoading(false)
    }
  }

  const step1 = (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>AI Provider</label>
        <select
          value={config.llm_provider}
          onChange={e => update('llm_provider', e.target.value)}
          style={selectStyle}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>

      {config.llm_provider !== 'ollama' && (
        <div>
          <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>API Key</label>
          <input
            type="password"
            value={config.llm_api_key}
            onChange={e => update('llm_api_key', e.target.value)}
            style={inputStyle}
            placeholder={`Enter your ${config.llm_provider} API Key`}
          />
        </div>
      )}

      <div>
        <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>Model Name</label>
        <input
          type="text"
          value={config.llm_model}
          onChange={e => update('llm_model', e.target.value)}
          style={inputStyle}
          placeholder="e.g. gpt-4o, claude-3-5-sonnet, llama3"
        />
      </div>
    </div>
  )

  const step2 = (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>MQTT Host</label>
        <input
          type="text"
          value={config.mqtt_broker_host}
          onChange={e => update('mqtt_broker_host', e.target.value)}
          style={inputStyle}
          placeholder="localhost"
        />
        <div style={{ fontSize: '0.75rem', color: S.text3, marginTop: 6 }}>Use 'mosquitto' if running via the provided Docker Compose stack.</div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>MQTT Port</label>
        <input
          type="number"
          value={config.mqtt_broker_port}
          onChange={e => update('mqtt_broker_port', e.target.value)}
          style={inputStyle}
          placeholder="1883"
        />
      </div>
    </div>
  )

  const step3 = (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={config.zigbee2mqtt_enabled}
          onChange={e => update('zigbee2mqtt_enabled', e.target.checked)}
          style={{ width: 16, height: 16, accentColor: '#1a2eff' }}
        />
        <span style={{ color: S.text1, fontSize: '0.9rem' }}>Enable Zigbee2MQTT Integration</span>
      </label>

      <hr style={{ border: 'none', borderTop: `1px solid ${S.border}` }} />

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={config.ha_enabled}
          onChange={e => update('ha_enabled', e.target.checked)}
          style={{ width: 16, height: 16, accentColor: '#1a2eff' }}
        />
        <span style={{ color: S.text1, fontSize: '0.9rem' }}>Enable Home Assistant Integration</span>
      </label>

      {config.ha_enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 26, marginTop: -8 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>HA Host</label>
            <input
              type="text"
              value={config.ha_host}
              onChange={e => update('ha_host', e.target.value)}
              style={inputStyle}
              placeholder="localhost"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>HA Port</label>
            <input
              type="number"
              value={config.ha_port}
              onChange={e => update('ha_port', e.target.value)}
              style={inputStyle}
              placeholder="8123"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, color: S.text2, fontSize: '0.85rem' }}>Long-Lived Access Token</label>
            <input
              type="password"
              value={config.ha_token}
              onChange={e => update('ha_token', e.target.value)}
              style={inputStyle}
              placeholder="ey..."
            />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: S.sans,
    }}>
      <div style={{
        width: 500,
        maxWidth: '90%',
        background: '#0b0b14',
        border: `1px solid rgba(255,255,255,0.1)`,
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 32px',
          borderBottom: `1px solid ${S.border}`,
          background: 'rgba(255,255,255,0.02)',
        }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.4rem', fontWeight: 600 }}>Welcome to iotClaw</h2>
          <p style={{ margin: '6px 0 0', color: S.text2, fontSize: '0.9rem' }}>Let's get your autonomous ecosystem configured.</p>
        </div>

        {/* Stepper */}
        <div style={{ padding: '24px 32px 0', display: 'flex', gap: 12 }}>
          {[
            { num: 1, icon: Bot, label: 'AI Engine' },
            { num: 2, icon: Network, label: 'Message Broker' },
            { num: 3, icon: Cpu, label: 'Smart Hubs' },
          ].map(s => {
            const active = step === s.num
            const completed = step > s.num
            const Icon = s.icon
            return (
              <div key={s.num} style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                opacity: active || completed ? 1 : 0.3,
                transition: 'opacity 0.3s ease',
              }}>
                <div style={{
                  width: 36, height: 36,
                  borderRadius: '50%',
                  background: active ? '#1a2eff' : completed ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? '#1a2eff' : completed ? 'rgba(34,197,94,0.3)' : S.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: completed && !active ? '#22c55e' : '#fff',
                }}>
                  {completed && !active ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
                </div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? '#fff' : S.text2, fontWeight: active ? 600 : 500 }}>
                  {s.label}
                </span>
                <div style={{
                  height: 2,
                  width: '100%',
                  background: completed ? '#22c55e' : S.border,
                  marginTop: 4,
                  borderRadius: 1,
                }} />
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ padding: '32px', minHeight: 280 }}>
          {step === 1 && step1}
          {step === 2 && step2}
          {step === 3 && step3}

          {error && (
            <div style={{
              marginTop: 20,
              padding: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              color: '#ef4444',
              fontSize: '0.85rem',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 32px',
          borderTop: `1px solid ${S.border}`,
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <button
            onClick={handleBack}
            disabled={step === 1 || loading}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              color: step === 1 ? 'transparent' : S.text2,
              cursor: step === 1 ? 'default' : 'pointer',
              fontFamily: S.sans,
              fontWeight: 500,
            }}
          >
            Back
          </button>

          {step < 3 ? (
            <button
              onClick={handleNext}
              style={{
                padding: '8px 24px',
                background: '#fff',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                fontFamily: S.sans,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={loading}
              style={{
                padding: '8px 24px',
                background: '#1a2eff',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontFamily: S.sans,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Complete Setup'}
            </button>
          )}
        </div>
      </div>
      <style>{`
        .animate-fade-in { animation: fadeIn 0.4s ease forwards; }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
