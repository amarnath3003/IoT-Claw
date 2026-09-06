import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import IoTClawShowcase from './showcase/IoTClawShowcase'
import './index.css'

const isShowcase = new URLSearchParams(window.location.search).has('showcase')

// Register Service Worker for PWA + Push Notifications
if (!isShowcase && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[SW] Registered, scope:', reg.scope))
      .catch((err) => console.warn('[SW] Registration failed:', err))
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isShowcase ? <IoTClawShowcase /> : <App />}
  </React.StrictMode>
)
