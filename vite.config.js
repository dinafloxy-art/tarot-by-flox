import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync, readdirSync } from 'fs';

const copyRootMedia = () => ({
  name: 'copy-root-media',
  closeBundle() {
    const media = /\.(webp|webm|mp4|mp3|jpg|jpeg|png)$/i;
    for (const f of readdirSync('.')) {
      if (media.test(f)) cpSync(f, `dist/${f}`);
    }
    for (const dir of ['hall', 'media']) {
      if (existsSync(dir)) cpSync(dir, `dist/${dir}`, { recursive: true });
    }
  }
});

export default defineConfig({
  plugins: [react(), copyRootMedia()]
});
