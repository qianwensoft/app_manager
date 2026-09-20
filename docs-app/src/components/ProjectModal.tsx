import { useState, useEffect } from 'react'
import { createProject, updateProject, deleteProject, publishProject, unpublishProject } from '../api/documents'
import type { DocumentProjectCategory, DocumentProject } from '../api/types'

interface ProjectModalProps {
  categories: DocumentProjectCategory[]
  project?: DocumentProject | null
  onClose: () => void
  onSuccess: () => void
}

export default function ProjectModal({ categories, project, onClose, onSuccess }: ProjectModalProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 编辑模式：初始化表单
  useEffect(() => {
    if (project) {
      setName(project.name || '')
      setCode(project.code || '')
      setDescription(project.description || '')
      setIcon(project.icon || '')
      setColor(project.color || '#3b82f6')
      setCategoryId(project.category_id || null)
    }
  }, [project])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        color: color || undefined,
        category_id: categoryId || undefined,
      }
      if (project?.id) {
        await updateProject(project.id, payload)
      } else {
        await createProject(payload)
      }
      onSuccess()
    } catch (err: any) {
      alert(err.response?.data?.error || (project ? '更新失败' : '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!project?.id) return
    if (!confirm(`确定要删除项目「${project.name}」吗？此操作不可恢复。`)) return
    setSubmitting(true)
    try {
      await deleteProject(project.id)
      onSuccess()
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddToAgentMenu() {
    if (!project?.id || !project.code) {
      alert('项目需要有编码才能添加到 Agent 菜单')
      return
    }
    // docs-app 的节点树接口默认要求 JWT 登录，Agent WebView 没有登录态，
    // 必须先发布项目生成 ShareToken，菜单才能通过免登录分享接口打开。
    if (project.publish_status !== 1 || !project.share_token) {
      alert(
        '该项目尚未发布，Agent 无法访问。\n请先点击「发布」按钮开启免登录分享，再添加到 Agent 菜单。',
      )
      return
    }
    setSubmitting(true)
    try {
      const token = localStorage.getItem('token') || ''
      const response = await fetch('/api/agent-menus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: project.name,
          icon: project.icon || '📄',
          target_type: 'doc_project',
          target_ref: project.code,
          intent_action: '',
          show_on_agent_home: true,
          sort_order: 0
        })
      })
      if (!response.ok) {
        let message = '添加失败'
        try {
          const error = await response.json()
          message = error.error || message
        } catch {
          message = `添加失败（HTTP ${response.status}）`
        }
        throw new Error(message)
      }
      alert('已添加到 Agent 菜单，请到「设备管理 - Agent 菜单」下发到设备')
      onSuccess()
    } catch (err: any) {
      alert(err.message || '添加到菜单失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 发布/取消发布。发布后会自动通过后端 bump revision + WS push，
  // 把已下发的 LIMS 菜单立即同步到 Agent，避免下次连上才生效。
  async function handleTogglePublish() {
    if (!project?.id) return
    const willPublish = project.publish_status !== 1
    if (willPublish && !project.code) {
      alert('项目需要有编码才能发布')
      return
    }
    if (!willPublish && !confirm('取消发布后将无法被 Agent 访问，确认继续？')) return
    setSubmitting(true)
    try {
      if (willPublish) {
        await publishProject(project.id)
      } else {
        await unpublishProject(project.id)
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      alert(err.response?.data?.error || (willPublish ? '发布失败' : '取消发布失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">{project ? '编辑项目' : '新建项目'}</div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <label>项目名称 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入项目名称"
                required
              />
            </div>
            <div className="form-row">
              <label>项目编码</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="URL 友好的唯一标识（可选）"
              />
            </div>
            <div className="form-row">
              <label>描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="项目描述"
                rows={3}
              />
            </div>
            <div className="form-row">
              <label>图标（Emoji）</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="📁 输入 emoji 或留空"
                maxLength={4}
              />
            </div>
            <div className="form-row">
              <label>主题色</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>所属分类</label>
              <select
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">无分类</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            {project && (
              <div className="form-row">
                <label>发布状态</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      color: project.publish_status === 1 ? '#fff' : '#909399',
                      background:
                        project.publish_status === 1 ? '#67c23a' : 'transparent',
                      border:
                        project.publish_status === 1
                          ? '1px solid #67c23a'
                          : '1px solid #dcdfe6',
                    }}
                  >
                    {project.publish_status === 1 ? '已发布' : '未发布'}
                  </span>
                  <span style={{ color: '#909399', fontSize: 12 }}>
                    {project.publish_status === 1
                      ? `ShareToken: ${project.share_token?.slice(0, 8)}...（Agent 通过免登录分享访问）`
                      : 'Agent 菜单无法打开未发布的项目'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            {project && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={handleTogglePublish}
                  disabled={submitting}
                  title={
                    project.publish_status === 1
                      ? '取消发布后 Agent 将无法访问此项目'
                      : !project.code
                        ? '需要项目编码才能发布'
                        : '发布后生成 ShareToken，Agent 可通过免登录分享访问'
                  }
                >
                  {project.publish_status === 1 ? '取消发布' : '发布'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleAddToAgentMenu}
                  disabled={
                    submitting ||
                    !project.code ||
                    project.publish_status !== 1 ||
                    !project.share_token
                  }
                  title={
                    !project.code
                      ? '需要项目编码才能添加到菜单'
                      : project.publish_status !== 1
                        ? '请先发布项目（Agent WebView 没有登录态，必须凭 ShareToken 免登录打开）'
                        : '添加到 Agent 菜单（待菜单管理页下发到设备）'
                  }
                >
                  添加到 Agent 菜单
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={handleDelete}
                  disabled={submitting}
                  style={{ marginRight: 'auto' }}
                >
                  删除
                </button>
              </>
            )}
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? (project ? '更新中...' : '创建中...') : (project ? '更新' : '创建')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
