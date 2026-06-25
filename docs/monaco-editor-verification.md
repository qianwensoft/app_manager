# Monaco Editor 配置验证清单

## ✅ 配置完成

### 已安装的依赖

```bash
✅ monaco-editor@0.55.1
✅ vite-plugin-monaco-editor
```

### 已更新的文件

```bash
✅ web/vite.config.js - 添加 Monaco Editor 插件配置
✅ web/src/views/data/DatasetForm.vue - 集成 Monaco Editor
✅ web/src/components/MonacoSQLEditor.vue - 编辑器组件（已创建）
```

---

## 🚀 启动应用

### 1. 重启开发服务器

如果开发服务器正在运行，需要重启以加载新配置：

```bash
# 停止当前服务器 (Ctrl+C)
# 然后重新启动
cd web
npm run dev
```

### 2. 清除缓存（如果仍有问题）

```bash
# 清除 Vite 缓存
rm -rf web/node_modules/.vite

# 重新启动
cd web
npm run dev
```

---

## 🧪 验证步骤

### 步骤 1: 检查控制台

启动后检查浏览器控制台，**不应该**看到：
- ❌ "Failed to resolve import monaco-editor"
- ❌ "Cannot find module 'monaco-editor'"

**应该**看到：
- ✅ 正常的 Vite 开发服务器输出
- ✅ 没有 Monaco 相关错误

### 步骤 2: 访问数据集管理

1. 打开浏览器访问 http://localhost:3000
2. 登录系统（admin / admin123）
3. 进入"数据栈" → "数据集"
4. 点击"新建数据集"

### 步骤 3: 测试 Monaco Editor

1. **基本配置**
   - 填写编码：`test_query`
   - 填写名称：`测试查询`
   - 选择数据源：任意已有数据源
   - 数据形态选择：**动态 SQL** ⭐

2. **查看编辑器**
   
   应该看到：
   ```
   ┌─────────────────────────────────────┐
   │ SQL 定义    [快速插入][格式化][模板] │
   ├───────────────────┬─────────────────┤
   │                   │  📋 参数 (0)     │
   │ Monaco Editor     │                  │
   │ (深色主题)        │  📦 可选块 (0)   │
   │                   │  🔧 Schema       │
   │ [编辑区域]        │                  │
   └───────────────────┴─────────────────┘
   ```

3. **输入测试 SQL**
   ```sql
   SELECT * FROM users
   WHERE 1=1
     /*? AND status = :status ?*/
     /*? AND name LIKE :keyword ?*/
   ORDER BY id DESC
   ```

4. **验证功能**
   - ✅ 语法高亮正常显示（关键字蓝色、字符串绿色等）
   - ✅ 右侧参数面板显示 2 个参数
   - ✅ 参数标记为"可选"
   - ✅ 代码可以正常编辑

5. **测试 Schema 生成**
   - 点击"自动生成 Schema"按钮
   - 应该在 param_schema 字段看到生成的 JSON Schema

6. **保存数据集**
   - 点击"保存"按钮
   - 应该保存成功

---

## 🐛 问题排查

### 问题 1: 编辑器不显示

**症状**: SQL 定义区域空白

**排查**:
```bash
# 1. 检查浏览器控制台是否有错误
# 2. 检查网络请求是否正常加载 Monaco 资源
# 3. 检查容器高度是否为 0
```

**解决**: 
- F12 打开开发者工具 → Console 查看错误
- 如有错误，查看 `docs/monaco-editor-setup.md` 中的常见问题

### 问题 2: 语法高亮不工作

**症状**: 代码显示为纯文本，没有颜色

**排查**:
```javascript
// 在 MonacoSQLEditor.vue 中检查
console.log('Language:', editor.getModel().getLanguageId())
// 应该输出: "sql"
```

**解决**:
- 检查 `vite.config.js` 中的 `languageWorkers` 包含 `'sql'`
- 重启开发服务器

### 问题 3: 参数提取不工作

**症状**: 右侧参数面板始终显示 0 个参数

**排查**:
```javascript
// 检查 analyzeSQL 函数是否被调用
console.log('Analyzing SQL:', sql)
console.log('Extracted params:', extractedParams.value)
```

**解决**:
- 检查 SQL 中是否使用了 `:param_name` 格式
- 检查 `@params-changed` 事件是否正确触发

### 问题 4: 模块解析错误

**症状**: 
```
Failed to resolve import "monaco-editor"
```

**解决**:
```bash
# 完全重新安装
rm -rf node_modules package-lock.json
npm install
npm install monaco-editor
npm install vite-plugin-monaco-editor --save-dev

# 清除缓存
rm -rf node_modules/.vite

# 重启
npm run dev
```

---

## 📊 性能检查

### 开发环境

打开浏览器开发工具 → Network 标签

**正常情况**:
- Monaco Editor 相关文件大小：~500KB - 2MB
- 加载时间：< 3 秒（首次）
- 后续加载：< 500ms（缓存）

**如果加载很慢**:
- 检查网络连接
- 考虑使用 CDN（生产环境）
- 启用浏览器缓存

### 内存使用

打开浏览器开发工具 → Performance → Memory

**正常情况**:
- Monaco Editor 内存：~30-50MB
- 编辑器实例：每个 ~10MB

**如果内存过高**:
- 确保编辑器实例被正确销毁（onBeforeUnmount）
- 检查是否有内存泄漏

---

## ✨ 功能验证

### 基础功能

- [ ] 编辑器正常显示
- [ ] 语法高亮工作
- [ ] 可以输入和编辑代码
- [ ] 保存功能正常

### 高级功能

- [ ] 参数自动提取
- [ ] 可选/必需参数识别
- [ ] Schema 自动生成
- [ ] 参数定位功能
- [ ] 快速插入工具
- [ ] SQL 模板应用
- [ ] 代码格式化（Ctrl+Shift+F）
- [ ] 智能补全（Ctrl+Space）

### 集成功能

- [ ] 数据集保存
- [ ] 数据集加载
- [ ] param_schema 同步
- [ ] 与现有功能兼容

---

## 📝 下一步

### 如果一切正常

✅ 恭喜！Monaco Editor 已成功集成

**可以**:
- 创建和编辑动态 SQL 数据集
- 使用所有编辑器功能
- 自动生成参数 Schema
- 正常保存和使用数据集

### 如果遇到问题

1. 查看 `docs/monaco-editor-setup.md` - 详细配置说明
2. 查看 `docs/monaco-sql-editor-guide.md` - 编辑器使用指南
3. 查看浏览器控制台错误信息
4. 检查 Vite 配置是否正确

### 推荐的后续优化

- [ ] 添加 SQL 语法验证
- [ ] 添加表名和字段名自动补全
- [ ] 添加 SQL 执行计划预览
- [ ] 优化加载性能（CDN / 懒加载）
- [ ] 添加自定义主题切换

---

## 🎉 完成标志

当你看到以下情况时，说明配置完全成功：

1. ✅ 开发服务器启动无错误
2. ✅ 浏览器控制台无 Monaco 相关错误
3. ✅ 数据集表单中看到专业的代码编辑器
4. ✅ 语法高亮正常工作
5. ✅ 参数自动提取工作
6. ✅ Schema 自动生成工作
7. ✅ 可以正常保存数据集

**恭喜！你现在可以享受专业的 SQL 编辑体验了！** 🚀

---

**创建日期**: 2024-06-09  
**状态**: ✅ 配置完成，等待验证
