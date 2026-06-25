# Monaco 编辑器修复

## 问题
工作流中 JavaScript 可视化编辑器无法显示，编辑区域为空白。

## 原因
使用了 `monacoRefs.value[idx]` 来获取 DOM 元素，但该引用未正确设置。

## 修复
- 使用 `document.getElementById()` 直接获取 DOM 元素
- 删除未使用的 `monacoRefs` 和 `setMonacoRef` 函数

## 修改文件
- `web/src/views/work-orders/WorkOrderWorkflows.vue`

## 测试
1. 打开工作流配置页面
2. 添加"执行 JavaScript"动作
3. 选择"切换到可视化配置"
4. Monaco 编辑器应该正常显示并可编辑
