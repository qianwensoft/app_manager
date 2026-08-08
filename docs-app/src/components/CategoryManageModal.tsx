import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, X } from 'lucide-react'
import {
  fetchProjectCategories,
  createProjectCategory,
  updateProjectCategory,
  deleteProjectCategory,
} from '../api/documents'
import type { DocumentProjectCategory } from '../api/types'

interface CategoryManageModalProps {
  onClose: () => void
}

export default function CategoryManageModal({ onClose }: CategoryManageModalProps) {
  const qc = useQueryClient()
  const { data: categories = [] } = useQuery({
    queryKey: ['doc-project-categories'],
    queryFn: fetchProjectCategories,
  })
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<DocumentProjectCategory | null>(null)

  function handleEdit(cat: DocumentProjectCategory) {
    setEditingCategory(cat)
    setShowForm(true)
  }

  async function handleDelete(cat: DocumentProjectCategory) {
    if (!confirm(`确定删除分类"${cat.name}"？`)) return
    try {
      await deleteProjectCategory(cat.id)
      qc.invalidateQueries({ queryKey: ['doc-project-categories'] })
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  function handleCloseForm() {
    setShowForm(false)
    setEditingCategory(null)
  }

  function handleSuccess() {
    qc.invalidateQueries({ queryKey: ['doc-project-categories'] })
    handleCloseForm()
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>分类管理</span>
          <button className="btn icon" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <button className="btn primary" onClick={() => setShowForm(true)}>
              <Plus size={16} />
              新建分类
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="empty-hint">暂无分类</div>
          ) : (
            <div className="category-list">
              {categories.map((cat) => (
                <div key={cat.id} className="category-item">
                  <div className="category-item-left">
                    <div
                      className="category-color-dot"
                      style={{ background: cat.color || '#6b7280' }}
                    />
                    <span className="category-name">{cat.name}</span>
                    {cat.description && (
                      <span className="category-desc">{cat.description}</span>
                    )}
                  </div>
                  <div className="category-item-actions">
                    <button
                      className="btn icon small"
                      onClick={() => handleEdit(cat)}
                      title="编辑"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn icon small danger"
                      onClick={() => handleDelete(cat)}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <CategoryForm
            category={editingCategory}
            onClose={handleCloseForm}
            onSuccess={handleSuccess}
          />
        )}
      </div>
    </div>
  )
}

interface CategoryFormProps {
  category: DocumentProjectCategory | null
  onClose: () => void
  onSuccess: () => void
}

function CategoryForm({ category, onClose, onSuccess }: CategoryFormProps) {
  const [name, setName] = useState(category?.name || '')
  const [description, setDescription] = useState(category?.description || '')
  const [color, setColor] = useState(category?.color || '#3b82f6')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        color: color || undefined,
      }
      if (category?.id) {
        await updateProjectCategory(category.id, payload)
      } else {
        await createProjectCategory(payload)
      }
      onSuccess()
    } catch (err: any) {
      alert(err.response?.data?.error || (category ? '更新失败' : '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">{category ? '编辑分类' : '新建分类'}</div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <label>分类名称 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入分类名称"
                required
                autoFocus
              />
            </div>
            <div className="form-row">
              <label>描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="分类描述（可选）"
                rows={3}
              />
            </div>
            <div className="form-row">
              <label>颜色</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? (category ? '更新中...' : '创建中...') : category ? '更新' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
