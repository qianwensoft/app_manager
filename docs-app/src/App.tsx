import { Routes, Route, Navigate } from 'react-router-dom'
import DocsPage from './pages/DocsPage'
import RolesPage from './pages/RolesPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDocsPage from './pages/ProjectDocsPage'

export default function App() {
  return (
    <Routes>
      {/* 项目首页 */}
      <Route path="/" element={<ProjectsPage />} />
      {/* 文档浏览页 */}
      <Route path="/docs" element={<DocsPage />} />
      {/* /d/:code → 项目独立文档管理页面 */}
      <Route path="/d/:code" element={<ProjectDocsPage />} />
      <Route path="/d/:code/*" element={<ProjectDocsPage />} />
      <Route path="/roles" element={<RolesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
