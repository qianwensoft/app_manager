import { useEffect, useState } from 'react'
import Modal from './Modal'
import type { DocumentNode, DocNodeType } from '../api/types'
import { slugifyCode } from '../api/documents'

interface NodeModalProps {
  parent: DocumentNode | null
  node?: DocumentNode | null // 存在则为编辑
  onSubmit: (body: Partial<DocumentNode>) => void
  onClose: () => void
}

// 新建/编辑节点弹窗：folder（分组）/ doc（文档）/ form_app（表单应用）。
// 「编码」字段默认与名称一致（slug），可手改；新建时随名称实时同步，编辑时仅显示初始值。
export default function NodeModal({ parent, node, onSubmit, onClose }: NodeModalProps) {
  const editing = !!node
  const [name, setName] = useState(node?.name || '')
  const [code, setCode] = useState(node?.code || '')
  const [codeTouched, setCodeTouched] = useState(editing) // 编辑模式下不自动覆盖用户已存在的 code
  const [nodeType, setNodeType] = useState<DocNodeType>(node?.node_type || 'folder')
  const [formCode, setFormCode] = useState(() => {
    try {
      return node?.config_json ? JSON.parse(node.config_json).form_code || '' : ''
    } catch {
      return ''
    }
  })
  const [openMode, setOpenMode] = useState(() => {
    try {
      return node?.config_json ? JSON.parse(node.config_json).open_mode || 'iframe' : 'iframe'
    } catch {
      return 'iframe'
    }
  })

  // 新建模式下，编码字段默认随名称实时生成（用户未手动改过时）。
  useEffect(() => {
    if (!editing && !codeTouched) {
      setCode(slugifyCode(name))
    }
  }, [name, editing, codeTouched])

  function submit() {
    if (!name.trim()) return
    const body: Partial<DocumentNode> = {
      name: name.trim(),
      node_type: nodeType,
      parent_id: node ? node.parent_id : parent ? parent.id : null,
    }
    // 仅在用户填了值时才下发 code（允许清空）；
    // 与同级已有的 code 冲突由后端追加 -2/-3… 后缀。
    if (code.trim()) body.code = code.trim()
    if (nodeType === 'form_app') {
      body.config_json = JSON.stringify({ form_code: formCode.trim(), open_mode: openMode })
    }
    onSubmit(body)
  }

  return (
    <Modal
      title={editing ? '编辑节点' : parent ? `在「${parent.name}」下新建` : '新建根节点'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit}>{editing ? '保存' : '创建'}</button>
        </>
      }
    >
      <div className="form-row">
        <label>名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="节点名称"
          autoFocus
        />
      </div>
      <div className="form-row">
        <label>
          编码
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
            {editing ? '修改后用于更新 URL' : '默认与名称一致，可修改；同级唯一'}
          </span>
        </label>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setCodeTouched(true)
          }}
          placeholder="URL 编码（默认 = 名称 slug）"
        />
      </div>
      <div className="form-row">
        <label>类型</label>
        <select value={nodeType} onChange={(e) => setNodeType(e.target.value as DocNodeType)} disabled={editing}>
          <option value="folder">普通节点（可添加子节点）</option>
          <option value="doc">文档节点（可上传/编辑文件）</option>
          <option value="form_app">表单应用（嵌入 form-app）</option>
        </select>
      </div>
      {nodeType === 'form_app' && (
        <>
          <div className="form-row">
            <label>表单编码（form_code）</label>
            <input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="form-app 的表单 code" />
          </div>
          <div className="form-row">
            <label>打开方式</label>
            <select value={openMode} onChange={(e) => setOpenMode(e.target.value)}>
              <option value="iframe">内嵌 iframe</option>
              <option value="blank">新标签页打开</option>
            </select>
          </div>
        </>
      )}
      {nodeType === 'doc' && !editing && (
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>
          创建后可上传文件；Markdown 文档可直接在线协同编辑。所有节点都可以添加子节点。
        </p>
      )}
      {nodeType === 'folder' && !editing && (
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>
          普通节点可以添加子节点，也可以稍后上传文件内容。
        </p>
      )}
    </Modal>
  )
}
