// Vite plugin to post-process legacy bundles and remove any remaining ES6 syntax
import fs from 'fs';
import path from 'path';

export default function fixLegacyBundle() {
  return {
    name: 'fix-legacy-bundle',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist/assets');
      if (!fs.existsSync(distDir)) return;

      const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));

      for (const file of files) {
        const filePath = path.join(distDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        // Replace any remaining export statements
        // SystemJS doesn't use export/module.exports, so we just remove them
        if (/\bexport\s+(default|const|let|var|function|class|\{)/.test(content)) {
          console.log(`[fix-legacy] Found exports in ${file}, attempting to fix...`);

          // Remove export statements - SystemJS doesn't need them
          // For 'export default X', keep X but remove the export keyword
          content = content.replace(/\bexport\s+default\s+/g, '');
          // Comment out export { ... }
          content = content.replace(/\bexport\s+\{([^}]+)\}/g, '/* export {$1} */');
          // Remove export keyword from declarations
          content = content.replace(/\bexport\s+(const|let|var|function|class)\s+/g, '$1 ');

          modified = true;
        }

        // Replace import.meta with empty object
        if (/import\.meta/.test(content)) {
          console.log(`[fix-legacy] Found import.meta in ${file}, replacing...`);
          content = content.replace(/import\.meta/g, '({})');
          modified = true;
        }

        if (modified) {
          fs.writeFileSync(filePath, content, 'utf8');
          console.log(`[fix-legacy] Fixed ${file}`);
        }
      }
    },
  };
}
