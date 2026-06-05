import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
    cacheDir: process.env.VITE_CACHE_DIR || '.vite-cache',
    plugins: [react(), tailwindcss()],
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

                        return 'vendor';
                    }
                },
            },
        },
    },
});
