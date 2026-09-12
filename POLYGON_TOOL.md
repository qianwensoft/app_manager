# SCADA 多边形工具补充文档

## 新增功能

在之前的 SVG 重构基础上，进一步优化了多边形绘制工具，提供了更强大的多边形创建能力。

## 功能特性

### 1. 交互式多边形绘制

#### 基本操作
- **点击添加顶点**: 每次点击在画布上添加一个多边形顶点
- **起点闭合**: 当点击位置距离起点小于 10px 时，自动闭合多边形
- **双击完成**: 双击画布完成多边形绘制
- **Enter 完成**: 按 Enter 键完成绘制（至少需要 3 个顶点）
- **Esc 取消**: 按 Esc 键取消当前绘制

#### 视觉反馈
- **起点标记**: 第一个顶点显示为绿色圆点（半径 4px）
- **其他顶点**: 显示为蓝色圆点（半径 4px）
- **连接线**: 顶点之间自动连接蓝色实线
- **半透明填充**: 绘制过程中显示半透明蓝色填充（rgba(74,158,255,0.1)）
- **实时预览**: 鼠标移动时不触发重绘，保持性能

### 2. 快捷创建正多边形

在属性面板的"路径"部分，提供了快捷按钮：

#### 正多边形
- **三角形 (△)**: 3 边正多边形
- **正方形 (◇)**: 4 边正多边形
- **五边形 (⬟)**: 5 边正多边形
- **六边形 (⬡)**: 6 边正多边形
- **八边形**: 8 边正多边形

#### 特点
- 自动居中于元素当前边界框
- 半径为边界框宽高最小值的 90%
- 顶角向上（旋转 -90°）
- 一键生成，无需手动绘制

### 3. 快捷创建星形

#### 星形选项
- **五角星 (★5)**: 标准五角星
- **六角星 (★6)**: 大卫星
- **八角星 (★8)**: 八芒星

#### 参数
- **外半径**: 边界框宽高最小值的 90%
- **内半径**: 外半径的 40%（可调整凹陷程度）
- **旋转**: 默认 -90°（顶角向上）

### 4. 代码实现

#### pathTools.ts 新增函数

```typescript
// 生成正多边形顶点
export function generateRegularPolygon(
  cx: number,        // 中心点 x
  cy: number,        // 中心点 y
  radius: number,    // 半径
  sides: number,     // 边数
  rotation: number   // 旋转角度（度）
): PathPoint[]

// 生成星形顶点
export function generateStar(
  cx: number,           // 中心点 x
  cy: number,           // 中心点 y
  outerRadius: number,  // 外半径
  innerRadius: number,  // 内半径
  points: number,       // 星形角数
  rotation: number      // 旋转角度（度）
): PathPoint[]
```

#### 使用示例

```javascript
// 创建正五边形
const points = generateRegularPolygon(100, 100, 50, 5, -90)
const pathData = pointsToPathData(points, true)

// 创建五角星
const starPoints = generateStar(100, 100, 50, 20, 5, -90)
const starPathData = pointsToPathData(starPoints, true)
```

## 技术细节

### 正多边形算法

使用三角函数均匀分布顶点：

```typescript
const angleStep = (Math.PI * 2) / sides
for (let i = 0; i < sides; i++) {
  const angle = angleStep * i + rotationRadians
  points.push({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  })
}
```

### 星形算法

交替使用外半径和内半径：

```typescript
const angleStep = Math.PI / points  // 半个扇形角
for (let i = 0; i < points * 2; i++) {
  const angle = angleStep * i + rotationRadians
  const radius = i % 2 === 0 ? outerRadius : innerRadius
  result.push({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  })
}
```

### 起点检测

判断是否点击了起点附近（闭合多边形）：

```typescript
const firstPoint = pathDrawingRef.current.points[0]
const dist = Math.sqrt(
  Math.pow(lx - firstPoint.x, 2) + 
  Math.pow(ly - firstPoint.y, 2)
)
if (dist < 10 && pathDrawingRef.current.points.length >= 3) {
  // 闭合多边形
  handleDoubleClick(e)
}
```

### 键盘快捷键

```typescript
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && pathDrawingRef.current) {
      // 取消绘制
      pathDrawingRef.current = null
      draw()
    }
    if (e.key === 'Enter' && activeTool === 'polygon') {
      if (pathDrawingRef.current?.points.length >= 3) {
        // 完成多边形
        handleDoubleClick({} as React.MouseEvent)
      }
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [activeTool, pathDrawingRef.current])
```

## 用户体验优化

### 1. 视觉引导
- 起点用绿色标记，清晰提示用户可以点击闭合
- 半透明填充让用户实时看到多边形形状
- 顶点圆点醒目易见

### 2. 操作简化
- 点击起点即可闭合，无需精确对齐
- 双击和 Enter 键提供多种完成方式
- Esc 键快速取消，避免误操作

### 3. 预设模板
- 常用多边形一键生成，无需手动绘制
- 星形模板满足装饰性需求
- 所有预设自动适配元素边界

## 应用场景

### 1. 工业图表
- 流程图节点（六边形、菱形）
- 管道连接件
- 仪表盘刻度

### 2. 装饰元素
- 背景图案（星形、多边形拼接）
- 标签、徽章
- 图标、符号

### 3. 数据可视化
- 雷达图外框
- 多维度指标展示
- 区域标记

## 性能考虑

### 1. 绘制优化
- 只在必要时重绘画布（不跟随鼠标移动）
- 使用 requestAnimationFrame 优化动画
- 顶点数量建议不超过 100 个

### 2. 内存优化
- 临时路径数据存储在 ref 中，不触发重渲染
- 完成后清理临时状态
- SVG 元素由浏览器原生优化

## 未来扩展

### 1. 高级编辑
- [ ] 拖动顶点调整形状
- [ ] 插入/删除中间顶点
- [ ] 顶点圆角化
- [ ] 边倒角/倒圆

### 2. 智能辅助
- [ ] 顶点吸附（网格、其他元素）
- [ ] 角度辅助线（45°、90°）
- [ ] 对称绘制模式
- [ ] 自动识别规则形状

### 3. 更多预设
- [ ] 箭头形状
- [ ] 凹多边形模板
- [ ] 自定义星形参数
- [ ] 齿轮形状

## 测试要点

- [x] 点击添加顶点正常
- [x] 点击起点自动闭合
- [x] 双击完成多边形
- [x] Enter 键完成（>=3 顶点）
- [x] Esc 键取消绘制
- [x] 起点绿色标记显示
- [x] 其他顶点蓝色标记
- [x] 半透明填充预览
- [x] 快捷创建正多边形
- [x] 快捷创建星形
- [x] 属性面板按钮工作
- [x] 闭合路径切换生效
- [x] 预览模式正确渲染

## 构建信息

- **构建时间**: 2026-08-29 16:58
- **版本**: v2.3.52+
- **文件大小**: index-CJNkif4c.js (2.89 MB)
- **兼容性**: 现代浏览器（Chrome/Edge/Firefox/Safari）
