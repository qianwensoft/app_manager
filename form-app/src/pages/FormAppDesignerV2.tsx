import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Steps, Button, Tag, Spin, message } from 'antd'
import { authed, type FormAppInfo, type FormAppPage } from '@/console/api'
import BasicInfoPanel from '@/console/BasicInfoPanel'
import PagesPanel from '@/console/PagesPanel'
import LinksEventsPanel from '@/console/LinksEventsPanel'
import PreviewPanel from '@/console/PreviewPanel'
import DeployPanel from '@/console/DeployPanel'
import DataPanel from '@/console/DataPanel'

const STEP_KEYS = ['basic', 'pages', 'flow', 'preview', 'deploy', 'data'] as const
type StepKey = (typeof STEP_KEYS)[number]

const STEP_TITLES: Record<StepKey, string> = {
  basic: '基本信息',
  pages: '页面与字段',
  flow: '跳转与事件',
  preview: '预览',
  deploy: '发布与下发',
  data: '数据',
}

export default function FormAppDesignerV2() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [app, setApp] = useState<FormAppInfo | null>(null)
  const [pages, setPages] = useState<FormAppPage[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [eventRoutes, setEventRoutes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const stepFromUrl = (searchParams.get('step') as StepKey) || 'basic'
  const [step, setStep] = useState<StepKey>(STEP_KEYS.includes(stepFromUrl) ? stepFromUrl : 'basic')

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      const [appRes, pagesRes, linksRes, routesRes] = await Promise.all([
        authed(`/api/form-app/infos/${id}`, 'GET'),
        authed(`/api/form-app/infos/${id}/pages`, 'GET'),
        authed(`/api/form-app/infos/${id}/links`, 'GET'),
        authed(`/api/form-app/infos/${id}/event-routes`, 'GET'),
      ])
      setApp(appRes.data)
      setPages(pagesRes.data || [])
      setLinks(linksRes.data || [])
      setEventRoutes(routesRes.data || [])
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  const changeStep = (s: StepKey) => {
    setStep(s)
    const next = new URLSearchParams(searchParams)
    next.set('step', s)
    setSearchParams(next, { replace: true })
  }

  if (loading || !app) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}><Spin size="large" /></div>
  }

  const published = app.publish_status === 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button onClick={() => navigate('/forms')}>← 返回列表</Button>
        <h2 style={{ margin: 0 }}>{app.name}</h2>
        <Tag color="default">{app.code}</Tag>
        <Tag color={published ? 'green' : 'orange'}>{published ? '已发布' : '未发布'}</Tag>
        <span style={{ flex: 1 }} />
        <Button type="primary" onClick={() => changeStep('preview')}>预览</Button>
        <Button onClick={() => changeStep('deploy')}>发布并下发</Button>
      </div>

      <div style={{ padding: '16px 24px 0' }}>
        <Steps
          size="small"
          current={STEP_KEYS.indexOf(step)}
          onChange={i => changeStep(STEP_KEYS[i])}
        >
          {STEP_KEYS.map(k => <Steps.Step key={k} title={STEP_TITLES[k]} />)}
        </Steps>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {step === 'basic' && <BasicInfoPanel app={app} pages={pages} onSaved={loadData} />}
        {step === 'pages' && <PagesPanel app={app} pages={pages} links={links} reload={loadData} />}
        {step === 'flow' && <LinksEventsPanel app={app} pages={pages} links={links} eventRoutes={eventRoutes} reload={loadData} />}
        {step === 'preview' && <PreviewPanel app={app} pages={pages} reload={loadData} />}
        {step === 'deploy' && <DeployPanel app={app} pages={pages} reload={loadData} />}
        {step === 'data' && <DataPanel app={app} pages={pages} />}
      </div>
    </div>
  )
}
