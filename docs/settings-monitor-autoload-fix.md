# Settings 页面监控标签自动加载修复

## 问题描述

当用户直接访问 `http://192.168.1.105:3000/settings?tab=monitor` 或在监控标签页刷新页面时，监控数据不会自动加载，需要手动切换到其他标签再切回来才能触发加载。

## 原因分析

原实现中，监控数据的加载只在 `watch(activeTab)` 中触发，而 `onMounted` 时没有检查初始标签是否为 `monitor`。

**原代码逻辑**:
```javascript
// onMounted 中没有检查初始标签
watch(activeTab, (tab) => {
  if (tab === 'monitor' && !monitorLoaded) {
    monitorLoaded = true
    loadMonitor()
  }
})
```

## 解决方案

在 `onMounted` 钩子中添加初始标签检查，如果初始标签是 `monitor`，立即加载监控数据。

**修复后的代码**:
```javascript
onMounted(async () => {
  // 加载其他数据...
  loadUpdates()
  loadSystemInfo()

  // 如果初始标签是 monitor，加载监控数据
  if (activeTab.value === 'monitor') {
    monitorLoaded = true
    loadMonitor()
  }
})
```

## 测试场景

### 场景 1: 直接访问监控标签
- URL: `http://192.168.1.105:3000/settings?tab=monitor`
- 预期: 页面加载后自动显示监控数据（Agent 连接趋势、API 调用趋势等）
- ✅ 已修复

### 场景 2: 在监控标签页刷新
- 操作: 在监控标签页按 F5 或点击浏览器刷新按钮
- 预期: 刷新后监控数据自动重新加载
- ✅ 已修复

### 场景 3: 切换标签
- 操作: 从其他标签切换到监控标签
- 预期: 第一次切换时加载数据
- ✅ 原有功能保持正常

## 实现细节

### activeTab 初始化
```javascript
const activeTab = ref(route.query.tab || 'register')
```
- 从 URL 查询参数 `tab` 读取初始值
- 默认为 `'register'`

### 加载逻辑
1. **首次切换到监控标签** (通过 watch): 加载数据并设置 `monitorLoaded = true`
2. **直接访问监控标签** (通过 onMounted): 检查初始标签，如果是 monitor 则加载数据
3. **后续切换**: 由于 `monitorLoaded` 已为 true，不会重复加载

### 延迟加载的好处
- 减少初始页面加载时间
- 监控数据查询较重，按需加载避免不必要的服务器请求
- 保持标志 `monitorLoaded` 避免重复加载

## 相关文件

- `web/src/views/Settings.vue`

## 构建状态

- ✅ 前端代码修复完成
- ✅ 无需服务器端更改
- ✅ 测试通过
