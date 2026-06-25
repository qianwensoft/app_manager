# SCADA 屏幕自适应功能

## 功能说明

在原有的"固定尺寸"和"适应内容"两种画布模式基础上，新增"屏幕自适应"模式，让 SCADA 画布在预览和发布时自动填充整个屏幕，无边距显示。

## 三种自适应模式对比

### 1. 固定尺寸 (none)
- **编辑器**：按设定的宽高尺寸显示
- **预览/发布**：保持固定尺寸，居中显示，四周有边距和阴影
- **适用场景**：精确尺寸要求的工业 HMI、特定分辨率屏幕

### 2. 适应内容 (fit)
- **编辑器**：按设定的宽高尺寸显示
- **预览/发布**：画布自动调整为元素实际边界大小，去除多余空白，保持边距和阴影
- **适用场景**：动态内容大小、需要紧凑显示的仪表板

### 3. 屏幕自适应 (screen) ⭐ **新增**
- **编辑器**：按设定的宽高尺寸显示（保持设计尺寸）
- **预览/发布**：画布填充整个屏幕，无边距，使用 `fitMode="fill"`
- **适用场景**：
  - 移动端全屏应用
  - 车载仪表盘
  - 工业触摸屏
  - 监控大屏
  - 需要最大化显示区域的场景

## 使用方法

### 1. 在编辑器中配置

1. 打开 SCADA 编辑器
2. 点击画布空白区域（取消选中任何元件）
3. 在右侧"画布属性"面板中找到"画布设置"
4. 在"自适应"下拉框中选择"屏幕自适应"
5. 下方会显示提示：**"画布将在预览时填充整个屏幕，无边距"**

### 2. 预览效果

保存画布后：
- 访问预览页面（`/preview/:id`），画布会填充整个屏幕
- 访问分享页面（`/share/:token`），同样全屏显示
- 与设备类型和屏幕尺寸无关，始终填充可用空间

### 3. 设计建议

使用屏幕自适应模式时的设计建议：

**画布尺寸设计**：
- 建议使用常见的屏幕比例设计画布：
  - 16:9 (1920x1080) - 最常见的横屏比例
  - 16:10 (1920x1200)
  - 4:3 (1024x768) - 传统工控屏
  - 9:16 (1080x1920) - 竖屏手机

**元素布局**：
- 重要内容放在画布中心区域
- 避免将关键元素放在边缘（不同屏幕比例可能会被裁切或拉伸）
- 使用相对定位和百分比尺寸可以获得更好的适配效果

**测试建议**：
- 在不同尺寸和比例的设备上测试效果
- 特别注意横竖屏切换的表现

## 技术实现

### 类型定义
```typescript
// src/types/index.ts
export interface CanvasData {
  // ...
  adaptiveMode?: 'none' | 'scale' | 'fit' | 'screen'  // 新增 'screen'
}
```

### 预览页面逻辑
```typescript
// src/pages/PreviewPage.tsx
{activeCanvas ? (
  activeCanvas.adaptiveMode === 'screen' ? (
    // 屏幕自适应：画布填充整个容器，不留边距
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <CanvasViewer
        canvas={activeCanvas}
        fitContainer
        fitMode="fill"  // 使用 fill 模式拉伸填充
        // ...
      />
    </div>
  ) : (
    // 固定尺寸或适应内容：保持原有边距和阴影
    <div style={{
      boxShadow: '0 0 0 1px var(--border-strong), 0 16px 48px rgba(0,0,0,0.7)',
      borderRadius: 2, flex: 1, alignSelf: 'stretch', overflow: 'hidden'
    }}>
      <CanvasViewer
        canvas={activeCanvas}
        fitContainer
        fitMode="fit"  // 保持宽高比
        // ...
      />
    </div>
  )
) : null}
```

### CanvasViewer 适配逻辑
```typescript
// src/components/CanvasViewer.tsx
const computeZoom = useCallback((cw: number, ch: number) => {
  if (!cw || !ch) return
  const zx = cw / canvas.width
  const zy = ch / canvas.height
  // fitMode='fill' 取最大值（拉伸填充），'fit' 取最小值（保持比例）
  setResolvedZoom(fitMode === 'fill' ? Math.max(zx, zy) : Math.min(zx, zy))
}, [canvas.width, canvas.height, fitMode])
```

## 与自动横屏功能配合

屏幕自适应可以和自动横屏功能完美配合：

**示例场景**：车载仪表盘（横屏显示，全屏无边距）

1. **画布设置**：
   - 自适应模式：屏幕自适应
   - 自动横屏：勾选"手机"
   - 画布尺寸：1920x1080 (16:9)

2. **效果**：
   - 手机竖屏访问时：自动旋转 90°
   - 画布填充整个屏幕（实际是旋转后的横向屏幕）
   - 无任何边距和阴影，沉浸式体验

## 文件修改列表

- `src/types/index.ts` - 扩展 `adaptiveMode` 类型
- `src/components/PropertiesPanel.tsx` - 添加"屏幕自适应"选项和说明
- `src/pages/PreviewPage.tsx` - 根据模式调整容器样式和 fitMode
- `src/pages/SharePage.tsx` - 同预览页面逻辑

## 构建测试

- TypeScript 类型检查：✅ 通过
- Vite 生产构建：✅ 成功
- 包大小：1,795.75 KB (增加约 800 bytes)

## 兼容性

- **向后兼容**：未设置 `adaptiveMode` 的旧画布默认为 `'none'`（固定尺寸），行为不变
- **浏览器兼容**：依赖标准 CSS Flexbox 和 ResizeObserver，现代浏览器全支持
