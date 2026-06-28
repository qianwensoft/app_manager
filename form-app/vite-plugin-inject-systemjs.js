// Vite plugin to inject SystemJS loader and fix script tags for Android 9
import fs from 'fs';
import path from 'path';

export default function injectSystemJS() {
  return {
    name: 'inject-systemjs',
    transformIndexHtml(html) {
      // Remove type="module" from script tags and add SystemJS loader
      return html
        .replace(/type="module"\s+crossorigin/g, 'crossorigin')
        .replace(/<script crossorigin src="([^"]+)">/g, (match, src) => {
          // Copy SystemJS polyfill to assets
          const systemJSPath = path.resolve(__dirname, 'node_modules/systemjs/dist/s.min.js');
          const targetPath = path.resolve(__dirname, 'dist/assets/systemjs.min.js');

          if (fs.existsSync(systemJSPath) && !fs.existsSync(targetPath)) {
            fs.copyFileSync(systemJSPath, targetPath);
          }

          // Return SystemJS loader + app script
          return `<script src="/form-app/assets/systemjs.min.js"></script>
    <script>System.import('${src}')</script>`;
        });
    },
  };
}
