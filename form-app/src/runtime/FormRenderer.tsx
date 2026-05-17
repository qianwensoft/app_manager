import { useState } from 'react'
import { Button, message } from 'antd'
import FieldRenderer from './FieldRenderer'
import { validateForm } from './FieldValidator'

type FieldDef = {
  field: string
  label: string
  component: string
  required?: boolean
  options?: { label: string; value: any }[]
  placeholder?: string
  validation?: { max_length?: number; pattern?: string; min?: number; max?: number }
}

type FormRendererProps = {
  fields: FieldDef[]
  initialValues?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<void>
  submitLabel?: string
}

export default function FormRenderer({ fields, initialValues = {}, onSubmit, submitLabel = '提交' }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, any>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleChange = (field: string, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleSubmit = async () => {
    const validationErrors = validateForm(fields, values)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      message.error('请检查表单错误')
      return
    }
    setLoading(true)
    try {
      await onSubmit(values)
      message.success('提交成功')
    } catch (e: any) {
      message.error(e.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      {fields.map(def => (
        <FieldRenderer
          key={def.field}
          def={def}
          value={values[def.field]}
          onChange={val => handleChange(def.field, val)}
          error={errors[def.field]}
        />
      ))}
      <Button type="primary" onClick={handleSubmit} loading={loading} style={{ marginTop: 16 }}>
        {submitLabel}
      </Button>
    </div>
  )
}
