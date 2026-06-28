// 在浏览器控制台运行此脚本来诊断卡死问题

console.log('=== 工作流编辑卡死诊断 ===');

// 1. 检查是否有无限循环的 watch
console.log('\n1. 检查 Vue 组件状态：');
const app = document.querySelector('#app').__vue__;
console.log('App instance:', app ? '✓ 找到' : '✗ 未找到');

// 2. 检查是否有大量的 DOM 节点
console.log('\n2. DOM 节点统计：');
const totalNodes = document.querySelectorAll('*').length;
console.log('总节点数:', totalNodes);
if (totalNodes > 10000) {
  console.warn('⚠️ DOM 节点过多，可能影响性能');
}

// 3. 检查 Monaco 编辑器实例
console.log('\n3. Monaco 编辑器：');
console.log('Monaco 全局对象:', typeof window.monaco !== 'undefined' ? '✓ 已加载' : '✗ 未加载');

// 4. 检查是否有错误
console.log('\n4. 检查控制台错误（最近 10 条）：');
console.log('请查看上方的红色错误信息');

// 5. 性能测试
console.log('\n5. 页面响应性测试：');
const start = performance.now();
for (let i = 0; i < 1000000; i++) {
  // 空循环
}
const elapsed = performance.now() - start;
console.log('CPU 计算耗时:', elapsed.toFixed(2), 'ms');
if (elapsed > 100) {
  console.warn('⚠️ CPU 可能过载');
} else {
  console.log('✓ CPU 响应正常');
}

// 6. 内存使用
if (performance.memory) {
  console.log('\n6. 内存使用：');
  console.log('已使用:', (performance.memory.usedJSHeapSize / 1048576).toFixed(2), 'MB');
  console.log('总分配:', (performance.memory.totalJSHeapSize / 1048576).toFixed(2), 'MB');
  console.log('限制:', (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2), 'MB');
}

// 7. 检查对话框状态
console.log('\n7. 对话框状态：');
const dialogs = document.querySelectorAll('.el-dialog');
console.log('对话框数量:', dialogs.length);
dialogs.forEach((d, i) => {
  const visible = d.style.display !== 'none';
  console.log(`  对话框 ${i + 1}:`, visible ? '可见' : '隐藏');
});

// 8. 检查是否有未清理的事件监听器
console.log('\n8. 事件监听器建议：');
console.log('打开 Chrome DevTools -> Elements -> Event Listeners');
console.log('查看是否有大量重复的监听器');

console.log('\n=== 诊断完成 ===');
console.log('如果发现异常，请截图控制台并报告');
