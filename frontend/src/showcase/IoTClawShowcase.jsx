import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bot,
  Braces,
  Check,
  Cpu,
  Fan,
  GitBranch,
  Home,
  Lightbulb,
  LockKeyhole,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Terminal,
  Thermometer,
  Wifi,
  Zap,
} from 'lucide-react'

const SCENES = [
  { key: 'hero', label: 'Meet the Claw', duration: 2100 },
  { key: 'connect', label: 'Connect', duration: 2700 },
  { key: 'command', label: 'Command', duration: 3100 },
  { key: 'automate', label: 'Automate', duration: 3100 },
  { key: 'autonomous', label: 'Evolve', duration: 2900 },
  { key: 'outro', label: 'IoT-Claw', duration: 2100 },
]

const cx = (...classes) => classes.filter(Boolean).join(' ')

function Brand({ compact = false }) {
  return (
    <div className={cx('showcase-brand', compact && 'showcase-brand--compact')}>
      <img src="./logo.jpg" alt="IoT-Claw" />
      <div>
        <div className="showcase-wordmark">iot<span>CLAW</span></div>
        {!compact && <div className="showcase-brand-sub">INTELLIGENT IoT AGENT</div>}
      </div>
    </div>
  )
}

function SceneShell({ children, scene, kicker, title, subtitle, className = '' }) {
  return (
    <section className={cx('showcase-scene', `scene-${scene}`, className)}>
      <header className="scene-header">
        <div>
          <div className="scene-kicker"><span />{kicker}</div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <Brand compact />
      </header>
      {children}
    </section>
  )
}

function HomeNetworkArt() {
  return (
    <div className="home-art">
      <div className="home-art-halo" />
      <svg className="home-art-lines" viewBox="0 0 520 390" aria-hidden="true">
        <path className="home-shell" d="M74 181 L260 46 L447 181 L447 343 L74 343 Z" />
        <path className="home-room" d="M260 47 V343 M74 248 H447 M168 181 V343 M354 181 V343" />
        <path className="network-line line-one" d="M260 203 C205 203 208 145 139 145" />
        <path className="network-line line-two" d="M260 203 C310 203 315 143 385 143" />
        <path className="network-line line-three" d="M260 203 C205 203 212 295 127 295" />
        <path className="network-line line-four" d="M260 203 C320 203 310 294 397 294" />
      </svg>
      <div className="home-device home-device--light"><Lightbulb size={17} /><span>LIGHT</span><i /></div>
      <div className="home-device home-device--climate"><Thermometer size={17} /><span>24.6°C</span><i /></div>
      <div className="home-device home-device--fan"><Fan size={17} /><span>FAN</span><i /></div>
      <div className="home-device home-device--lock"><LockKeyhole size={17} /><span>LOCKED</span><i /></div>
      <div className="home-core-node">
        <span className="home-core-pulse" />
        <img src="./logo.jpg" alt="IoT-Claw agent core" />
        <small>AGENT CORE</small>
      </div>
      <div className="home-esp-tag"><Cpu size={15} /><span><strong>ESP32 EDGE</strong><small>ONLINE · 12 ms</small></span><i /></div>
      <div className="wifi-rings"><span /><span /><span /></div>
    </div>
  )
}

function EspBoardIllustration() {
  const leftPins = [54, 74, 94, 114, 134, 154, 174, 194]
  const rightPins = [54, 74, 94, 114, 134, 154, 174, 194]
  return (
    <div className="esp-illustration">
      <div className="esp-signal esp-signal--one" />
      <div className="esp-signal esp-signal--two" />
      <div className="esp-signal esp-signal--three" />
      <svg viewBox="0 0 370 245" role="img" aria-label="Animated ESP32 edge controller board">
        <defs>
          <linearGradient id="pcb" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#17225f" />
            <stop offset=".52" stopColor="#11194a" />
            <stop offset="1" stopColor="#080d2e" />
          </linearGradient>
          <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#d7def2" />
            <stop offset=".55" stopColor="#8e99b8" />
            <stop offset="1" stopColor="#5f6985" />
          </linearGradient>
          <filter id="boardGlow"><feGaussianBlur stdDeviation="7" /></filter>
        </defs>
        <rect x="42" y="24" width="286" height="202" rx="18" fill="#3e57ff" opacity=".2" filter="url(#boardGlow)" />
        <rect x="46" y="20" width="278" height="204" rx="16" fill="url(#pcb)" stroke="#5369e8" strokeWidth="2" />
        <g className="pcb-traces">
          <path d="M74 57 H118 V88 H145" /><path d="M74 96 H108 V126 H145" /><path d="M74 176 H123 V151 H145" />
          <path d="M296 62 H257 V91 H226" /><path d="M296 115 H252 V133 H226" /><path d="M296 181 H250 V160 H226" />
          <path d="M185 45 V72" /><path d="M185 174 V205" />
        </g>
        <rect x="133" y="61" width="105" height="112" rx="8" fill="url(#metal)" stroke="#edf2ff" strokeOpacity=".5" />
        <path d="M142 74 H229 M142 82 H229" stroke="#606b88" strokeWidth="1" opacity=".45" />
        <text x="185.5" y="110" textAnchor="middle" fill="#18203c" fontSize="13" fontWeight="800">ESP32-S3</text>
        <text x="185.5" y="127" textAnchor="middle" fill="#3e4968" fontSize="6.5" fontWeight="700" letterSpacing="1.5">IOT-CLAW EDGE</text>
        <rect x="161" y="141" width="49" height="17" rx="3" fill="#252e49" opacity=".86" />
        <path d="M164 145 H207 M164 150 H207 M164 155 H207" stroke="#9ba5be" strokeWidth="1" opacity=".35" />
        <rect x="154" y="7" width="63" height="29" rx="7" fill="#b8c1d7" stroke="#eef2ff" strokeOpacity=".7" />
        <rect x="164" y="11" width="43" height="20" rx="5" fill="#222a40" />
        <rect x="173" y="16" width="25" height="10" rx="3" fill="#090d18" />
        <circle className="esp-led esp-led--power" cx="271" cy="43" r="4" fill="#39d98a" />
        <circle className="esp-led esp-led--data" cx="286" cy="43" r="4" fill="#f7b955" />
        <g className="pin-bank">
          {leftPins.map((y, i) => <g key={`l${y}`}><circle cx="59" cy={y} r="5.4" /><circle cx="59" cy={y} r="2.4" className="pin-hole" /><text x="72" y={y + 2} fontSize="5.2">{['3V3','GND','D15','D2','D4','RX2','TX2','D5'][i]}</text></g>)}
          {rightPins.map((y, i) => <g key={`r${y}`}><circle cx="311" cy={y} r="5.4" /><circle cx="311" cy={y} r="2.4" className="pin-hole" /><text x="295" y={y + 2} textAnchor="end" fontSize="5.2">{['VIN','GND','D13','D12','D14','D27','D26','D25'][i]}</text></g>)}
        </g>
        <g className="antenna">
          <path d="M151 193 H220 M151 199 H220 M151 205 H220 M156 187 V211 M215 187 V211" />
        </g>
        <text x="185" y="218" textAnchor="middle" fill="#8294ff" fontSize="5.8" letterSpacing="1.2">MICROPYTHON AGENT READY</text>
      </svg>
      <div className="esp-data-tag esp-data-tag--code"><Braces size={12} /> MicroPython · 3.2 KB</div>
      <div className="esp-data-tag esp-data-tag--mqtt"><Wifi size={12} /> MQTT synced</div>
    </div>
  )
}

