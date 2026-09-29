import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import DocsPage from './pages/DocsPage'
import RolesPage from './pages/RolesPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDocsPage from './pages/ProjectDocsPage'
import AgentDocPreview from './pages/AgentDocPreview'
import { ImageLightbox } from './components/ImageLightbox'
import { useDocsStore } from './store'
import { getShareToken } from './api/documents'

export default function App() {
  // 同步分享模式：监听 location.search，确保 SPA 内部路由跳转（含 query 增删）后
  // shareMode 与当前 URL 的 ?share= 一致。仅在 App 首次挂载时读取一次会导致：
  // 用户先打开带 ?share=<token> 的链接（Agent 菜单预览、分享链接等），再在同一 SPA 内
  // 跳转到不带 share 的页面时，shareMode 残留为 true，整个 docs-app 被锁定为只读。
  // 这里以 location.search 作为依赖触发即可：项目主页 / 登录用户编辑页 / 分享预览页
  // 三种入口的 query 互不影响，依赖收敛且不会引入额外副作用。
  const setShareMode = useDocsStore((s) => s.setShareMode)
  const location = useLocation()
  useEffect(() => {
    const token = getShareToken()
    setShareMode(token)
  }, [location.search, setShareMode])

  return (
    <>
      <Routes>
        {/* 项目首页 */}
        <Route path="/" element={<ProjectsPage />} />
        {/* 文档浏览页 */}
        <Route path="/docs" element={<DocsPage />} />
        {/* /d/:code → 项目独立文档管理/查看页面（支持 ?share= 免登录只读模式） */}
        <Route path="/d/:code" element={<ProjectDocsPage />} />
        <Route path="/d/:code/*" element={<ProjectDocsPage />} />
        {/* /preview/doc/:code → Agent 端专用只读预览（专门适配 Agent WebView，无协同编辑） */}
        <Route path="/preview/doc/:code" element={<AgentDocPreview />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* 全局图片放大查看器：单例，订阅模块级 openImageLightbox() 事件。
          渲染在 Routes 之外、fixed 定位覆盖整个视屏；任何路由下点图都生效。 */}
      <ImageLightbox />
    </>
  )
}
