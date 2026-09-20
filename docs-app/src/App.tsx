import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import DocsPage from './pages/DocsPage'
import RolesPage from './pages/RolesPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDocsPage from './pages/ProjectDocsPage'
import { useDocsStore } from './store'
import { getShareToken } from './api/documents'

export default function App() {
  // 初始化分享模式：在 docs-app SPA 挂载时统一读取一次 ?share= 参数，
  // 写入 store；ProjectDocsPage 及各组件由此判断是否进入只读分享模式。
  const setShareMode = useDocsStore((s) => s.setShareMode)
  useEffect(() => {
    const token = getShareToken()
    setShareMode(token)
  }, [])

  return (
    <Routes>
      {/* 项目首页 */}
      <Route path="/" element={<ProjectsPage />} />
      {/* 文档浏览页 */}
      <Route path="/docs" element={<DocsPage />} />
      {/* /d/:code → 项目独立文档管理/查看页面（支持 ?share= 免登录只读模式） */}
      <Route path="/d/:code" element={<ProjectDocsPage />} />
      <Route path="/d/:code/*" element={<ProjectDocsPage />} />
      <Route path="/roles" element={<RolesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
