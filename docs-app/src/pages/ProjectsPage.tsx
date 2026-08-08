import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Grid, List, FolderOpen, ChevronRight, Layers, Plus, Settings } from 'lucide-react'
import { fetchProjects, fetchProjectCategories } from '../api/documents'
import type { DocumentProject, DocumentProjectCategory } from '../api/types'
import ProjectModal from '../components/ProjectModal'
import CategoryManageModal from '../components/CategoryManageModal'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState<DocumentProject | null>(null)
  const [showCategoryManage, setShowCategoryManage] = useState(false)
  const { data: projects = [] } = useQuery({ queryKey: ['doc-projects'], queryFn: fetchProjects })
  const { data: categories = [] } = useQuery({ queryKey: ['doc-project-categories'], queryFn: fetchProjectCategories })

  // 按分类分组项目
  const projectsByCategory = new Map<number | null, DocumentProject[]>()
  projects.forEach((p) => {
    const key = p.category_id ?? null
    if (!projectsByCategory.has(key)) {
      projectsByCategory.set(key, [])
    }
    projectsByCategory.get(key)!.push(p)
  })

  const handleProjectClick = (project: DocumentProject) => {
    if (project.code) {
      // 优先使用项目 code 跳转到直链页面
      navigate(`/d/${project.code}`)
    } else if (project.root_node_id) {
      // 跳转到关联的文档节点
      navigate(`/docs?node=${project.root_node_id}`)
    } else {
      // 无关联节点，跳转到文档根目录
      navigate('/docs')
    }
  }

  const handleProjectContextMenu = (e: React.MouseEvent, project: DocumentProject) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingProject(project)
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['doc-projects'] })
    qc.invalidateQueries({ queryKey: ['doc-project-categories'] })
    qc.invalidateQueries({ queryKey: ['doc-nodes'] })
  }

  return (
    <div className="projects-page">
      <div className="projects-header">
        <div>
          <h1 className="projects-title">文档项目</h1>
          <p className="projects-subtitle">选择一个项目开始浏览文档</p>
        </div>
        <div className="projects-toolbar">
          <button className="btn" onClick={() => setShowCategoryManage(true)}>
            <Settings size={16} />
            分类管理
          </button>
          <button className="btn" onClick={() => setShowModal(true)}>
            <Plus size={16} />
            新建项目
          </button>
          <button
            className={'btn icon' + (viewMode === 'card' ? ' primary' : '')}
            onClick={() => setViewMode('card')}
            title="卡片视图"
          >
            <Grid size={18} />
          </button>
          <button
            className={'btn icon' + (viewMode === 'list' ? ' primary' : '')}
            onClick={() => setViewMode('list')}
            title="列表视图"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <div className="projects-body">
        {categories.length === 0 && projectsByCategory.size === 0 && (
          <div className="empty-hint">暂无项目</div>
        )}

        {/* 渲染分类及其项目 */}
        {categories.map((cat) => {
          const catProjects = projectsByCategory.get(cat.id) || []
          if (catProjects.length === 0) return null
          return (
            <div key={cat.id} className="project-category-section">
              <div className="project-category-header">
                <Layers size={16} style={{ color: cat.color || '#6b7280' }} />
                <span>{cat.name}</span>
                <span className="project-count">{catProjects.length}</span>
              </div>
              {viewMode === 'card' ? (
                <div className="projects-grid">
                  {catProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onClick={() => handleProjectClick(p)}
                      onContextMenu={(e) => handleProjectContextMenu(e, p)}
                    />
                  ))}
                </div>
              ) : (
                <div className="projects-list">
                  {catProjects.map((p) => (
                    <ProjectListItem
                      key={p.id}
                      project={p}
                      onClick={() => handleProjectClick(p)}
                      onContextMenu={(e) => handleProjectContextMenu(e, p)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* 未分类项目 */}
        {(() => {
          const uncategorized = projectsByCategory.get(null) || []
          if (uncategorized.length === 0) return null
          return (
            <div className="project-category-section">
              <div className="project-category-header">
                <FolderOpen size={16} />
                <span>未分类</span>
                <span className="project-count">{uncategorized.length}</span>
              </div>
              {viewMode === 'card' ? (
                <div className="projects-grid">
                  {uncategorized.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onClick={() => handleProjectClick(p)}
                      onContextMenu={(e) => handleProjectContextMenu(e, p)}
                    />
                  ))}
                </div>
              ) : (
                <div className="projects-list">
                  {uncategorized.map((p) => (
                    <ProjectListItem
                      key={p.id}
                      project={p}
                      onClick={() => handleProjectClick(p)}
                      onContextMenu={(e) => handleProjectContextMenu(e, p)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {showModal && (
        <ProjectModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            refresh()
          }}
        />
      )}

      {editingProject && (
        <ProjectModal
          categories={categories}
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSuccess={() => {
            setEditingProject(null)
            refresh()
          }}
        />
      )}

      {showCategoryManage && <CategoryManageModal onClose={() => setShowCategoryManage(false)} />}
    </div>
  )
}

function ProjectCard({
  project,
  onClick,
  onContextMenu,
}: {
  project: DocumentProject
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div className="project-card" onClick={onClick} onContextMenu={onContextMenu}>
      <div className="project-card-icon" style={{ background: project.color || '#e5e7eb' }}>
        {project.icon ? (
          <span style={{ fontSize: 32 }}>{project.icon}</span>
        ) : (
          <FolderOpen size={32} color="#fff" />
        )}
      </div>
      <div className="project-card-body">
        <h3 className="project-card-title">{project.name}</h3>
        {project.description && <p className="project-card-desc">{project.description}</p>}
        {project.root_node_name && (
          <div className="project-card-meta">
            <FolderOpen size={12} />
            <span>{project.root_node_name}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectListItem({
  project,
  onClick,
  onContextMenu,
}: {
  project: DocumentProject
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div className="project-list-item" onClick={onClick} onContextMenu={onContextMenu}>
      <div className="project-list-icon" style={{ background: project.color || '#e5e7eb' }}>
        {project.icon ? (
          <span style={{ fontSize: 20 }}>{project.icon}</span>
        ) : (
          <FolderOpen size={20} color="#fff" />
        )}
      </div>
      <div className="project-list-body">
        <div className="project-list-title">{project.name}</div>
        {project.description && <div className="project-list-desc">{project.description}</div>}
      </div>
      <div className="project-list-meta">
        {project.root_node_name && (
          <span className="project-list-node">
            <FolderOpen size={12} />
            {project.root_node_name}
          </span>
        )}
        <ChevronRight size={16} color="#9ca3af" />
      </div>
    </div>
  )
}
