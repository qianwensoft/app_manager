/**
 * 字段定义与 Formily Schema 之间的双向转换工具
 */

/** 字段组件名 → Formily 组件名 */
const COMP_MAP: Record<string, string> = {
  Input: 'Input',
  InputNumber: 'NumberPicker',
  NumberPicker: 'NumberPicker',
  Select: 'Select',
  DatePicker: 'DatePicker',
  Switch: 'Switch',
  Rate: 'Rate',
  Slider: 'Slider',
  Checkbox: 'Checkbox',
  Radio: 'Radio',
}

/** Formily 组件名 → 字段组件名（反向映射） */
const REVERSE_COMP_MAP: Record<string, string> = {
  Input: 'Input',
  NumberPicker: 'InputNumber',
  Select: 'Select',
  DatePicker: 'DatePicker',
  Switch: 'Switch',
  Rate: 'Rate',
  Slider: 'Slider',
  Checkbox: 'Checkbox',
  Radio: 'Radio',
}

/**
 * 将 config_json.field_definitions 转换为 Formily JSON Schema
 * @param fieldDefs 字段定义数组
 * @returns Formily design_schema 对象
 */
export function fieldDefsToSchema(fieldDefs: any[]): object {
  const properties: Record<string, any> = {}
  fieldDefs.forEach((f, index) => {
    if (!f.field) return
    properties[f.field] = {
      name: f.field,
      type: 'string',
      title: f.label || f.field,
      'x-decorator': 'FormItem',
      'x-decorator-props': {},
      'x-component': COMP_MAP[f.component] || 'Input',
      'x-component-props': {
        ...(f.placeholder ? { placeholder: f.placeholder } : {}),
      },
      ...(f.required ? { 'x-validator': [{ required: true, message: '此项为必填' }] } : {}),
      'x-index': index,
    }
  })
  return {
    form: { labelCol: 6, wrapperCol: 14 },
    schema: {
      type: 'object',
      properties: {
        form: {
          type: 'void',
          'x-component': 'Form',
          'x-component-props': {},
          properties,
        },
      },
    },
  }
}

/**
 * 将 Formily JSON Schema 转换回 field_definitions
 * @param schema Formily design_schema 对象
 * @returns 字段定义数组
 */
export function schemaToFieldDefs(schema: any): any[] {
  const formProperties = schema?.schema?.properties?.form?.properties || schema?.schema?.properties || {}
  const fieldDefs: any[] = []

  // 按 x-index 排序
  const entries = Object.entries(formProperties).map(([key, value]: [string, any]) => ({
    key,
    value,
    index: value['x-index'] ?? 999
  }))
  entries.sort((a, b) => a.index - b.index)

  entries.forEach(({ key, value }) => {
    const component = value['x-component']
    // 跳过布局组件、展示组件、业务组件
    if (['Form', 'FormLayout', 'FormGrid', 'FormTab', 'Card', 'Space', 'FormCollapse', 'ObjectContainer', 'ArrayCards', 'ArrayTable', 'Text', 'SubmitButton', 'ConfirmDialogButton', 'ScanTrigger', 'CardList'].includes(component)) {
      return
    }

    const fieldDef: any = {
      field: value.name || key,
      label: value.title || key,
      component: REVERSE_COMP_MAP[component] || 'Input',
    }

    // 必填
    const validators = value['x-validator']
    if (Array.isArray(validators)) {
      const requiredValidator = validators.find((v: any) => v.required)
      if (requiredValidator) {
        fieldDef.required = true
      }
    }

    // placeholder
    const componentProps = value['x-component-props'] || {}
    if (componentProps.placeholder) {
      fieldDef.placeholder = componentProps.placeholder
    }

    fieldDefs.push(fieldDef)
  })

  return fieldDefs
}