function HeroScene() {
  return (
    <section className="showcase-scene hero-scene">
      <div className="hero-grid" />
      <div className="hero-orb hero-orb--one" />
      <div className="hero-orb hero-orb--two" />
      <div className="hero-copy">
        <div className="hero-logo-wrap">
          <div className="hero-logo-ring" />
          <img src="./logo.jpg" alt="IoT-Claw logo" />
        </div>
        <div className="hero-eyebrow"><Sparkles size={13} /> OPEN-SOURCE · LOCAL-FIRST</div>
        <h1>Give your physical world<br /><span>an AI agent.</span></h1>
        <p>Connect, command and automate every device—from one intelligent control layer.</p>
        <div className="hero-pills">
          <span><MessageSquare size={13} /> Chat as creation</span>
          <span><GitBranch size={13} /> Visual automation</span>
          <span><Cpu size={13} /> Edge execution</span>
        </div>
      </div>
      <HomeNetworkArt />
    </section>
  )
}

const protocols = [
  { icon: Wifi, label: 'MQTT', detail: 'Real-time devices', color: 'blue' },
  { icon: Radio, label: 'Zigbee', detail: 'Low-power mesh', color: 'violet' },
  { icon: Home, label: 'Home Assistant', detail: 'Existing entities', color: 'amber' },
  { icon: Cpu, label: 'ESP32', detail: 'Edge agents', color: 'green' },
]

function ConnectScene() {
  return (
    <SceneShell
      scene="connect"
      kicker="UNIVERSAL CONTROL LAYER"
      title={<>One brain. <span>Every protocol.</span></>}
      subtitle="Bring the devices you already own into one live, local control plane."
    >
      <div className="connect-layout">
        <div className="protocol-stack">
          {protocols.map(({ icon: Icon, label, detail, color }, index) => (
            <div className="protocol-card" style={{ '--delay': `${index * 110}ms` }} key={label}>
              <div className={cx('protocol-icon', `is-${color}`)}><Icon size={18} /></div>
              <div><strong>{label}</strong><small>{detail}</small></div>
              <div className="protocol-live"><span /> LIVE</div>
            </div>
          ))}
        </div>

        <div className="connection-core">
          <div className="core-ring core-ring--outer" />
          <div className="core-ring core-ring--inner" />
          <div className="core-pulse" />
          <img src="./logo.jpg" alt="IoT-Claw core" />
          <strong>IoT-Claw</strong>
          <small>UNIFIED AGENT CORE</small>
        </div>

        <div className="event-stream">
          <div className="panel-title"><Activity size={14} /> LIVE EVENT STREAM <span>12 ms</span></div>
          <div className="event-row"><span className="event-time">10:42:08</span><Wifi size={13} /><b>living_room_light</b><em>ON · 72%</em></div>
          <div className="event-row"><span className="event-time">10:42:09</span><Thermometer size={13} /><b>studio_climate</b><em>24.6 °C</em></div>
          <div className="event-row"><span className="event-time">10:42:10</span><LockKeyhole size={13} /><b>front_door_lock</b><em>SECURE</em></div>
          <div className="event-row event-row--active"><span className="event-time">10:42:11</span><Cpu size={13} /><b>esp32_edge_hub</b><em>SYNCED</em></div>
          <div className="stream-footer"><ShieldCheck size={14} /> Local network · no cloud round-trip</div>
        </div>
      </div>
    </SceneShell>
  )
}

function CommandScene() {
  return (
    <SceneShell
      scene="command"
      kicker="NATURAL-LANGUAGE CONTROL"
      title={<>Say it. <span>Claw handles the rest.</span></>}
      subtitle="One request can query state, reason across devices and execute a verified action chain."
    >
      <div className="command-layout">
        <div className="chat-panel">
          <div className="chat-top"><MessageSquare size={15} /> COMMAND CONSOLE <span><i /> AGENT ONLINE</span></div>
          <div className="chat-body">
            <div className="chat-message chat-message--user">
              <small>YOU</small>
              <p>Keep the studio comfortable and lower the living room lights.</p>
            </div>
            <div className="chat-message chat-message--claw">
              <div className="claw-avatar"><Bot size={15} /></div>
              <div>
                <small>CLAW</small>
                <p>Studio is <b>27.4 °C</b>. I turned on the desk fan and set the living room light to <b>35%</b>.</p>
                <div className="tool-chips">
                  <span><Zap size={10} /> command_device × 2</span>
                  <span><Check size={10} /> state confirmed</span>
                </div>
              </div>
            </div>
          </div>
          <div className="chat-input">Ask IoT-Claw anything…<ArrowRight size={15} /></div>
        </div>

        <div className="device-result-panel">
          <div className="panel-title"><Activity size={14} /> VERIFIED DEVICE STATE</div>
          <div className="mini-device mini-device--temperature">
            <div className="mini-icon"><Thermometer size={20} /></div>
            <div><small>STUDIO CLIMATE</small><strong>27.4<span>°C</span></strong></div>
            <div className="sparkline"><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className="mini-device">
            <div className="mini-icon"><Fan size={20} /></div>
            <div><small>DESK FAN</small><strong className="state-on">ON</strong></div>
            <div className="toggle-on"><span /></div>
          </div>
          <div className="mini-device">
            <div className="mini-icon"><Lightbulb size={20} /></div>
            <div><small>LIVING ROOM</small><strong>35<span>%</span></strong></div>
            <div className="level-meter"><span /></div>
          </div>
          <div className="verified-banner"><Check size={14} /> All actions acknowledged in 18 ms</div>
        </div>
      </div>
    </SceneShell>
  )
}

