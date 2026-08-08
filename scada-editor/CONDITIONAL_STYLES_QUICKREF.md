# 条件样式快速参考卡

## 🎯 一句话说明
根据表达式动态设置 SCADA 元素颜色（如：`Number(text) > Number(ext.max)` 时显示红色）

## 📍 在哪里配置
选择元素 → 右侧属性面板 → **「条件样式」** 区域 → 点击「+ 添加规则」

## 🔤 表达式变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `v` | 绑定的数值 | `v > 80` |
| `text` | 显示的文本 | `Number(text) > 100` |
| `ext.key` | 本组件扩展数据 | `Number(text) > Number(ext.max)` |
| `el(name, prop)` | 其他组件属性 | `el('配置', 'extData.threshold')` |

## 💡 5 秒上手示例

```javascript
// 规则 1: 高温红色
条件: Number(text) > 80
颜色: #ff0000

// 规则 2: 正常绿色
条件: true
颜色: #4caf50
```

## ⚠️ 重要提示

1. **规则顺序很重要** - 第一个匹配的规则生效
2. **记得类型转换** - 用 `Number(text)` 而不是 `text`
3. **最后加兜底规则** - `条件: true` 设置默认颜色
4. **开启实时数据** - 编辑器中需要打开「实时数据」开关才能预览

## 📖 完整文档
- 使用指南：`scada-editor/CONDITIONAL_STYLES_GUIDE.md`
- 技术实现：`scada-editor/CONDITIONAL_STYLES_IMPLEMENTATION.md`
- 功能总结：`scada-editor/CONDITIONAL_STYLES_SUMMARY.md`
