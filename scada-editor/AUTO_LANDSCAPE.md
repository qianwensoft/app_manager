# SCADA 自动横屏功能

## 功能说明

在 SCADA 编辑器中为画布添加了根据设备类型自动横屏显示的配置功能。当用户在指定类型的设备上访问预览页或分享页时，画布会自动旋转 90° 显示为横屏模式。

## 使用方法

### 1. 配置画布自动横屏

1. 在 SCADA 编辑器中打开一个组态项目
2. 点击画布空白区域（取消选中任何元件）
3. 在右侧属性面板中找到"画布设置"
4. 在"自动横屏"区域勾选需要自动横屏的设备类型：
   - **手机** - 小屏幕移动设备（< 768px）
   - **平板** - 中等屏幕设备（768px - 1200px）
   - **电脑** - 大屏幕桌面设备（≥ 1200px）

### 2. 预览效果

保存画布后：
- 在**预览页面**（`/preview/:id`）访问时，符合配置的设备会自动横屏显示
- 在**分享页面**（`/share/:token`，已发布的组态）访问时，同样会自动横屏显示

### 3. 工作原理

- **设备检测**：通过 User-Agent 和屏幕尺寸综合判断设备类型
- **横屏判断**：检查当前是否已经是横屏状态（宽 > 高）
- **CSS 旋转**：如果需要横屏且当前是竖屏，通过 CSS `transform: rotate(90deg)` 实现页面旋转
- **响应式**：监听 `resize` 和 `orientationchange` 事件，设备旋转时自动调整

## 技术实现

### 文件修改

1. **类型定义** - `src/types/index.ts`
   - 在 `CanvasData` 接口中添加 `autoLandscape?: ('mobile' | 'tablet' | 'desktop')[]`

2. **设备检测工具** - `src/utils/deviceDetect.ts`（新建）
   - `detectDeviceType()` - 检测当前设备类型
   - `shouldAutoLandscape()` - 判断是否应该自动横屏
   - `isLandscape()` - 判断当前是否横屏状态

3. **属性面板** - `src/components/PropertiesPanel.tsx`
   - 在画布设置区域添加自动横屏配置 UI（多选框）

4. **预览页面** - `src/pages/PreviewPage.tsx`
   - 添加横屏逻辑和 CSS 变换

5. **分享页面** - `src/pages/SharePage.tsx`
   - 添加横屏逻辑和 CSS 变换

### CSS 横屏实现

```typescript
const landscapeContainerStyle: React.CSSProperties = needLandscape ? {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vh',
  height: '100vw',
  transform: 'rotate(90deg) translateY(-100%)',
  transformOrigin: 'top left',
} : {}
```

## 注意事项

1. **浏览器兼容性**：CSS `transform` 在现代浏览器中都支持良好
2. **用户体验**：建议在手机端使用此功能时，引导用户允许屏幕旋转
3. **混合设备**：当用户在多个设备类型之间切换时，功能会自动响应
4. **画布切换**：支持多画布项目，每个画布可以独立配置自动横屏

## 使用场景

- 工业 HMI 界面：许多工业触摸屏是横屏固定安装
- 车载仪表盘：车载显示器通常是横屏
- 监控大屏：需要在手机上查看横向布局的监控画面
- 数据可视化：图表密集的仪表板在横屏下展示效果更好