function FlowNode({ kind, icon: Icon, eyebrow, title, detail, className = '' }) {
  return (
    <div className={cx('flow-node', `flow-node--${kind}`, className)}>
      <div className="flow-node-icon"><Icon size={17} /></div>
      <div><small>{eyebrow}</small><strong>{title}</strong><em>{detail}</em></div>
      <span className="node-port node-port--left" />
      <span className="node-port node-port--right" />
    </div>
  )
}

function AutomateScene() {
  return (
    <SceneShell
      scene="automate"
      kicker="VISUAL AUTOMATION → EDGE CODE"
      title={<>Design once. <span>Run where it matters.</span></>}
      subtitle="Build routines visually, then compile them into compact MicroPython for edge execution."
    >
      <div className="automate-layout">
        <div className="flow-panel">
          <div className="flow-toolbar"><GitBranch size={14} /> ADAPTIVE CLIMATE <span>SAVED</span></div>
          <svg className="flow-lines" viewBox="0 0 690 360" preserveAspectRatio="none" aria-hidden="true">
            <path d="M210 105 C270 105 255 178 325 178" />
            <path d="M498 178 C550 178 532 100 585 100" />
            <path d="M498 178 C550 178 532 265 585 265" />
          </svg>
          <FlowNode kind="trigger" icon={Thermometer} eyebrow="WHEN" title="Temperature" detail="studio_climate > 26 °C" className="node-trigger" />
          <FlowNode kind="logic" icon={Braces} eyebrow="CHECK" title="Cooldown" detail="last run > 120 sec" className="node-logic" />
          <FlowNode kind="action" icon={Fan} eyebrow="THEN" title="Desk fan" detail="set state → ON" className="node-action-one" />
          <FlowNode kind="action" icon={Terminal} eyebrow="AND" title="Edge log" detail="Cooling started" className="node-action-two" />
          <div className="flow-running"><span /> EXECUTION PATH LIVE</div>
        </div>

        <div className="compile-panel compile-panel--hardware">
          <div className="compile-head"><Cpu size={15} /> EDGE DEPLOYMENT <span>ESP32-S3</span></div>
          <EspBoardIllustration />
          <div className="compile-progress"><span /></div>
          <div className="compile-result"><Check size={14} /><div><strong>Deployed to edge</strong><small>3.2 KB · 14 ms</small></div></div>
        </div>
      </div>
    </SceneShell>
  )
}

const loopSteps = [
  { icon: Activity, n: '01', title: 'Observe', detail: 'Read every device, sensor and event.' },
  { icon: Sparkles, n: '02', title: 'Reason', detail: 'Evaluate goals, context and history.' },
  { icon: Zap, n: '03', title: 'Act', detail: 'Execute, verify and learn from outcomes.' },
]

function AutonomousScene() {
  return (
    <SceneShell
      scene="autonomous"
      kicker="THE AUTONOMOUS CLAW"
      title={<>Not a dashboard. <span>An active caretaker.</span></>}
      subtitle="Give it an objective. IoT-Claw continuously observes, reasons and safely acts."
    >
      <div className="autonomous-layout">
        <div className="goal-card">
          <div className="goal-icon"><Bot size={24} /></div>
          <small>CURRENT OBJECTIVE</small>
          <h3>Keep the studio comfortable while minimizing energy use.</h3>
          <div className="goal-state"><span /> CLAW MODE ACTIVE</div>
        </div>
        <div className="loop-steps">
          {loopSteps.map(({ icon: Icon, n, title, detail }, index) => (
            <div className="loop-step" style={{ '--delay': `${index * 180}ms` }} key={title}>
              <div className="loop-number">{n}</div>
              <div className="loop-icon"><Icon size={20} /></div>
              <strong>{title}</strong>
              <p>{detail}</p>
              {index < loopSteps.length - 1 && <ArrowRight className="loop-arrow" size={20} />}
            </div>
          ))}
        </div>
        <div className="autonomous-footer">
          <div><ShieldCheck size={18} /><span><strong>Local by design</strong><small>Fast, private and resilient</small></span></div>
          <div><Cpu size={18} /><span><strong>Edge-aware</strong><small>Cloud optional, not required</small></span></div>
          <div><GitBranch size={18} /><span><strong>Self-correcting</strong><small>Simulate before execution</small></span></div>
        </div>
      </div>
    </SceneShell>
  )
}

function OutroScene() {
  return (
    <section className="showcase-scene outro-scene">
      <div className="outro-grid" />
      <div className="outro-mark">
        <div className="outro-logo-glow" />
        <img src="./logo.jpg" alt="IoT-Claw" />
      </div>
      <div className="outro-wordmark">iot<span>CLAW</span></div>
      <h2>Your home. Your rules. <span>Your agent.</span></h2>
      <p>Open-source · Local-first · Edge-ready</p>
      <div className="outro-link"><GitBranch size={16} /> github.com/amarnath3003/IoT-Claw <ArrowRight size={16} /></div>
    </section>
  )
}

function Scene({ index }) {
  const key = SCENES[index]?.key
  if (key === 'connect') return <ConnectScene />
  if (key === 'command') return <CommandScene />
  if (key === 'automate') return <AutomateScene />
  if (key === 'autonomous') return <AutonomousScene />
  if (key === 'outro') return <OutroScene />
  return <HeroScene />
}

