import { useEffect, useState } from 'react'
import Modal from './Modal'
import { fetchVersions, revertVersion } from '../api/documents'
import type { DocumentVersion } from '../api/types'

interface VersionModalProps {
  nodeId: number
  canEdit: boolean
  onClose: () => void
  onReverted: () => void
}

function fmtSize(n: number) {
  if (!n) return '-'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

export default function VersionModal({ nodeId, canEdit, onClose, onReverted }: VersionModalProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setVersions(await fetchVersions(nodeId))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  async function handleRevert(v: DocumentVersion) {
    if (!confirm(`确定回退到版本 v${v.version}？将生成一个新版本。`)) return
    await revertVersion(nodeId, v.id)
    await load()
    onReverted()
  }

  return (
    <Modal title="版本历史" onClose={onClose}>
      {loading ? (
        <div className="empty-hint" style={{ marginTop: 20 }}>加载中…</div>
      ) : versions.length === 0 ? (
        <div className="empty-hint" style={{ marginTop: 20 }}>暂无版本记录</div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>版本</th>
              <th>大小</th>
              <th>备注</th>
              <th>时间</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>v{v.version}</td>
                <td>{fmtSize(v.size_bytes)}</td>
                <td>{v.comment || '-'}</td>
                <td>{v.created_at ? new Date(v.created_at).toLocaleString() : '-'}</td>
                {canEdit && (
                  <td>
                    <button className="btn" style={{ fontSize: 12 }} onClick={() => handleRevert(v)}>回退</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
