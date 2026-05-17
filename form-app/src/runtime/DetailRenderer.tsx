import { useEffect, useState } from 'react'
import { Button, message, Spin } from 'antd'

type FieldDef = {
  field: string
  label: string
}

type DetailRendererProps = {
  fields: FieldDef[]
  onLoad: () => Promise<Record<string, any>>
  onBack?: () => void
}

export default function DetailRenderer({ fields, onLoad, onBack }: DetailRendererProps) {
  const [data, setData] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await onLoad()
        setData(res)
      } catch (e: any) {
        message.error(e.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <Spin style={{ display: 'block', margin: '100px auto' }} />

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      {onBack && <Button onClick={onBack} style={{ marginBottom: 16 }}>返回</Button>}
      {fields.map(f => (
        <div key={f.field} style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{f.label}</div>
          <div>{data?.[f.field] ?? '-'}</div>
        </div>
      ))}
    </div>
  )
}
