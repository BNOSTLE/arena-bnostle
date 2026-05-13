import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { installStorageShim } from './lib/storage.js'

// Instala a API window.storage que o App usa
installStorageShim()

// Registra o service worker pro PWA (só em produção)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW falhou:', err)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)