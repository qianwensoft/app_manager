import { Input, InputNumber, Select, DatePicker, Switch, Rate, Slider, Checkbox, Radio } from 'antd'

type FieldDef = {
  field: string
  label: string
  component: string
  required?: boolean
  options?: { label: string; value: any }[]
  placeholder?: string
  validation?: { max_length?: number; pattern?: string; min?: number; max?: number }
}

type FieldRendererProps = {
  def: FieldDef
  value: any
  onChange: (val: any) => void
  error?: string
}

export default function FieldRenderer({ def, value, onChange, error }: FieldRendererProps) {
  const renderInput = () => {
    switch (def.component) {
      case 'Input':
        return <Input value={value} onChange={e => onChange(e.target.value)} placeholder={def.placeholder} />
      case 'InputNumber':
        return <InputNumber value={value} onChange={onChange} style={{ width: '100%' }} min={def.validation?.min} max={def.validation?.max} />
      case 'Select':
        return (
          <Select value={value} onChange={onChange} style={{ width: '100%' }} placeholder={def.placeholder}>
            {def.options?.map(opt => <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>)}
          </Select>
        )
      case 'DatePicker':
        return <DatePicker value={value} onChange={onChange} style={{ width: '100%' }} />
      case 'Switch':
        return <Switch checked={value} onChange={onChange} />
      case 'Rate':
        return <Rate value={value} onChange={onChange} />
      case 'Slider':
        return <Slider value={value} onChange={onChange} min={def.validation?.min} max={def.validation?.max} />
      case 'Checkbox':
        return <Checkbox checked={value} onChange={e => onChange(e.target.checked)}>{def.label}</Checkbox>
      case 'Radio':
        return (
          <Radio.Group value={value} onChange={e => onChange(e.target.value)}>
            {def.options?.map(opt => <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>)}
          </Radio.Group>
        )
      default:
        return <Input value={value} onChange={e => onChange(e.target.value)} />
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 4, fontWeight: def.required ? 'bold' : 'normal' }}>
        {def.label} {def.required && <span style={{ color: 'red' }}>*</span>}
      </label>
      {renderInput()}
      {error && <div style={{ color: 'red', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  )
}
