import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './browser-entry';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
