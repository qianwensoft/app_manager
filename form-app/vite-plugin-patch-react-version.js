// Vite 插件：修复构建产物中访问 React.version 的代码
export default function patchReactVersion() {
  return {
    name: 'patch-react-version',
    enforce: 'post',
    generateBundle(options, bundle) {
      // 遍历所有输出文件
      for (const fileName in bundle) {
        const file = bundle[fileName];

        // 处理所有 JS chunk 文件
        if (file.type === 'chunk' && fileName.endsWith('.js')) {
          let code = file.code;

          // 查找模式：Number(f.version.split(".")[0]) 或 Number(d.version.split(".")[0])
          // 替换为：Number(("18.2.0").split(".")[0])
          const pattern = /Number\((\w+)\.version\.split\(['"]\.['"]\)\[0\]\)/g;
          const matches = code.match(pattern);

          if (matches) {
            console.log(`[patch-react-version] Found ${matches.length} React.version references in ${fileName}`);

            // 替换为安全的默认值
            code = code.replace(pattern, 'Number(("18.2.0").split(".")[0])');

            file.code = code;
            console.log(`[patch-react-version] Patched ${fileName}`);
          }
        }
      }
    }
  };
}
