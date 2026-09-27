import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { consumeHubHandoff } from './lib/arara'
import './index.css'

// Entrada pelo Arara Hub: troca o código pela sessão ANTES de montar, para o
// app já iniciar autenticado. Loads normais (sem código na URL) são instantâneos.
void (async () => {
  try {
    await consumeHubHandoff()
  } catch {
    /* cai na tela de login normalmente */
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
})()
