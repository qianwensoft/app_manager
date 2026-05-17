import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ComponentTreeWidget,
  CompositePanel,
  Designer,
  DesignerToolsWidget,
  HistoryWidget,
  OutlineTreeWidget,
  ResourceWidget,
  SettingsPanel,
  StudioPanel,
  ToolbarPanel,
  ViewPanel,
  ViewToolsWidget,
  ViewportPanel,
  Workbench,
  WorkspacePanel,
} from '@designable/react'
import { createDesigner } from '@designable/core'
import { transformToSchema, transformToTreeNode } from '@designable/formily'
import { SettingsForm } from '@designable/react-settings-form'
import {
  ArrayCards,
  ArrayTable,
  Card,
  Cascader,
  Checkbox,
  DatePicker,
  Field,
  Form,
  FormCollapse,
  FormGrid,
  FormLayout,
  FormTab,
  Input,
  NumberPicker,
  ObjectContainer,
  Password,
  Radio,
  Rate,
  Select,
  Slider,
  Space,
  Switch,
  Text,
  TimePicker,
  Transfer,
  TreeSelect,
  Upload,
} from '@designable/formily-antd'
import { SubmitButton } from '@/designable/SubmitButton'
import { ConfirmDialogButton } from '@/designable/ConfirmDialogButton'
import { message } from 'antd'
import { Modal } from 'antd'

const componentMap = {
  Form,
  Field,
  Input,
  Select,
  TreeSelect,
  Cascader,
  Radio,
  Checkbox,
  Slider,
  Rate,
  NumberPicker,
  Transfer,
  Password,
  DatePicker,
  TimePicker,
  Upload,
  Switch,
  Text,
  Card,
  ArrayCards,
  ArrayTable,
  Space,
  FormTab,
  FormCollapse,
  FormGrid,
  FormLayout,
  ObjectContainer,
  SubmitButton,
  ConfirmDialogButton,
  DesignableForm: Form,
  DesignableField: Field,
}

async function authed(path: string, method: string, body?: any) {
  const token = localStorage.getItem('token') || ''
  const resp = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
  return data
}

export default function PageDesignerPage() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const [page, setPage] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [jsonText, setJsonText] = useState('')

  const engine = useMemo(
    () => {
      const eng = createDesigner({
        rootComponentName: 'Form',
      })
      ;(window as any).__designable_engine__ = eng
      return eng
    },
    []
  )

  useEffect(() => {
    ;(async () => {
      try {
        const res = await authed(`/api/form-app/pages/${pageId}`, 'GET')
        const pageData = res?.data
        if (pageData) {
          setPage(pageData)
          if (pageData.design_schema) {
            const schema = JSON.parse(pageData.design_schema)
            setTimeout(() => {
              try {
                const sanitized = JSON.parse(JSON.stringify(schema), (k, v) => {
                  if (k === 'enum' && Array.isArray(v)) return v.filter(x => x != null)
                  return v
                })
                const tree = (transformToTreeNode as any)(sanitized)
                engine.setCurrentTree(tree)
              } catch (e) {
                console.error('Failed to load schema:', e)
              }
            }, 100)
          }
        }
      } catch (e: any) {
        message.error(e.message || '加载页面失败')
      }
    })()
  }, [pageId, engine])

  const saveSchema = async () => {
    setSaving(true)
    try {
      const schema = (transformToSchema as any)(engine.getCurrentTree())
      await authed(`/api/form-app/pages/${pageId}`, 'PUT', {
        design_schema: JSON.stringify(schema),
      })
      message.success('保存成功')
    } catch (e: any) {
      message.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const refreshJson = () => {
    try {
      const schema = (transformToSchema as any)(engine.getCurrentTree())
      setJsonText(JSON.stringify(schema, null, 2))
    } catch (e) {
      setJsonText('/* 解析失败 */')
    }
    setShowJson(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16 }}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>页面布局编辑器</h1>
          <p style={{ margin: '4px 0 0', color: '#666' }}>
            {page?.title} ({page?.page_type})
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(-1)} style={{ padding: '8px 16px' }}>返回</button>
          <button onClick={refreshJson} style={{ padding: '8px 16px' }}>JSON 预览</button>
          <button onClick={saveSchema} disabled={saving} style={{ padding: '8px 16px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </header>
      <div style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <Designer engine={engine}>
          <StudioPanel>
            <CompositePanel>
              <CompositePanel.Item title="Components" icon="Component">
                <ResourceWidget title="Inputs" sources={[Input, Password, NumberPicker, Rate, Slider, Select, TreeSelect, Cascader, Transfer, Checkbox, Radio, DatePicker, TimePicker, Upload, Switch, ObjectContainer]} />
                <ResourceWidget title="Layouts" sources={[Card, FormGrid, FormTab, FormLayout, FormCollapse, Space]} />
                <ResourceWidget title="Arrays" sources={[ArrayCards, ArrayTable]} />
                <ResourceWidget title="Displays" sources={[Text, SubmitButton, ConfirmDialogButton]} />
              </CompositePanel.Item>
              <CompositePanel.Item title="Outline" icon="Outline">
                <OutlineTreeWidget />
              </CompositePanel.Item>
              <CompositePanel.Item title="History" icon="History">
                <HistoryWidget />
              </CompositePanel.Item>
            </CompositePanel>
            <Workbench>
              <WorkspacePanel>
                <ToolbarPanel>
                  <DesignerToolsWidget />
                  <ViewToolsWidget use={['DESIGNABLE']} />
                </ToolbarPanel>
                <ViewportPanel style={{ height: '100%' }}>
                  <ViewPanel type="DESIGNABLE">
                    {() => <ComponentTreeWidget components={componentMap} />}
                  </ViewPanel>
                </ViewportPanel>
              </WorkspacePanel>
            </Workbench>
            <SettingsPanel title="Properties">
              <SettingsForm uploadAction="/api/scada/resource/upload/widget" />
            </SettingsPanel>
          </StudioPanel>
        </Designer>
      </div>
      <Modal
        title="Design Schema JSON"
        open={showJson}
        onCancel={() => setShowJson(false)}
        footer={null}
        width={700}
        bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
      >
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {jsonText}
        </pre>
      </Modal>
    </div>
  )
}
