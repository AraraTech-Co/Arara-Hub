import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import { initTheme } from './lib/theme.js';
import { consumeHubHandoff } from './lib/arara.ts';
import './i18n/index.js';
import './index.css';

initTheme();

const routerBasename =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

// Entrada pelo Arara Hub: troca o código pela sessão ANTES de montar, para o
// app já iniciar autenticado (sem passar pela tela de login). Loads normais
// não têm código na URL e seguem instantâneos.
void (async () => {
  try {
    await consumeHubHandoff();
  } catch {
    /* cai na tela de login normalmente */
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter basename={routerBasename}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>
  );
})();
