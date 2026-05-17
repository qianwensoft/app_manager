type FieldDef = {
  field: string
  required?: boolean
  validation?: { max_length?: number; pattern?: string; min?: number; max?: number }
}

export function validateField(def: FieldDef, value: any): string | null {
  if (def.required && (value === null || value === undefined || value === '')) {
    return '此字段为必填项'
  }
  if (def.validation) {
    const { max_length, pattern, min, max } = def.validation
    if (max_length && typeof value === 'string' && value.length > max_length) {
      return `最大长度为 ${max_length}`
    }
    if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) {
      return '格式不正确'
    }
    if (min !== undefined && typeof value === 'number' && value < min) {
      return `最小值为 ${min}`
    }
    if (max !== undefined && typeof value === 'number' && value > max) {
      return `最大值为 ${max}`
    }
  }
  return null
}

export function validateForm(defs: FieldDef[], values: Record<string, any>): Record<string, string> {
  const errors: Record<string, string> = {}
  defs.forEach(def => {
    const err = validateField(def, values[def.field])
    if (err) errors[def.field] = err
  })
  return errors
}
