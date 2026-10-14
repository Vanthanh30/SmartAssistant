import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App.jsx';
import { sessionKey } from './features/auth/useAuth.js';
import './styles/global.css';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
const client = new QueryClient();
window.addEventListener('session-expired', () => {
  client.cancelQueries({ queryKey: sessionKey });
  client.setQueryData(sessionKey, null);
  client.removeQueries({ predicate: query => query.queryKey[0] !== 'auth' });
});
// Also normalize tabs already loaded through the loopback IP before making session requests.
const localApi = new URL(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1', window.location.origin);
if (import.meta.env.DEV && window.location.hostname === '127.0.0.1' && localApi.hostname === 'localhost') {
  const canonical = new URL(window.location.href);
  canonical.hostname = 'localhost';
  window.location.replace(canonical.href);
} else {
  createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></React.StrictMode>);
}
