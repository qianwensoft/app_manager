import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { message } from '@/lib/message'
import { Loader2 } from 'lucide-react'

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {onBack && (
        <Button variant="outline" onClick={onBack} className="mb-4">
          返回
        </Button>
      )}
      <div className="space-y-4">
        {fields.map(f => (
          <Card key={f.field}>
            <CardContent className="pt-6">
              <div className="font-semibold text-sm text-muted-foreground mb-2">{f.label}</div>
              <div className="text-base">{data?.[f.field] ?? '-'}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
