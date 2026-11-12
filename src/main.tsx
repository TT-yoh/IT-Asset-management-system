import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/api';
import App from './App';
import './index.css';
import { installModalA11y } from './lib/modal-a11y';
import { initTheme } from './components/ui/ThemeToggle';

initTheme();
installModalA11y();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
