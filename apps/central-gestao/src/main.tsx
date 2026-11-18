import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { consumirSsoDoHub } from './lib/api'
import './index.css'

// Entrada pelo Hub: troca o código pela sessão antes de montar.
void (async () => {
  await consumirSsoDoHub()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})()
