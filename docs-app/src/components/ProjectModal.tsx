import { useState, useEffect } from 'react'
import { createProject, updateProject } from '../api/documents'
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
          </div>
          <div className="modal-footer">
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
