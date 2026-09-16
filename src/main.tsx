import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/vi.js';
import App from './App.tsx';
import './global.css';
import { installStaleAssetRecovery } from './core/lib/stale-asset-recovery.ts';

dayjs.locale('vi');
installStaleAssetRecovery();
createRoot(document.getElementById('root')!).render(<App />);
