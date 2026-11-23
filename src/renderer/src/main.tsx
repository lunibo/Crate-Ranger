import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import './styles/app.css'
import './lib/i18n'

import { queryClient } from './lib/queryClient'
import { persistQueries, restoreQueries } from './lib/queryPersist'

// Gespeicherte Katalogdaten zuerst laden, damit die erste Seite ohne Netzwerk erscheint
// (höchstens 1,5 s warten – hängt IndexedDB, startet die App eben ohne)
await Promise.race([restoreQueries(queryClient), new Promise((r) => setTimeout(r, 1500))])
persistQueries(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>
)
