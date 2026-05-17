import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

type OptionItem = {
  label: string
  value: string
}

async function authedGet(path: string) {
  const token = localStorage.getItem('token') || ''
  const resp = await fetch(path, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  return data
}

async function authedPost(path: string, body: Record<string, unknown>) {
  const token = localStorage.getItem('token') || ''
  const resp = await fetch(`/api/form-app${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  return data
}

export default function FormPreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const mode = search.get('mode') === 'view' ? 'view' : 'form'
  const [queryCode, setQueryCode] = useState(search.get('query_code') || '')
  const [submitCode, setSubmitCode] = useState(search.get('submit_code') || '')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [options, setOptions] = useState<OptionItem[]>([])
  const [ifaceOptions, setIfaceOptions] = useState<OptionItem[]>([])
  const [appIfaceOptions, setAppIfaceOptions] = useState<OptionItem[]>([])
  const [devices, setDevices] = useState<OptionItem[]>([])
  const [deployDeviceId, setDeployDeviceId] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formName, setFormName] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    dept: '',
    remark: '',
  })

  const previewTitle = useMemo(() => (mode === 'view' ? '展示模式' : '表单模式'), [mode])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [ifaceRes, appRes, devRes, infoRes] = await Promise.all([
          authedGet('/api/data/interfaces'),
          authedGet('/api/outbound/apps'),
          authedGet('/api/devices'),
          id ? authedGet(`/api/form-app/infos/${id}`) : Promise.resolve({ data: null }),
        ])
        if (!mounted) return
        const di = (ifaceRes?.data || []).map((x: any) => ({
          label: `${x.name || x.code || '未命名'} (${x.code || x.id})`,
          value: String(x.code || x.id || ''),
        }))
        const ai = (appRes?.data || []).map((x: any) => ({
          label: `${x.name || x.app_name || '未命名'} (${x.code || x.id})`,
          value: String(x.code || x.id || ''),
        }))
        const ds = (devRes?.data || []).map((x: any) => ({
          label: `${x.name || x.serial || '设备'} (#${x.id})`,
          value: String(x.id),
        }))
        setIfaceOptions(di)
        setAppIfaceOptions(ai)
        setDevices(ds)
        if (!queryCode && di[0]) setQueryCode(di[0].value)
        if (!submitCode && di[0]) setSubmitCode(di[0].value)
        const info = infoRes?.data
        if (info?.code) {
          setFormCode(String(info.code))
          setFormName(String(info.name || info.code))
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : '初始化接口配置失败')
        }
      }
    })()
    return () => {
      mounted = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!queryCode) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const res = await authedPost('/runtime/query', {
          interface_code: queryCode,
          param_values: { form_id: id || 'demo' },
        })
        const rows = (res?.data?.rows || res?.data?.options || []) as Array<Record<string, unknown>>
        const mapped = rows.map((r, idx) => ({
          label: String(r.label ?? r.name ?? `选项${idx + 1}`),
          value: String(r.value ?? r.code ?? r.id ?? `${idx + 1}`),
        }))
        if (mounted) {
          setOptions(mapped.length ? mapped : [{ label: '默认选项', value: 'default' }])
          setResult(JSON.stringify(res, null, 2))
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : '查询失败')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [id, queryCode])

  const onSubmit = async (evt: FormEvent) => {
    evt.preventDefault()
    if (mode === 'view') return
    setSubmitting(true)
    setError('')
    try {
      const res = await authedPost('/runtime/submit', {
        interface_code: submitCode,
        param_values: {
          form_id: id || 'demo',
          ...formData,
        },
      })
      setResult(JSON.stringify(res, null, 2))
      const recordId = String(res?.record_id || res?.data?.record_id || res?.data?.id || '')
      const targetId = recordId || id || 'demo'
      const q = new URLSearchParams({
        mode: 'view',
        query_code: queryCode,
      })
      navigate(`/preview/${encodeURIComponent(targetId)}?${q.toString()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const deployDemo = async () => {
    if (!deployDeviceId) {
      setError('请选择下发设备')
      return
    }
    if (!formCode) {
      setError('当前表单缺少 code，无法下发')
      return
    }
    setDeploying(true)
    setError('')
    try {
      const token = localStorage.getItem('token') || ''
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      const menuResp = await fetch('/api/agent-menus', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `表单演示-${formName || formCode}`,
          target_type: 'form_app_preview',
          target_ref: formCode,
          intent_action: 'com.appmanager.agent.ACTION_FORM_DEMO',
          show_on_agent_home: true,
          sort_order: 0,
        }),
      })
      const menuData = await menuResp.json().catch(() => ({}))
      if (!menuResp.ok) throw new Error(menuData?.error || '创建菜单失败')
      const menuId = menuData?.data?.id
      if (!menuId) throw new Error('菜单ID缺失')
      const deployResp = await fetch('/api/agent-menus/deploy', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          menu_ids: [menuId],
          device_ids: [Number(deployDeviceId)],
        }),
      })
      const deployData = await deployResp.json().catch(() => ({}))
      if (!deployResp.ok) throw new Error(deployData?.error || '下发失败')
      setResult(prev => `${prev || ''}\n\n[部署结果]\n已下发菜单ID=${menuId} 到设备ID=${deployDeviceId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '下发失败')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Preview</h1>
        <p>
          运行态预览示例（{previewTitle}），当前 ID: {id}
        </p>
      </header>

      <div className="panel">
        <div className="meta">
          <strong>后端接口配置</strong>
          <span>查询接口（数据接口/应用接口）</span>
        </div>
        <div className="row">
          <label>查询接口</label>
          <select value={queryCode} onChange={e => setQueryCode(e.target.value)}>
            <option value="">请选择查询接口</option>
            {ifaceOptions.map(op => (
              <option key={`q-di-${op.value}`} value={op.value}>{op.label}</option>
            ))}
            {appIfaceOptions.map(op => (
              <option key={`q-ai-${op.value}`} value={op.value}>{`[应用] ${op.label}`}</option>
            ))}
          </select>
        </div>
        <div className="row">
          <label>提交接口</label>
          <select value={submitCode} onChange={e => setSubmitCode(e.target.value)}>
            <option value="">请选择提交接口</option>
            {ifaceOptions.map(op => (
              <option key={`s-di-${op.value}`} value={op.value}>{op.label}</option>
            ))}
            {appIfaceOptions.map(op => (
              <option key={`s-ai-${op.value}`} value={op.value}>{`[应用] ${op.label}`}</option>
            ))}
          </select>
        </div>
      </div>

      <form className="panel preview-form" onSubmit={onSubmit}>
        <div className="row">
          <label>姓名</label>
          <input
            value={formData.name}
            disabled={mode === 'view'}
            onChange={e => setFormData(v => ({ ...v, name: e.target.value }))}
            placeholder="输入姓名"
          />
        </div>
        <div className="row">
          <label>部门</label>
          <select
            value={formData.dept}
            disabled={mode === 'view' || loading}
            onChange={e => setFormData(v => ({ ...v, dept: e.target.value }))}
          >
            <option value="">请选择</option>
            {options.map(op => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <label>备注</label>
          <textarea
            value={formData.remark}
            disabled={mode === 'view'}
            onChange={e => setFormData(v => ({ ...v, remark: e.target.value }))}
            placeholder="输入备注"
          />
        </div>
        {mode === 'form' && (
          <div className="actions">
            <button type="submit" disabled={submitting}>
              {submitting ? '提交中...' : '提交'}
            </button>
          </div>
        )}
      </form>

      <div className="panel">
        <div className="meta">
          <strong>演示下发到 Agent</strong>
          <span>创建演示菜单并下发到指定设备</span>
        </div>
        <div className="row">
          <label>目标设备</label>
          <select value={deployDeviceId} onChange={e => setDeployDeviceId(e.target.value)}>
            <option value="">请选择设备</option>
            {devices.map(op => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>
        <div className="actions">
          <button type="button" disabled={deploying} onClick={deployDemo}>
            {deploying ? '下发中...' : '演示下发'}
          </button>
        </div>
      </div>

      {error && <div className="panel error-text">{error}</div>}

      <div className="panel">
        <div className="meta">
          <strong>调试信息</strong>
          <span>query_code: {queryCode}</span>
          <span>submit_code: {submitCode}</span>
        </div>
        <pre className="result-box">{result || '暂无返回结果'}</pre>
      </div>
    </div>
  )
}
