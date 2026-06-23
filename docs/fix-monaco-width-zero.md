# Monaco 编辑器宽度为0问题修复

## 问题描述
Monaco 编辑器容器显示但宽度为 0，导致编辑器不可见。

## 原因分析
Monaco 编辑器在 DOM 元素尚未完全渲染或在折叠/隐藏状态时初始化，导致容器尺寸为 0。

## 修复方案

### 1. 增加容器尺寸检查
在初始化编辑器前检查容器的 `getBoundingClientRect()`，如果宽度或高度为 0，则延迟重试。

### 2. 分离初始化逻辑
将 Monaco 编辑器的创建逻辑提取为独立函数 `initMonacoEditor`，便于重试。

### 3. 多次调用 layout()
在编辑器创建后多次调用 `editor.layout()`（100ms 和 500ms），确保尺寸正确。

### 4. 启用 automaticLayout
设置 `automaticLayout: true`，让编辑器自动适应容器尺寸变化。

## 代码修改

```javascript
const initJsBuilder = async (idx) => {
  // ... 初始化代码 ...
  
  setTimeout(() => {
    const container = document.getElementById(`monaco-editor-${idx}`)
    if (!container) return

    // 检查容器尺寸
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      // 延迟重试
      setTimeout(() => initMonacoEditor(idx, container), 300)
      return
    }

    initMonacoEditor(idx, container)
  }, 200)
}

const initMonacoEditor = (idx, container) => {
  // 创建编辑器
  const editor = monaco.editor.create(container, {
    automaticLayout: true,  // 自动布局
    // ... 其他选项 ...
  })

  // 多次调用 layout 确保尺寸正确
  setTimeout(() => editor.layout(), 100)
  setTimeout(() => editor.layout(), 500)
}
```

## 修改文件
- `web/src/views/work-orders/WorkOrderWorkflows.vue`

## 测试步骤
1. 打开工作流配置
2. 添加"执行 JavaScript"动作
3. 点击"切换到可视化配置"
4. Monaco 编辑器应该正常显示，宽度正常
5. 可以输入和编辑代码

## 相关问题
如果编辑器仍然显示不正确，可以尝试：
- 手动展开/折叠动作面板
- 刷新页面重新打开
- 检查浏览器控制台是否有错误
