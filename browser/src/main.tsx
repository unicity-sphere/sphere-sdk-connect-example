import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@unicitylabs/sphere-ui/styles';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