export default function IoTClawShowcase() {
  const [sceneIndex, setSceneIndex] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSceneIndex(current => (current + 1) % SCENES.length)
    }, SCENES[sceneIndex].duration)
    return () => window.clearTimeout(timer)
  }, [sceneIndex])

  return (
    <main className="showcase-root">
      <style>{STYLES}</style>
      <div className="showcase-frame">
        <Scene key={sceneIndex} index={sceneIndex} />
        <div className="showcase-progress" aria-hidden="true">
          {SCENES.map((scene, index) => (
            <div className={cx('progress-item', index === sceneIndex && 'is-active', index < sceneIndex && 'is-complete')} key={scene.key}>
              <span>{scene.label}</span>
              <i><b style={{ '--scene-duration': `${scene.duration}ms` }} /></i>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #07070d; }
  .showcase-root {
    --bg: #09090f;
    --panel: rgba(255,255,255,.045);
    --line: rgba(255,255,255,.09);
    --text: rgba(255,255,255,.92);
    --muted: rgba(255,255,255,.52);
    --dim: rgba(255,255,255,.28);
    --blue: #3e57ff;
    --blue-soft: #8294ff;
    --green: #39d98a;
    --amber: #f7b955;
    --violet: #b491ff;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #05050a;
    color: var(--text);
    font-family: Inter, Outfit, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .showcase-frame {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at 82% 18%, rgba(42,62,255,.13), transparent 30%),
      radial-gradient(circle at 15% 85%, rgba(42,62,255,.07), transparent 34%),
      var(--bg);
  }
  .showcase-scene {
    position: absolute;
    inset: 0;
    padding: 44px 62px 76px;
    animation: sceneIn .55s cubic-bezier(.16,1,.3,1) both;
  }
  .showcase-scene::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 1px solid rgba(255,255,255,.045);
  }
  .scene-header { display: flex; align-items: flex-start; justify-content: space-between; position: relative; z-index: 2; }
  .scene-kicker { color: var(--blue-soft); font-size: 10px; font-weight: 800; letter-spacing: .17em; display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .scene-kicker span { width: 18px; height: 2px; background: var(--blue); border-radius: 2px; box-shadow: 0 0 10px rgba(62,87,255,.8); }
  .scene-header h2 { font-size: clamp(32px, 3.2vw, 48px); line-height: 1.03; letter-spacing: -.045em; margin: 0; max-width: 780px; font-weight: 760; }
  .scene-header h2 span { color: var(--blue-soft); }
  .scene-header p { margin: 10px 0 0; color: var(--muted); font-size: 14px; max-width: 670px; line-height: 1.5; }
  .showcase-brand { display: flex; align-items: center; gap: 10px; }
  .showcase-brand img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; box-shadow: 0 8px 24px rgba(0,0,0,.42); }
  .showcase-wordmark { font-size: 17px; font-weight: 850; letter-spacing: -.035em; line-height: 1; }
  .showcase-wordmark span { color: var(--blue-soft); }
  .showcase-brand-sub { margin-top: 4px; color: var(--dim); font: 700 6.5px/1.1 ui-monospace, monospace; letter-spacing: .14em; }
  .showcase-brand--compact { opacity: .82; }
  .showcase-progress { position: absolute; z-index: 30; bottom: 23px; left: 62px; right: 62px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
  .progress-item > span { display: block; color: rgba(255,255,255,.22); font-size: 8px; font-weight: 750; text-transform: uppercase; letter-spacing: .11em; margin: 0 0 6px 1px; }
  .progress-item i { display: block; height: 2px; background: rgba(255,255,255,.08); border-radius: 5px; overflow: hidden; }
  .progress-item i b { display: block; width: 0; height: 100%; background: var(--blue); box-shadow: 0 0 8px rgba(62,87,255,.9); }
  .progress-item.is-active > span { color: var(--blue-soft); }
  .progress-item.is-active i b { animation: progress var(--scene-duration) linear both; }
  .progress-item.is-complete i b { width: 100%; background: rgba(62,87,255,.45); }

  /* Hero */
  .hero-scene { display: grid; grid-template-columns: .93fr 1.07fr; align-items: center; gap: 34px; padding: 56px 62px 82px; text-align: left; }
  .hero-grid, .outro-grid { position: absolute; inset: 0; opacity: .22; background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 54px 54px; mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 68%); }
  .hero-orb { position: absolute; width: 310px; height: 310px; border-radius: 50%; filter: blur(80px); opacity: .18; background: var(--blue); }
  .hero-orb--one { left: 22%; top: 14%; }
  .hero-orb--two { right: 20%; bottom: 8%; background: #7847ff; opacity: .11; }
  .hero-copy { position: relative; z-index: 4; }
  .hero-logo-wrap { width: 58px; height: 58px; position: relative; margin-bottom: 17px; animation: heroFloat 2.2s ease-in-out infinite; }
  .hero-logo-wrap img { width: 58px; height: 58px; border-radius: 15px; object-fit: cover; position: relative; z-index: 2; box-shadow: 0 18px 55px rgba(0,0,0,.55), 0 0 36px rgba(62,87,255,.28); }
  .hero-logo-ring { position: absolute; inset: -13px; border: 1px solid rgba(84,106,255,.22); border-radius: 28px; animation: logoRing 1.7s ease-in-out infinite; }
  .hero-eyebrow { display: inline-flex; align-items: center; gap: 7px; color: var(--blue-soft); background: rgba(62,87,255,.08); border: 1px solid rgba(86,108,255,.22); border-radius: 999px; padding: 6px 10px; font-size: 9px; font-weight: 780; letter-spacing: .13em; margin-bottom: 13px; }
  .hero-scene h1 { font-size: clamp(42px, 4.45vw, 67px); line-height: .98; letter-spacing: -.058em; margin: 0; font-weight: 800; }
  .hero-scene h1 span { color: var(--blue-soft); text-shadow: 0 0 38px rgba(62,87,255,.24); }
  .hero-copy > p { margin: 15px 0 19px; font-size: 14px; line-height: 1.55; color: var(--muted); max-width: 535px; }
  .hero-pills { display: flex; gap: 8px; }
  .hero-pills span { display: flex; align-items: center; gap: 7px; padding: 7px 11px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; color: rgba(255,255,255,.66); font-size: 10px; font-weight: 650; animation: riseIn .55s ease both; }
  .hero-pills span:nth-child(2) { animation-delay: .08s; }
  .hero-pills span:nth-child(3) { animation-delay: .16s; }
  .home-art { position: relative; height: 455px; z-index: 3; animation: slideLeft .7s .08s ease both; }
  .home-art-halo { position: absolute; width: 330px; height: 330px; border-radius: 50%; left: 50%; top: 48%; transform: translate(-50%,-50%); background: rgba(62,87,255,.13); filter: blur(55px); }
  .home-art-lines { position: absolute; inset: 12px 0 0; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 18px 30px rgba(0,0,0,.3)); }
  .home-shell { fill: rgba(13,14,28,.72); stroke: rgba(130,148,255,.48); stroke-width: 2; }.home-room { fill: none; stroke: rgba(255,255,255,.095); stroke-width: 1.25; }
  .network-line { fill: none; stroke: #5369ff; stroke-width: 1.8; stroke-dasharray: 6 8; animation: dash 1.05s linear infinite; filter: drop-shadow(0 0 4px rgba(62,87,255,.65)); }
  .home-device { position: absolute; width: 83px; height: 47px; border-radius: 10px; display: flex; align-items: center; gap: 7px; padding: 0 10px; color: var(--blue-soft); background: rgba(12,13,25,.95); border: 1px solid rgba(93,113,255,.24); box-shadow: 0 10px 24px rgba(0,0,0,.32); font: 740 7px/1 ui-monospace,monospace; letter-spacing: .04em; animation: deviceFloat 2.1s ease-in-out infinite; }
  .home-device i { position: absolute; right: 7px; top: 7px; width: 5px; height: 5px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px rgba(57,217,138,.8); }
  .home-device--light { left: 8%; top: 22%; }.home-device--climate { right: 4%; top: 21%; animation-delay: -.35s; }.home-device--fan { left: 5%; bottom: 20%; animation-delay: -.7s; }.home-device--lock { right: 2%; bottom: 20%; animation-delay: -1.05s; }
  .home-core-node { position: absolute; left: 50%; top: 48%; transform: translate(-50%,-50%); width: 95px; text-align: center; z-index: 4; }.home-core-node img { width: 68px; height: 68px; border-radius: 18px; position: relative; z-index: 2; box-shadow: 0 0 34px rgba(62,87,255,.35); }.home-core-node small { display: block; margin-top: 7px; color: var(--blue-soft); font: 750 6px/1 ui-monospace,monospace; letter-spacing: .11em; }.home-core-pulse { position: absolute; left: 13px; top: -2px; width: 72px; height: 72px; border-radius: 21px; border: 1px solid rgba(87,108,255,.48); animation: corePulse 1.6s ease-in-out infinite; }
  .home-esp-tag { position: absolute; left: 50%; bottom: 3%; transform: translateX(-50%); width: 178px; height: 46px; padding: 0 12px; display: flex; align-items: center; gap: 9px; color: var(--green); background: rgba(8,12,22,.96); border: 1px solid rgba(57,217,138,.2); border-radius: 10px; box-shadow: 0 10px 28px rgba(0,0,0,.35); }.home-esp-tag strong,.home-esp-tag small{display:block}.home-esp-tag strong{font:750 7px/1 ui-monospace,monospace;letter-spacing:.08em}.home-esp-tag small{font:600 6.5px/1 ui-monospace,monospace;color:rgba(57,217,138,.46);margin-top:4px}.home-esp-tag i{margin-left:auto;width:6px;height:6px;background:var(--green);border-radius:50%;box-shadow:0 0 8px rgba(57,217,138,.8);animation:blink 1.2s infinite}
  .wifi-rings { position: absolute; top: 7%; left: 50%; transform: translateX(-50%); width: 78px; height: 56px; }.wifi-rings span { position:absolute;left:50%;bottom:0;transform:translateX(-50%);border:2px solid var(--blue-soft);border-left-color:transparent;border-right-color:transparent;border-bottom-color:transparent;border-radius:50%;animation:wifiWave 1.8s ease-out infinite; }.wifi-rings span:nth-child(1){width:24px;height:18px}.wifi-rings span:nth-child(2){width:48px;height:34px;animation-delay:.18s}.wifi-rings span:nth-child(3){width:72px;height:50px;animation-delay:.36s}

  /* Connect */
  .connect-layout { position: relative; z-index: 2; display: grid; grid-template-columns: .9fr .68fr 1.18fr; gap: 28px; align-items: center; height: calc(100% - 104px); }
  .protocol-stack { display: flex; flex-direction: column; gap: 8px; }
  .protocol-card { display: grid; grid-template-columns: 39px 1fr auto; align-items: center; gap: 11px; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 11px; animation: slideRight .5s var(--delay) ease both; }
  .protocol-card strong { display: block; font-size: 12px; color: rgba(255,255,255,.84); }
  .protocol-card small { display: block; margin-top: 2px; color: var(--dim); font-size: 9px; }
  .protocol-icon { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; background: rgba(62,87,255,.11); color: var(--blue-soft); border: 1px solid rgba(92,112,255,.18); }
  .protocol-icon.is-violet { color: var(--violet); background: rgba(180,145,255,.09); border-color: rgba(180,145,255,.19); }
  .protocol-icon.is-amber { color: var(--amber); background: rgba(247,185,85,.08); border-color: rgba(247,185,85,.18); }
  .protocol-icon.is-green { color: var(--green); background: rgba(57,217,138,.08); border-color: rgba(57,217,138,.18); }
  .protocol-live { font: 750 7px/1 ui-monospace, monospace; color: var(--green); letter-spacing: .08em; display: flex; gap: 4px; align-items: center; }
  .protocol-live span { width: 5px; height: 5px; border-radius: 50%; background: var(--green); box-shadow: 0 0 7px rgba(57,217,138,.8); animation: blink 1.6s ease-in-out infinite; }
  .connection-core { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 260px; }
  .connection-core::before, .connection-core::after { content: ''; position: absolute; height: 1px; width: 94px; background: linear-gradient(90deg, transparent, var(--blue), transparent); top: 50%; }
  .connection-core::before { left: -44px; }
  .connection-core::after { right: -44px; }
  .connection-core img { width: 82px; height: 82px; object-fit: cover; border-radius: 21px; box-shadow: 0 0 45px rgba(62,87,255,.24); z-index: 2; }
  .connection-core strong { margin-top: 13px; font-size: 14px; letter-spacing: -.02em; z-index: 2; }
  .connection-core small { font: 720 6.5px/1 ui-monospace, monospace; letter-spacing: .13em; color: var(--dim); margin-top: 4px; z-index: 2; }
  .core-ring { position: absolute; border-radius: 50%; border: 1px solid rgba(87,107,255,.2); }
  .core-ring--outer { width: 208px; height: 208px; animation: spin 12s linear infinite; border-style: dashed; }
  .core-ring--inner { width: 148px; height: 148px; animation: spin 8s linear infinite reverse; }
  .core-pulse { position: absolute; width: 112px; height: 112px; border-radius: 28px; background: rgba(62,87,255,.09); animation: corePulse 1.8s ease-in-out infinite; }
  .event-stream { background: rgba(7,7,13,.72); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,.22); }
  .panel-title, .chat-top, .flow-toolbar, .compile-head { height: 38px; padding: 0 13px; display: flex; align-items: center; gap: 7px; border-bottom: 1px solid var(--line); color: rgba(255,255,255,.45); font: 740 8px/1 ui-monospace, monospace; letter-spacing: .1em; }
  .panel-title > span, .chat-top > span, .flow-toolbar > span, .compile-head > span { margin-left: auto; color: var(--green); }
  .event-row { display: grid; grid-template-columns: 57px 16px 1fr auto; gap: 6px; align-items: center; padding: 11px 13px; border-bottom: 1px solid rgba(255,255,255,.05); font-size: 9px; color: var(--dim); animation: eventIn .4s ease both; }
  .event-row:nth-child(3) { animation-delay: .12s; }.event-row:nth-child(4) { animation-delay: .24s; }.event-row:nth-child(5) { animation-delay: .36s; }
  .event-row svg { color: var(--blue-soft); }
  .event-row b { color: rgba(255,255,255,.68); font-weight: 600; }
  .event-row em { color: var(--green); font: 700 8px/1 ui-monospace, monospace; font-style: normal; }
  .event-row--active { background: rgba(62,87,255,.06); }
  .event-time { font: 500 7.5px/1 ui-monospace, monospace; color: rgba(255,255,255,.21); }
  .stream-footer { display: flex; align-items: center; gap: 7px; padding: 10px 13px; color: rgba(255,255,255,.42); font-size: 9px; }
  .stream-footer svg { color: var(--green); }

  /* Command */
  .command-layout { position: relative; z-index: 2; display: grid; grid-template-columns: 1.35fr .78fr; gap: 22px; height: calc(100% - 115px); padding-top: 20px; }
  .chat-panel, .device-result-panel { background: rgba(8,8,15,.78); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,.2); }
  .chat-panel { display: flex; flex-direction: column; }
  .chat-top span { display: flex; align-items: center; gap: 5px; }
  .chat-top span i { width: 5px; height: 5px; background: var(--green); border-radius: 50%; box-shadow: 0 0 7px rgba(57,217,138,.8); }
  .chat-body { padding: 20px 22px 12px; flex: 1; display: flex; flex-direction: column; gap: 18px; }
  .chat-message { max-width: 85%; animation: riseIn .45s ease both; }
  .chat-message small { display: block; font: 720 7px/1 ui-monospace, monospace; letter-spacing: .1em; color: var(--dim); margin-bottom: 5px; }
  .chat-message p { margin: 0; font-size: 12px; line-height: 1.55; color: rgba(255,255,255,.74); }
  .chat-message--user { align-self: flex-end; padding: 11px 14px; border-radius: 12px 12px 3px 12px; background: rgba(62,87,255,.12); border: 1px solid rgba(75,96,255,.25); animation-delay: .08s; }
  .chat-message--claw { display: flex; gap: 10px; max-width: 92%; align-self: flex-start; animation-delay: .48s; }
  .chat-message--claw > div:last-child { padding: 11px 14px; border-radius: 3px 12px 12px 12px; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
  .chat-message b { color: var(--blue-soft); }
  .claw-avatar { width: 29px; height: 29px; flex: 0 0 auto; border-radius: 8px; background: rgba(62,87,255,.11); border: 1px solid rgba(72,94,255,.2); color: var(--blue-soft); display: grid; place-items: center; }
  .tool-chips { display: flex; gap: 5px; margin-top: 9px; }
  .tool-chips span { display: flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 5px; background: rgba(62,87,255,.06); border: 1px solid rgba(73,94,255,.17); color: rgba(130,148,255,.72); font: 650 7.5px/1 ui-monospace, monospace; }
  .chat-input { margin: 0 14px 14px; height: 40px; border-radius: 9px; border: 1px solid var(--line); background: rgba(255,255,255,.035); color: rgba(255,255,255,.25); padding: 0 13px; display: flex; align-items: center; justify-content: space-between; font-size: 10px; }
  .chat-input svg { color: var(--blue-soft); }
  .device-result-panel { padding-bottom: 11px; }
  .mini-device { margin: 8px 10px 0; min-height: 63px; display: grid; grid-template-columns: 39px 1fr auto; align-items: center; gap: 10px; border: 1px solid rgba(255,255,255,.065); border-radius: 10px; padding: 9px 11px; background: rgba(255,255,255,.025); animation: slideLeft .45s ease both; }
  .mini-device:nth-child(3) { animation-delay: .14s; }.mini-device:nth-child(4) { animation-delay: .28s; }
  .mini-icon { width: 36px; height: 36px; display: grid; place-items: center; color: var(--blue-soft); background: rgba(62,87,255,.09); border: 1px solid rgba(73,94,255,.16); border-radius: 9px; }
  .mini-device small { display: block; color: var(--dim); font: 700 7px/1 ui-monospace, monospace; letter-spacing: .09em; margin-bottom: 4px; }
  .mini-device strong { font-size: 20px; line-height: 1; }
  .mini-device strong span { font-size: 10px; color: var(--muted); margin-left: 2px; }.mini-device .state-on { color: var(--green); font-size: 15px; }
  .toggle-on { width: 31px; height: 17px; border-radius: 99px; background: rgba(57,217,138,.28); border: 1px solid rgba(57,217,138,.35); padding: 2px; }
  .toggle-on span { display: block; width: 11px; height: 11px; border-radius: 50%; background: var(--green); margin-left: 14px; box-shadow: 0 0 7px rgba(57,217,138,.7); }
  .level-meter { width: 50px; height: 4px; border-radius: 5px; background: rgba(255,255,255,.08); overflow: hidden; }.level-meter span { display: block; width: 35%; height: 100%; background: var(--blue); box-shadow: 0 0 7px rgba(62,87,255,.7); }
  .sparkline { display: flex; align-items: end; gap: 2px; height: 23px; }.sparkline i { display: block; width: 3px; border-radius: 2px; background: var(--blue); opacity: .65; }.sparkline i:nth-child(1){height:8px}.sparkline i:nth-child(2){height:12px}.sparkline i:nth-child(3){height:10px}.sparkline i:nth-child(4){height:15px}.sparkline i:nth-child(5){height:17px}.sparkline i:nth-child(6){height:19px}.sparkline i:nth-child(7){height:22px}
  .verified-banner { margin: 9px 10px 0; height: 31px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--green); background: rgba(57,217,138,.055); border: 1px solid rgba(57,217,138,.15); font-size: 8.5px; font-weight: 650; }

  /* Automate */
  .automate-layout { position: relative; z-index: 2; display: grid; grid-template-columns: 1.35fr .92fr; gap: 18px; height: calc(100% - 112px); padding-top: 19px; }
  .flow-panel, .compile-panel { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: rgba(7,7,13,.72); }
  .flow-panel { background-image: radial-gradient(rgba(255,255,255,.1) .8px, transparent .8px); background-size: 17px 17px; }
  .flow-toolbar { background: rgba(9,9,16,.88); position: relative; z-index: 8; }
  .flow-lines { position: absolute; inset: 38px 0 0; width: 100%; height: calc(100% - 38px); z-index: 1; }
  .flow-lines path { fill: none; stroke: rgba(77,101,255,.75); stroke-width: 2; stroke-dasharray: 7 7; animation: dash 1.1s linear infinite; filter: drop-shadow(0 0 3px rgba(62,87,255,.5)); }
  .flow-node { position: absolute; z-index: 3; width: 180px; height: 68px; border-radius: 11px; border: 1px solid rgba(255,255,255,.11); background: #10101a; padding: 10px 10px 10px 48px; display: flex; align-items: center; box-shadow: 0 12px 25px rgba(0,0,0,.26); animation: nodeIn .45s ease both; }
  .flow-node-icon { position: absolute; left: 10px; top: 16px; width: 31px; height: 31px; border-radius: 8px; display: grid; place-items: center; }
  .flow-node small { display: block; font: 750 6.5px/1 ui-monospace, monospace; letter-spacing: .11em; margin-bottom: 4px; }.flow-node strong { display: block; font-size: 11px; }.flow-node em { display: block; font: 500 7.5px/1.4 ui-monospace, monospace; font-style: normal; color: var(--dim); margin-top: 3px; white-space: nowrap; }
  .flow-node--trigger { border-color: rgba(83,104,255,.28); }.flow-node--trigger .flow-node-icon { color: var(--blue-soft); background: rgba(62,87,255,.11); }.flow-node--trigger small { color: var(--blue-soft); }
  .flow-node--logic { border-color: rgba(180,145,255,.25); }.flow-node--logic .flow-node-icon { color: var(--violet); background: rgba(180,145,255,.09); }.flow-node--logic small { color: var(--violet); }
  .flow-node--action { border-color: rgba(57,217,138,.22); }.flow-node--action .flow-node-icon { color: var(--green); background: rgba(57,217,138,.08); }.flow-node--action small { color: var(--green); }
  .node-trigger { left: 28px; top: 92px; }.node-logic { left: 285px; top: 164px; animation-delay: .12s; }.node-action-one { right: 25px; top: 86px; animation-delay: .24s; }.node-action-two { right: 25px; bottom: 28px; animation-delay: .34s; }
  .node-port { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #161625; border: 2px solid var(--blue-soft); top: 30px; }.node-port--left { left: -5px; }.node-port--right { right: -5px; }
  .flow-running { position: absolute; left: 28px; bottom: 22px; color: var(--green); font: 730 7.5px/1 ui-monospace, monospace; letter-spacing: .09em; display: flex; align-items: center; gap: 6px; }.flow-running span { width: 6px; height: 6px; background: var(--green); border-radius: 50%; animation: blink 1.2s infinite; box-shadow: 0 0 8px rgba(57,217,138,.7); }
  .compile-head span { color: var(--blue-soft); border: 1px solid rgba(83,104,255,.2); background: rgba(62,87,255,.08); padding: 3px 6px; border-radius: 4px; }
  .compile-panel--hardware { overflow: hidden; }
  .esp-illustration { position: relative; height: 205px; margin: 2px 8px -4px; display: flex; align-items: center; justify-content: center; }
  .esp-illustration > svg { width: 100%; height: 100%; position: relative; z-index: 2; overflow: visible; animation: boardFloat 2.5s ease-in-out infinite; filter: drop-shadow(0 18px 24px rgba(0,0,0,.45)); }
  .pcb-traces path { fill:none;stroke:#7790ff;stroke-width:1;stroke-dasharray:4 5;animation:dash .9s linear infinite;filter:drop-shadow(0 0 2px rgba(62,87,255,.8)) }.pin-bank circle:first-child{fill:#d8b75a}.pin-bank .pin-hole{fill:#181a24}.pin-bank text{fill:#8da0ff;font-family:ui-monospace,monospace}.antenna path{fill:none;stroke:#d7b85b;stroke-width:2}.esp-led{filter:drop-shadow(0 0 5px currentColor)}.esp-led--power{animation:blink 1.6s infinite}.esp-led--data{animation:blink .55s infinite}
  .esp-signal { position:absolute;right:17%;top:24%;border:1.5px solid rgba(130,148,255,.65);border-left-color:transparent;border-bottom-color:transparent;border-radius:50%;transform:rotate(-45deg);animation:espSignal 1.6s ease-out infinite; }.esp-signal--one{width:24px;height:24px}.esp-signal--two{width:41px;height:41px;right:14%;top:20%;animation-delay:.16s}.esp-signal--three{width:58px;height:58px;right:11%;top:16%;animation-delay:.32s}
  .esp-data-tag { position:absolute;z-index:4;display:flex;align-items:center;gap:5px;padding:5px 7px;border-radius:6px;background:rgba(6,7,14,.94);border:1px solid rgba(255,255,255,.09);box-shadow:0 8px 18px rgba(0,0,0,.35);font:650 6.7px/1 ui-monospace,monospace;color:rgba(255,255,255,.55);animation:riseIn .45s ease both}.esp-data-tag--code{left:3px;top:23px;color:var(--violet)}.esp-data-tag--mqtt{right:3px;bottom:26px;color:var(--green);animation-delay:.3s}
  .code-window { margin: 14px 12px 12px; padding: 12px 10px; min-height: 135px; background: #05050a; border: 1px solid rgba(255,255,255,.065); border-radius: 9px; font: 500 8.5px/1.9 ui-monospace, monospace; color: rgba(255,255,255,.55); overflow: hidden; }
  .code-window > div { animation: codeIn .35s ease both; }.code-window > div:nth-child(2){animation-delay:.12s}.code-window > div:nth-child(3){animation-delay:.24s}.code-window > div:nth-child(4){animation-delay:.36s}.code-window > div:nth-child(5){animation-delay:.48s}
  .code-window i { display: inline-block; width: 22px; color: rgba(255,255,255,.17); font-style: normal; }.code-purple{color:var(--violet)}.code-blue{color:var(--blue-soft)}.code-amber{color:var(--amber)}.code-green{color:var(--green)}
  .compile-progress { margin: 0 12px; height: 3px; background: rgba(255,255,255,.07); border-radius: 5px; overflow: hidden; }.compile-progress span { display: block; height: 100%; width: 100%; background: var(--blue); animation: compile 1.4s .2s ease both; box-shadow: 0 0 8px rgba(62,87,255,.8); }
  .compile-result { margin: 12px; padding: 10px; border-radius: 9px; background: rgba(57,217,138,.055); border: 1px solid rgba(57,217,138,.16); color: var(--green); display: flex; align-items: center; gap: 8px; animation: riseIn .4s 1.2s ease both; }.compile-result strong{display:block;font-size:10px}.compile-result small{display:block;margin-top:2px;color:rgba(57,217,138,.48);font:600 7px/1 ui-monospace,monospace}

  /* Autonomous */
  .autonomous-layout { position: relative; z-index: 2; height: calc(100% - 110px); padding-top: 18px; display: grid; grid-template-rows: 1fr auto; gap: 12px; }
  .goal-card { width: 27%; min-width: 250px; position: absolute; left: 0; top: 18px; bottom: 76px; padding: 23px 20px; border: 1px solid rgba(80,103,255,.22); border-radius: 14px; background: linear-gradient(145deg, rgba(62,87,255,.10), rgba(255,255,255,.025)); display: flex; flex-direction: column; justify-content: center; }
  .goal-icon { width: 45px; height: 45px; border-radius: 12px; display: grid; place-items: center; color: var(--blue-soft); background: rgba(62,87,255,.12); border: 1px solid rgba(80,102,255,.24); margin-bottom: 14px; }
  .goal-card > small { font: 750 7.5px/1 ui-monospace, monospace; color: var(--blue-soft); letter-spacing: .13em; }.goal-card h3 { font-size: 18px; line-height: 1.3; margin: 9px 0 16px; letter-spacing: -.025em; }
  .goal-state { display: flex; align-items: center; gap: 6px; color: var(--green); font: 720 7px/1 ui-monospace, monospace; letter-spacing: .09em; }.goal-state span { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 7px rgba(57,217,138,.7); animation: blink 1.3s infinite; }
  .loop-steps { position: absolute; left: 31%; right: 0; top: 18px; bottom: 76px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; align-items: stretch; }
  .loop-step { position: relative; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); padding: 19px 16px; display: flex; flex-direction: column; justify-content: center; animation: riseIn .48s var(--delay) ease both; }
  .loop-number { position: absolute; top: 11px; right: 12px; font: 700 9px/1 ui-monospace, monospace; color: rgba(255,255,255,.15); }.loop-icon { width: 37px; height: 37px; border-radius: 10px; display: grid; place-items: center; color: var(--blue-soft); background: rgba(62,87,255,.09); border: 1px solid rgba(76,98,255,.16); margin-bottom: 11px; }
  .loop-step strong { font-size: 14px; }.loop-step p { color: var(--dim); font-size: 9px; line-height: 1.5; margin: 6px 0 0; }.loop-arrow { position: absolute; z-index: 4; right: -17px; top: 50%; transform: translateY(-50%); color: var(--blue); filter: drop-shadow(0 0 5px rgba(62,87,255,.55)); }
  .autonomous-footer { position: absolute; bottom: 0; left: 0; right: 0; height: 64px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }.autonomous-footer > div { display: flex; align-items: center; gap: 10px; padding: 10px 13px; background: rgba(255,255,255,.028); border: 1px solid rgba(255,255,255,.065); border-radius: 10px; color: var(--green); }.autonomous-footer strong,.autonomous-footer small{display:block}.autonomous-footer strong{font-size:10px;color:rgba(255,255,255,.68)}.autonomous-footer small{font-size:8px;color:var(--dim);margin-top:2px}

  /* Outro */
  .outro-scene { display: flex; align-items: center; flex-direction: column; justify-content: center; text-align: center; padding-bottom: 78px; }
  .outro-mark { width: 86px; height: 86px; position: relative; margin-bottom: 14px; }.outro-mark img { width: 86px; height: 86px; border-radius: 22px; position: relative; z-index: 2; object-fit: cover; box-shadow: 0 20px 55px rgba(0,0,0,.6); }.outro-logo-glow { position: absolute; inset: -28px; border-radius: 50%; background: rgba(62,87,255,.28); filter: blur(28px); animation: blink 1.7s ease-in-out infinite; }
  .outro-wordmark { font-size: 30px; font-weight: 850; letter-spacing: -.055em; }.outro-wordmark span { color: var(--blue-soft); }
  .outro-scene h2 { font-size: clamp(37px, 4.3vw, 62px); letter-spacing: -.052em; line-height: 1; margin: 13px 0 10px; }.outro-scene h2 span { color: var(--blue-soft); }.outro-scene > p { font-size: 11px; color: var(--muted); letter-spacing: .1em; margin: 0 0 19px; text-transform: uppercase; }
  .outro-link { display: flex; align-items: center; gap: 9px; color: rgba(255,255,255,.78); background: rgba(62,87,255,.11); border: 1px solid rgba(76,97,255,.28); border-radius: 9px; padding: 10px 15px; font: 650 10px/1 ui-monospace, monospace; box-shadow: 0 0 28px rgba(62,87,255,.12); }

  @keyframes sceneIn { from { opacity: 0; transform: scale(.985); filter: blur(4px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
  @keyframes riseIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
  @keyframes slideRight { from { opacity:0; transform:translateX(-16px) } to { opacity:1; transform:translateX(0) } }
  @keyframes slideLeft { from { opacity:0; transform:translateX(16px) } to { opacity:1; transform:translateX(0) } }
  @keyframes nodeIn { from { opacity:0; transform:scale(.92) } to { opacity:1; transform:scale(1) } }
  @keyframes eventIn { from { opacity:0; transform:translateX(12px) } to { opacity:1; transform:translateX(0) } }
  @keyframes codeIn { from { opacity:0; transform:translateX(-6px) } to { opacity:1; transform:translateX(0) } }
  @keyframes progress { from { width:0 } to { width:100% } }
  @keyframes compile { from { width:0 } to { width:100% } }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes logoRing { 0%,100%{transform:scale(.96);opacity:.5} 50%{transform:scale(1.08);opacity:1} }
  @keyframes corePulse { 0%,100%{transform:scale(.92);opacity:.45} 50%{transform:scale(1.12);opacity:.9} }
  @keyframes heroFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  @keyframes deviceFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  @keyframes boardFloat { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-4px) rotate(1deg)} }
  @keyframes wifiWave { 0%{opacity:0;transform:translateX(-50%) scale(.7)} 45%{opacity:.8} 100%{opacity:0;transform:translateX(-50%) scale(1.13)} }
  @keyframes espSignal { 0%{opacity:0;transform:rotate(-45deg) scale(.6)} 45%{opacity:.9} 100%{opacity:0;transform:rotate(-45deg) scale(1.18)} }
  @keyframes spin { to { transform:rotate(360deg) } }
  @keyframes dash { to { stroke-dashoffset:-14 } }
`
