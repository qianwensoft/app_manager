export default function TestPage() {
  return (
    <div style={{ padding: 20 }}>
      <h1>测试页面</h1>
      <p>如果你能看到这个页面，说明基本的 React 渲染工作正常。</p>
      <p>User Agent: {navigator.userAgent}</p>
      <button onClick={() => alert('点击成功')}>测试按钮</button>
    </div>
  )
}
