import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './global.css';
import { installStaleAssetRecovery } from './core/lib/stale-asset-recovery.ts';

installStaleAssetRecovery();
createRoot(document.getElementById('root')!).render(<App />);
