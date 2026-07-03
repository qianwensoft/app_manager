/**
 * FormLayout schema 补丁：移除 enum 中的 null 值
 *
 * @designable/formily-antd 的 FormLayout schema 中包含了 null 值，
 * 这会导致 Ant Design Select 组件警告。此补丁覆盖默认配置。
 */
import { FormLayout as OriginalFormLayout } from '@designable/formily-antd'

// 创建补丁后的 schema，移除所有 enum 中的 null 值
const patchedSchema = {
  type: 'object',
  properties: {
    labelCol: {
      type: 'number',
      'x-decorator': 'FormItem',
      'x-component': 'NumberPicker',
    },
    wrapperCol: {
      type: 'number',
      'x-decorator': 'FormItem',
      'x-component': 'NumberPicker',
    },
    labelWidth: {
      'x-decorator': 'FormItem',
      'x-component': 'SizeInput',
    },
    wrapperWidth: {
      'x-decorator': 'FormItem',
      'x-component': 'SizeInput',
    },
    colon: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
      'x-component-props': {
        defaultChecked: true,
      },
    },
    feedbackLayout: {
      type: 'string',
      enum: ['loose', 'terse', 'popover', 'none'], // 移除 null
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      'x-component-props': {
        defaultValue: 'loose',
      },
    },
    size: {
      type: 'string',
      enum: ['large', 'small', 'default'], // 移除 null
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      'x-component-props': {
        defaultValue: 'default',
      },
    },
    layout: {
      type: 'string',
      enum: ['vertical', 'horizontal', 'inline'], // 移除 null
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      'x-component-props': {
        defaultValue: 'horizontal',
      },
    },
    tooltipLayout: {
      type: 'string',
      enum: ['icon', 'text'], // 移除 null
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      'x-component-props': {
        defaultValue: 'icon',
      },
    },
    labelAlign: {
      type: 'string',
      enum: ['left', 'right'], // 移除 null
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      'x-component-props': {
        defaultValue: 'right',
      },
    },
    wrapperAlign: {
      type: 'string',
      enum: ['left', 'right'], // 移除 null
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      'x-component-props': {
        defaultValue: 'left',
      },
    },
    labelWrap: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
    },
    wrapperWrap: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
    },
    fullness: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
    },
    inset: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
    },
    shallow: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
      'x-component-props': {
        defaultChecked: true,
      },
    },
    bordered: {
      type: 'boolean',
      'x-decorator': 'FormItem',
      'x-component': 'Switch',
      'x-component-props': {
        defaultChecked: true,
      },
    },
  },
}

// 应用补丁：遍历 Behavior 数组并修改 designerProps.propsSchema
if (Array.isArray(OriginalFormLayout.Behavior)) {
  OriginalFormLayout.Behavior.forEach((behavior: any) => {
    if (behavior.designerProps) {
      behavior.designerProps.propsSchema = patchedSchema
    }
  })
}

export const FormLayout = OriginalFormLayout

