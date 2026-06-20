import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { FieldDef } from './types'

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
        return <Input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={def.placeholder} />
      case 'InputNumber':
      case 'NumberPicker':
        return (
          <Input
            type="number"
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            min={def.validation?.min}
            max={def.validation?.max}
            className="w-full"
          />
        )
      case 'Select':
        return (
          <Select value={value ? String(value) : undefined} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={def.placeholder || '请选择'} />
            </SelectTrigger>
            <SelectContent>
              {def.options?.map(opt => (
                <SelectItem key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case 'DatePicker':
        return <Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} className="w-full" />
      case 'Switch':
        return <Switch checked={!!value} onCheckedChange={onChange} />
      case 'Checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox checked={!!value} onCheckedChange={onChange} id={def.field} />
            <Label htmlFor={def.field}>{def.label}</Label>
          </div>
        )
      default:
        return <Input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={def.placeholder} />
    }
  }

  const hideLabel = def.component === 'Checkbox'

  return (
    <div className="mb-4">
      {!hideLabel && (
        <Label className={`block mb-1 ${def.required ? 'font-semibold' : ''}`}>
          {def.label} {def.required && <span className="text-red-600">*</span>}
        </Label>
      )}
      {renderInput()}
      {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
    </div>
  )
}
