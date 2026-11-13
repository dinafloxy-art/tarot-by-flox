import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-root-media-files',
      writeBundle() {
        const mediaFiles = [
          'cloud-loop-alpha.webm',
          'desktop-loop-muted.mp4',
          'desktop-loop-muted.webm',
          'phone-loop-muted.mp4',
          'phone-loop-muted.webm',
          'table-cloud-loop.webm',
          'table-on-cloud.webp',
          'tarot-ambient-loop.mp3'
        ];
        mediaFiles.forEach((file) => {
          if (fs.existsSync(file)) {
            fs.copyFileSync(file, path.join('dist', file));
          }
        });
      }
    }
  ]
});
