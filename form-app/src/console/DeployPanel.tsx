import { useEffect, useState } from 'react'
import { Button, Select, Input, Tag, Alert, message, Divider } from 'antd'
import { authed, type FormAppInfo, type FormAppPage } from './api'

type Props = {
  app: FormAppInfo
  pages: FormAppPage[]
  reload: () => void
}

export default function DeployPanel({ app, pages, reload }: Props) {
  const [devices, setDevices] = useState<any[]>([])
  const [deviceIds, setDeviceIds] = useState<number[]>([])
  const [entryPageKey, setEntryPageKey] = useState(app.entry_page_key || pages[0]?.page_key || 'form')
  const [menuTitle, setMenuTitle] = useState(app.name || '')
  const [showOnHome, setShowOnHome] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [deploying, setDeploying] = useState(false)

  const published = app.publish_status === 1

  useEffect(() => {
    let cancelled = false
    authed('/api/devices', 'GET')
      .then(res => {
        if (!cancelled) {
          setDevices(res?.data || [])
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const togglePublish = async () => {
    setPublishing(true)
    try {
      await authed(`/api/form-app/infos/${app.id}/${published ? 'unpublish' : 'publish'}`, 'POST')
      message.success(published ? '已取消发布' : '已发布')
      reload()
    } catch (e: any) { message.error(e.message) } finally { setPublishing(false) }
  }

  const deploy = async () => {
    if (!deviceIds.length) { message.warning('请选择至少一台设备'); return }
    setDeploying(true)
    try {
      const res = await authed(`/api/form-app/infos/${app.id}/deploy-to-devices`, 'POST', {
        device_ids: deviceIds,
        entry_page_key: entryPageKey,
        menu_title: menuTitle.trim() || app.name,
        show_on_agent_home: showOnHome,
      })
      message.success(`已下发到 ${res?.data?.device_count ?? deviceIds.length} 台设备`)
    } catch (e: any) { message.error(e.message) } finally { setDeploying(false) }
  }

  const shareUrl = app.share_token ? `${window.location.origin}/form-app/runtime/${encodeURIComponent(app.code)}` : ''

  return (
    <div style={{ maxWidth: 720 }}>
      <h2>发布并下发</h2>

      <div style={{ marginBottom: 16 }}>
        <Alert
          type={published ? 'success' : 'info'}
          showIcon
          message={published ? '应用已发布' : '应用尚未发布'}
          description={published ? '已发布的应用可被分享访问，并可下发到设备。' : '建议先发布，再下发到设备。'}
        />
        <div style={{ marginTop: 12 }}>
          <Button type={published ? 'default' : 'primary'} loading={publishing} onClick={togglePublish}>
            {published ? '取消发布' : '发布应用'}
          </Button>
          {published && shareUrl && (
            <span style={{ marginLeft: 12 }}>
              分享链接：<Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => { navigator.clipboard?.writeText(shareUrl); message.success('已复制') }}>{shareUrl}</Tag>
            </span>
          )}
        </div>
      </div>

      <Divider />

      <h3>下发到设备</h3>
      <p style={{ color: '#64748b' }}>在所选设备的 Agent 菜单中创建入口，点击即可打开本表单运行时。</p>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>菜单标题</label>
          <Input value={menuTitle} onChange={e => setMenuTitle(e.target.value)} placeholder={app.name} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>入口页面</label>
          <Select style={{ width: '100%' }} value={entryPageKey} onChange={setEntryPageKey}>
            {pages.map(p => <Select.Option key={p.page_key} value={p.page_key}>{p.title} ({p.page_key})</Select.Option>)}
          </Select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>目标设备</label>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            value={deviceIds}
            onChange={setDeviceIds}
            placeholder="选择一台或多台设备"
            filterOption={(input, option) => String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())}
          >
            {devices.map((d: any) => (
              <Select.Option key={d.id} value={d.id}>{d.name || d.serial || `设备#${d.id}`}{d.status === 'online' ? '（在线）' : ''}</Select.Option>
            ))}
          </Select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>显示位置</label>
          <Select value={showOnHome ? 1 : 0} onChange={v => setShowOnHome(!!v)} style={{ width: 260 }}>
            <Select.Option value={1}>前台（主屏幕直接显示）</Select.Option>
            <Select.Option value={0}>后台（点「管理后台」后可见）</Select.Option>
          </Select>
        </div>
        <div>
          <Button type="primary" loading={deploying} onClick={deploy} disabled={!deviceIds.length}>下发到设备</Button>
        </div>
      </div>
    </div>
  )
}
