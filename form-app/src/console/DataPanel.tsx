import { useEffect, useMemo, useState } from 'react'
import { Button, Select, Table, Empty, message } from 'antd'
import { authed, type FormAppInfo, type FormAppPage } from './api'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
}

export default function DataPanel({ app, pages }: Props) {
  const listPages = useMemo(
    () => pages.filter(p => (p.page_type === 'list' || p.page_type === 'detail') && p.interface_code),
    [pages],
  )
  const [pageKey, setPageKey] = useState(listPages[0]?.page_key || '')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const currentPage = listPages.find(p => p.page_key === pageKey)

  useEffect(() => {
    if (!pageKey && listPages.length) setPageKey(listPages[0].page_key)
  }, [listPages])

  const query = async () => {
    if (!currentPage?.interface_code) { message.warning('该页面未绑定数据接口'); return }
    setLoading(true)
    try {
      const res = await authed('/api/form-app/runtime/query', 'POST', {
        interface_code: currentPage.interface_code,
        form_code: app.code,
        page_key: currentPage.page_key,
        page_type: 'list',
        param_values: {},
      })
      const data = Array.isArray(res?.rows) ? res.rows : Array.isArray(res?.data) ? res.data : []
      setRows(data)
      setLoaded(true)
    } catch (e: any) { message.error(e.message) } finally { setLoading(false) }
  }

  const columns = useMemo(() => {
    const keys = new Set<string>()
    rows.slice(0, 20).forEach(r => Object.keys(r || {}).forEach(k => keys.add(k)))
    return Array.from(keys).map(k => ({
      title: k,
      dataIndex: k,
      ellipsis: true,
      render: (v: any) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)),
    }))
  }, [rows])

  return (
    <div>
      <h2>数据记录</h2>
      <p style={{ color: '#64748b' }}>管理端直接查看提交的数据，无需下发到设备。基于列表页绑定的数据接口查询。</p>

      {listPages.length === 0 ? (
        <Empty description="没有绑定数据接口的列表/详情页，请先在「页面与字段」生成列表页" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <span>数据来源页：</span>
            <Select value={pageKey} onChange={setPageKey} style={{ width: 260 }}>
              {listPages.map(p => <Select.Option key={p.page_key} value={p.page_key}>{p.title}（{p.interface_code}）</Select.Option>)}
            </Select>
            <Button type="primary" loading={loading} onClick={query}>查询</Button>
          </div>
          {loaded && (
            <Table
              rowKey={(r: any) => r.id ?? JSON.stringify(r)}
              dataSource={rows}
              columns={columns}
              size="small"
              scroll={{ x: true }}
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          )}
        </>
      )}
    </div>
  )
}
