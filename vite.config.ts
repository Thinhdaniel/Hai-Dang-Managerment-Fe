import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
    cacheDir: process.env.VITE_CACHE_DIR || '.vite-cache',
    plugins: [react(), tailwindcss()],
    server: {
        // Khóa cứng IPv4 + cổng: máy này hay dính 2 bẫy môi trường —
        //  (1) `npm run dev` trần bind ::1 (IPv6) trong khi tab mở 127.0.0.1 → HMR không nối được,
        //      @vite/client rơi vào vòng lặp sendError "reading 'send'" hàng chục nghìn lỗi, tràn RAM;
        //  (2) nhiều terminal cùng `npm run dev` → server thứ 2 lặng lẽ nhảy sang 5174/5175 rồi tranh nhau.
        // host cố định = luôn IPv4; strictPort = instance thứ 2 CHẾT NGAY với lỗi rõ ràng thay vì đổi cổng.
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        // Vite 8 tự bật console forwarding trong môi trường agent. Khi HMR mất kết nối,
        // cơ chế này có thể tự phát sinh vòng lặp unhandled-rejection qua WebSocket.
        forwardConsole: false,
    },
    resolve: {
        dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    const normalizedId = id.replace(/\\/g, '/');

                    if (normalizedId.includes('/node_modules/')) {
                        if (
                            normalizedId.includes('/node_modules/react/') ||
                            normalizedId.includes('/node_modules/react-dom/') ||
                            normalizedId.includes('/node_modules/react-router/') ||
                            normalizedId.includes('/node_modules/react-router-dom/')
                        ) {
                            return 'vendor-react';
                        }

                        if (
                            normalizedId.includes('/node_modules/@ant-design/icons/') ||
                            normalizedId.includes('/node_modules/@ant-design/icons-svg/')
                        ) {
                            return 'vendor-icons';
                        }

                        if (
                            normalizedId.includes('/node_modules/@ant-design/') ||
                            normalizedId.includes('/node_modules/@ctrl/tinycolor/')
                        ) {
                            return 'vendor-theme';
                        }

                        if (normalizedId.includes('/node_modules/antd/')) {
                            return 'vendor-antd';
                        }

                        if (
                            normalizedId.includes('/node_modules/@rc-component/') ||
                            normalizedId.includes('/node_modules/rc-')
                        ) {
                            return 'vendor-rc';
                        }

                        if (normalizedId.includes('/node_modules/@tanstack/')) {
                            return 'vendor-query';
                        }

                        // zxing chi dung cho quet QR (ScanTransferModal lazy) -> tach chunk rieng, tai khi can
                        if (normalizedId.includes('/node_modules/@zxing/')) {
                            return 'vendor-zxing';
                        }

                        if (
                            normalizedId.includes('/node_modules/jspdf/') ||
                            normalizedId.includes('/node_modules/fflate/') ||
                            normalizedId.includes('/node_modules/fast-png/') ||
                            normalizedId.includes('/node_modules/canvg/') ||
                            normalizedId.includes('/node_modules/dompurify/') ||
                            normalizedId.includes('/node_modules/html2canvas/')
                        ) {
                            return 'vendor-pdf';
                        }

                        return 'vendor';
                    }
                },
            },
        },
    },
});
