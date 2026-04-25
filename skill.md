# Dataset Lab UI Kit - Replication Skill

This document contains everything needed to replicate the **Dark Skeuomorphic / "Control Console"** design system used in the Dataset-Creator-App. 

## 1. Core Concept & Theme
- **Style:** Neumorphic / Skeuomorphic Hardware Console.
- **Lighting:** Constant top-left (↖) light source, creating true-black drop shadows and highlights.
- **Vibe:** Physical hardware, glowing LED indicators, deep terminal screens.
- **Stack:** Tailwind CSS + Vanilla CSS Variables + React.

## 2. Tailwind Configuration
Add these extensions to your `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                neu: {
                    base: '#212529',
                    dark: '#1a1d21',
                    text: '#e0e0e0',
                    dim: '#8a8f98',
                    accent: '#ff6b00',  /* Warm Orange */
                    warning: '#ffb300'
                }
            },
            borderRadius: {
                'xl': '20px',
                '2xl': '30px'
            }
        },
    },
    plugins: [],
}
```

## 3. Global CSS Variables
Add this to your global `index.css` (or `App.css`). It defines the shadow physics, glows, and base surfaces.

```css
@layer base {
  :root {
    --bg-base: #212529;
    --bg-dark: #1a1d21;
    --bg-card: #23272b;

    --text-main: #d8dde6;
    --text-dim: #6b7280;
    --text-muted: #4b5563;

    --accent: #ff6b00;
    --accent-light: #ff8533;
    --accent-glow: rgba(255, 107, 0, 0.35);
    --accent-glow-sm: rgba(255, 107, 0, 0.2);

    /* Shadow Physics */
    --sh-flat: 8px 8px 18px #141619, -8px -8px 18px #2e343b;
    --sh-hover: 12px 12px 24px #141619, -12px -12px 24px #2e343b;
    --sh-press: inset 5px 5px 10px #141619, inset -5px -5px 10px #2e343b;
    --sh-trough: inset 4px 4px 8px #111315, inset -4px -4px 8px #2c323a;
    --sh-deep: inset 6px 6px 14px #0d0f11, inset -6px -6px 14px #2e343b;

    /* Glows */
    --glow: 0 0 14px var(--accent-glow);
    --glow-sm: 0 0 8px var(--accent-glow-sm);
    --glow-green: 0 0 10px rgba(34, 197, 94, 0.4);
    --glow-red: 0 0 10px rgba(239, 68, 68, 0.4);
  }

  body {
    background: var(--bg-base);
    color: var(--text-main);
  }
}
```

## 4. Component Dictionary & JSX Usage

### Surfaces & Layout containers
- `.neu-plate`: The standard raised card/surface.
- `.neu-inset`: A gently pressed-in surface.
- `.neu-section`: Used for major page panels (includes header and body sub-classes).
- `.neu-chunk`: Used for collapsible sub-sections inside panels.

```jsx
<div className="neu-section">
  <div className="neu-section-header">
    <h2>Panel Title</h2>
  </div>
  <div className="neu-section-body">
    <div className="neu-plate p-4">Raised Content</div>
    <div className="neu-chunk mt-4">
       <div className="neu-chunk-header">Collapsible Item</div>
    </div>
  </div>
</div>
```

### Deep Recesses & Terminals
- `.neu-trough`: Deep cut surface (used for tracks, backgrounds for inputs).
- `.neu-deep`: Very deep recess.
- `.neu-terminal`: Deepest surface, styled with green monospace text for logs.

```jsx
<div className="neu-terminal">
  {`> System initialized... \n> Ready.`}
</div>
```

### Buttons
Buttons feature active push-down physics.
- `.neu-btn`: Standard raised button.
- `.neu-btn-primary`: Button with glowing orange accent text.
- `.neu-btn-sm`: Small square/icon button.

```jsx
<button className="neu-btn px-6 py-2">Cancel</button>
<button className="neu-btn-primary px-6 py-2">Execute</button>
<button className="neu-btn-sm"><Icon size={14} /></button>
```

### Inputs & Forms
Inputs are recessed (trough-style) and glow orange when focused.
- `.neu-input`: Single line text input or select dropdown.
- `.neu-textarea`: Multi-line code/prompt input (terminal green text).

```jsx
<input type="text" className="neu-input" placeholder="Enter API Key..." />
<textarea className="neu-textarea" placeholder="Enter prompt template..." />
```

### Indicators & Badges
- **LEDs:** Circular glowing dots for status (`.led`, `.led-on`, `.led-off`, `.led-green`, `.led-red`).
- **Badges:** Small pill tags (`.neu-badge`, `.neu-badge-accent`, `.neu-badge-green`).
- **Stats:** Hardware-style readouts (`.neu-stat`, `.neu-stat-value`, `.neu-stat-label`).

```jsx
{/* Status LED */}
<div className="flex items-center gap-2">
  <div className="led led-green"></div> Online
</div>

{/* Stat Block */}
<div className="neu-stat">
  <div className="neu-stat-value">1,024</div>
  <div className="neu-stat-label">Rows Processed</div>
</div>

{/* Badges */}
<span className="neu-badge neu-badge-accent">v1.0.0</span>
```

### Progress & Alerts
- **Progress Track:** Recessed groove with a glowing fill.
- **Alerts:** Colored frosted glass effect (`.neu-alert-warn`, `.neu-alert-info`).

```jsx
{/* Progress Bar */}
<div className="neu-progress-track w-full">
  <div className="neu-progress-fill" style={{ width: '65%' }}></div>
</div>

{/* Warning Alert */}
<div className="neu-alert-warn mt-4">
  <AlertTriangle size={16} /> Data will be overwritten.
</div>
```

## 5. Composition Example
Here is how you put it all together to create a standard "Control Panel" module:

```jsx
import { Settings, Play } from 'lucide-react';

export function ControlPanel() {
  return (
    <div className="neu-section max-w-lg mx-auto">
      <div className="neu-section-header">
        <h2 className="flex items-center gap-2 text-neu-text font-bold">
          <Settings size={18} className="text-neu-dim" />
          Engine Configuration
        </h2>
        <div className="led led-on"></div>
      </div>
      
      <div className="neu-section-body space-y-6">
        <div className="neu-trough p-4">
          <label className="text-xs font-semibold text-neu-dim uppercase tracking-wider mb-2 block">
            System Prompt
          </label>
          <textarea className="neu-textarea" rows={4} defaultValue="You are an AI..." />
        </div>
        
        <div className="flex justify-between items-center">
          <div className="neu-stat">
            <span className="neu-stat-value text-neu-accent">Ready</span>
            <span className="neu-stat-label">Status</span>
          </div>
          
          <button className="neu-btn-primary px-8 py-3 flex items-center gap-2">
            <Play size={16} /> START
          </button>
        </div>
      </div>
    </div>
  );
}
```
