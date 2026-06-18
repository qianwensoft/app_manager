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
  PrintButton: 'PrintButton',
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
 *
 * 输出结构与 @designable/formily 的 transformToSchema 保持一致：
 * 字段直接挂在 schema.properties 下（不再额外包裹一层 x-component=Form 的节点），
 * 这样自动生成的 design_schema 才能被布局设计器正确加载、选中与编辑。
 *
 * 注意：不再自动追加提交按钮。是否在运行时渲染提交按钮，由页面级
 * config.show_default_submit 开关控制（见 SchemaFormRenderer）。
 * 需要按钮时请在布局设计器中显式拖入「提交按钮 / 动作按钮」等组件。
 *
 * @param fieldDefs 字段定义数组
 * @returns Formily design_schema 对象
 */
export function fieldDefsToSchema(fieldDefs: any[]): object {
  const properties: Record<string, any> = {}
  fieldDefs.forEach((f, index) => {
    if (!f.field) return
    if (f.component === 'PrintButton') {
      // 打印按钮：void 字段，不绑定数据，透传打印属性
      properties[f.field] = {
        type: 'void',
        title: f.label || '',
        'x-component': 'PrintButton',
        'x-component-props': {
          templateId: f.print_template_id || undefined,
          buttonId: f.button_id || undefined,
          text: f.button_text || f.label || '打印',
          type: f.button_type || 'default',
          block: f.button_block ?? true,
        },
        'x-index': index,
      }
      return
    }
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
      properties,
    },
  }
}

/**
 * 兼容历史数据：旧版自动生成的 design_schema 会把字段包裹在
 * schema.properties.form（x-component=Form）下，这与设计器期望的
 * 「字段直接挂 schema.properties」结构不符，导致无法在 formily 中编辑。
 * 加载到设计器前调用本函数把这层包裹摊平。
 */
export function normalizeDesignSchema(schema: any): any {
  const props = schema?.schema?.properties
  if (!props) return schema
  const keys = Object.keys(props)
  // 仅当顶层唯一节点是 x-component=Form 的容器时才摊平
  if (keys.length === 1) {
    const only = props[keys[0]]
    if (only && only['x-component'] === 'Form' && only.properties) {
      return {
        ...schema,
        schema: {
          ...schema.schema,
          properties: only.properties,
        },
      }
    }
  }
  return schema
}

/**
 * 将 Formily JSON Schema 转换回 field_definitions
 * @param schema Formily design_schema 对象
 * @returns 字段定义数组
 */
export function schemaToFieldDefs(schema: any): any[] {
  const formProperties = schema?.schema?.properties?.form?.properties || schema?.schema?.properties || {}
  const fieldDefs: any[] = []
  const seen = new Set<string>()

  // 布局/展示/业务容器：自身跳过，但需递归其子节点以保留容器内字段
  const CONTAINER = new Set([
    'Form', 'FormLayout', 'FormGrid', 'FormTab', 'FormTab.TabPane',
    'Card', 'Space', 'FormCollapse', 'FormCollapse.CollapsePanel',
    'ObjectContainer', 'ArrayCards', 'ArrayTable',
    'Section', // 页面布局分区容器
  ])
  // 非字段展示/业务组件：自身与子节点都不作为表单字段收集
  const NON_FIELD = new Set([
    'Text', 'SubmitButton', 'ConfirmDialogButton', 'ScanTrigger', 'CardList',
    'ActionButton', 'EventButton', 'NavigateButton',
    // 页面布局/展示 void 组件：仅存在于 design_schema，不进 field_definitions
    'PageHeader', 'Divider', 'StaticImage', 'StaticText',
  ])

  const collect = (props: Record<string, any>) => {
    if (!props || typeof props !== 'object') return
    const entries = Object.entries(props).map(([key, value]: [string, any]) => ({
      key,
      value,
      index: value?.['x-index'] ?? 999,
    }))
    entries.sort((a, b) => a.index - b.index)

    entries.forEach(({ key, value }) => {
      if (!value || typeof value !== 'object') return
      const component = value['x-component']

      if (NON_FIELD.has(component)) return

      if (component === 'PrintButton') {
        const fieldName = value.name || key
        if (seen.has(fieldName)) return
        seen.add(fieldName)
        const cp = value['x-component-props'] || {}
        fieldDefs.push({
          field: fieldName,
          label: value.title || cp.text || '打印',
          component: 'PrintButton',
          print_template_id: cp.templateId,
          button_id: cp.buttonId,
          button_text: cp.text,
          button_type: cp.type,
          button_block: cp.block,
        })
        return
      }

      if (CONTAINER.has(component)) {
        // 递归容器自身的 properties 与数组的 items.properties
        if (value.properties) collect(value.properties)
        if (value.items?.properties) collect(value.items.properties)
        return
      }

      // 真实输入字段
      const fieldName = value.name || key
      if (seen.has(fieldName)) return
      seen.add(fieldName)

      const fieldDef: any = {
        field: fieldName,
        label: value.title || key,
        component: REVERSE_COMP_MAP[component] || 'Input',
      }

      const validators = value['x-validator']
      if (Array.isArray(validators)) {
        const requiredValidator = validators.find((v: any) => v.required)
        if (requiredValidator) {
          fieldDef.required = true
        }
      }

      const componentProps = value['x-component-props'] || {}
      if (componentProps.placeholder) {
        fieldDef.placeholder = componentProps.placeholder
      }

      fieldDefs.push(fieldDef)

      // 字段下若仍嵌套 properties（极少数 Object 字段），继续递归
      if (value.properties) collect(value.properties)
    })
  }

  collect(formProperties)
  return fieldDefs
}
