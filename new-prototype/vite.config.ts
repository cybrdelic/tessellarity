import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 3001,
        host: true
    },
    build: {
        target: 'es2022'
    },
    esbuild: {
        target: 'es2022'
    }
});
