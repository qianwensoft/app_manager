/**
 * Shadcn 风格的 Formily 设计态组件库
 * 所有组件都使用 shadcn-ui 实现，确保设计态和运行态渲染一致
 */
import React, { type CSSProperties } from 'react'
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'
import { useNodeIdProps, DroppableWidget } from '@designable/react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Plus } from 'lucide-react'

// Space 组件的 locale 配置
export const SpaceLocales = {
  'zh-CN': {
    title: '间距容器',
    settings: {
      'field-group': '字段属性',
      'component-group': '组件属性',
      'component-style-group': '组件样式',
      'decorator-style-group': '容器样式',
      name: '字段标识',
      title: '标题',
      description: '描述',
      'x-display': '显示状态',
      'x-pattern': '表单模式',
      'x-component-props': {
        direction: '方向',
        size: '间距大小',
        align: '对齐',
        wrap: '自动换行',
        containerClassName: 'CSS 类名',
        style: {
          width: '宽度',
          height: '高度',
          display: '展示',
          background: '背景',
          boxShadow: '阴影',
          font: '字体',
          margin: '外边距',
          padding: '内边距',
          borderRadius: '圆角',
          border: '边框',
          opacity: '透明度',
        },
        containerStyle: {
          width: '宽度',
          height: '高度',
          display: '展示',
          background: '背景',
          boxShadow: '阴影',
          margin: '外边距',
          padding: '内边距',
          borderRadius: '圆角',
          border: '边框',
          opacity: '透明度',
        },
      },
      'x-component-props.style.width': '宽度',
      'x-component-props.style.height': '高度',
      'x-component-props.style.display': '展示',
      'x-component-props.style.background': '背景',
      'x-component-props.style.boxShadow': '阴影',
      'x-component-props.style.font': '字体',
      'x-component-props.style.margin': '外边距',
      'x-component-props.style.padding': '内边距',
      'x-component-props.style.borderRadius': '圆角',
      'x-component-props.style.border': '边框',
      'x-component-props.style.opacity': '透明度',
      'x-component-props.containerStyle.width': '宽度',
      'x-component-props.containerStyle.height': '高度',
      'x-component-props.containerStyle.display': '展示',
      'x-component-props.containerStyle.background': '背景',
      'x-component-props.containerStyle.boxShadow': '阴影',
      'x-component-props.containerStyle.margin': '外边距',
      'x-component-props.containerStyle.padding': '内边距',
      'x-component-props.containerStyle.borderRadius': '圆角',
      'x-component-props.containerStyle.border': '边框',
      'x-component-props.containerStyle.opacity': '透明度',
      'x-component-props.containerStyle.containerClassName': 'CSS 类名',
    },
  },
  'en-US': {
    title: 'Space',
    settings: {
      'field-group': 'Field Properties',
      'component-group': 'Component Properties',
      'component-style-group': 'Component Style',
      'decorator-style-group': 'Decorator Style',
      name: 'Name',
      title: 'Title',
      description: 'Description',
      'x-display': 'Display',
      'x-pattern': 'Pattern',
      'x-component-props': {
        direction: 'Direction',
        size: 'Size',
        align: 'Align',
        wrap: 'Wrap',
        containerClassName: 'CSS Class',
        style: {
          width: 'Width',
          height: 'Height',
          display: 'Display',
          background: 'Background',
          boxShadow: 'Box Shadow',
          font: 'Font',
          margin: 'Margin',
          padding: 'Padding',
          borderRadius: 'Radius',
          border: 'Border',
          opacity: 'Opacity',
        },
        containerStyle: {
          width: 'Width',
          height: 'Height',
          display: 'Display',
          background: 'Background',
          boxShadow: 'Box Shadow',
          margin: 'Margin',
          padding: 'Padding',
          borderRadius: 'Radius',
          border: 'Border',
          opacity: 'Opacity',
        },
      },
      'x-component-props.style.width': 'Width',
      'x-component-props.style.height': 'Height',
      'x-component-props.style.display': 'Display',
      'x-component-props.style.background': 'Background',
      'x-component-props.style.boxShadow': 'Box Shadow',
      'x-component-props.style.font': 'Font',
      'x-component-props.style.margin': 'Margin',
      'x-component-props.style.padding': 'Padding',
      'x-component-props.style.borderRadius': 'Radius',
      'x-component-props.style.border': 'Border',
      'x-component-props.style.opacity': 'Opacity',
      'x-component-props.containerStyle.width': 'Width',
      'x-component-props.containerStyle.height': 'Height',
      'x-component-props.containerStyle.display': 'Display',
      'x-component-props.containerStyle.background': 'Background',
      'x-component-props.containerStyle.boxShadow': 'Box Shadow',
      'x-component-props.containerStyle.margin': 'Margin',
      'x-component-props.containerStyle.padding': 'Padding',
      'x-component-props.containerStyle.borderRadius': 'Radius',
      'x-component-props.containerStyle.border': 'Border',
      'x-component-props.containerStyle.opacity': 'Opacity',
      'x-component-props.containerStyle.containerClassName': 'CSS Class',
    },
  },
}

// ────────────────────────────────────────────────────────────────────────────
// Form - 根节点透传容器
// ────────────────────────────────────────────────────────────────────────────

export const Form: DnFC<any> = (props) => {
  return <>{props.children}</>
}

Form.Behavior = createBehavior({
  name: 'Form',
  selector: (node) => node.componentName === 'Form',
  designerProps: {
    droppable: true,
  },
})

// ────────────────────────────────────────────────────────────────────────────
// Input - 文本输入框
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnInput: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const { title, placeholder } = props
  return (
    <div className="space-y-2" {...nodeIdProps}>
      {title && <Label>{title}</Label>}
      <Input placeholder={placeholder || '请输入'} disabled />
    </div>
  )
}

ShadcnInput.Behavior = createBehavior({
  name: 'Input',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'Input',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-component-props': {
            placeholder: '字段名称（英文）',
          },
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
          default: 'FormItem',
        },
        'x-component-props': {
          type: 'object',
          properties: {
            placeholder: {
              type: 'string',
              title: '占位提示',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            allowClear: {
              type: 'boolean',
              title: '允许清除',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            maxLength: {
              type: 'number',
              title: '最大长度',
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
            },
            showCount: {
              type: 'boolean',
              title: '显示字数',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            disabled: {
              type: 'boolean',
              title: '禁用',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            readOnly: {
              type: 'boolean',
              title: '只读',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        'x-validator': {
          type: 'array',
          title: '验证规则',
          'x-decorator': 'FormItem',
          'x-component': 'ValueInput',
          'x-component-props': {
            include: ['EXPRESSION', 'BUILTIN', 'PATTERN'],
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        default: {
          type: 'string',
          title: '默认值',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
          default: 'visible',
        },
        'x-pattern': {
          type: 'string',
          title: '表单模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '可编辑', value: 'editable' },
            { label: '只读', value: 'readOnly' },
            { label: '纯文本', value: 'readPretty' },
            { label: '禁用', value: 'disabled' },
          ],
          default: 'editable',
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '输入框' }, 'en-US': { title: 'Input' } },
})

ShadcnInput.Resource = createResource({
  icon: 'InputSource',
  elements: [{ componentName: 'Field', props: { type: 'string', 'x-component': 'Input', title: '输入框' } }],
})

// ────────────────────────────────────────────────────────────────────────────
// TextArea - 多行文本
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnTextArea: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const { title, placeholder } = props
  return (
    <div className="space-y-2" {...nodeIdProps}>
      {title && <Label>{title}</Label>}
      <Textarea placeholder={placeholder || '请输入'} disabled />
    </div>
  )
}

ShadcnTextArea.Behavior = createBehavior({
  name: 'Input.TextArea',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'Input.TextArea',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
          default: 'FormItem',
        },
        'x-component-props': {
          type: 'object',
          properties: {
            placeholder: {
              type: 'string',
              title: '占位提示',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            rows: {
              type: 'number',
              title: '行数',
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
              default: 4,
            },
            maxLength: {
              type: 'number',
              title: '最大长度',
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
            },
            showCount: {
              type: 'boolean',
              title: '显示字数',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            disabled: {
              type: 'boolean',
              title: '禁用',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            readOnly: {
              type: 'boolean',
              title: '只读',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        default: {
          type: 'string',
          title: '默认值',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
        'x-pattern': {
          type: 'string',
          title: '表单模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '可编辑', value: 'editable' },
            { label: '只读', value: 'readOnly' },
            { label: '纯文本', value: 'readPretty' },
            { label: '禁用', value: 'disabled' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '多行文本' }, 'en-US': { title: 'TextArea' } },
})

ShadcnTextArea.Resource = createResource({
  icon: 'TextAreaSource',
  elements: [{ componentName: 'Field', props: { type: 'string', 'x-component': 'Input.TextArea', title: '多行文本' } }],
})

// ────────────────────────────────────────────────────────────────────────────
// Select - 下拉选择
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnSelect: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const { title } = props
  return (
    <div className="space-y-2" {...nodeIdProps}>
      {title && <Label>{title}</Label>}
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">选项1</SelectItem>
          <SelectItem value="2">选项2</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

ShadcnSelect.Behavior = createBehavior({
  name: 'Select',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'Select',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
          default: 'FormItem',
        },
        enum: {
          type: 'array',
          title: '选项列表',
          'x-decorator': 'FormItem',
          'x-component': 'ArrayItems',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                title: '显示文本',
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
              value: {
                type: 'string',
                title: '选项值',
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
            },
          },
        },
        'x-component-props': {
          type: 'object',
          properties: {
            placeholder: {
              type: 'string',
              title: '占位提示',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            allowClear: {
              type: 'boolean',
              title: '允许清除',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            disabled: {
              type: 'boolean',
              title: '禁用',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            mode: {
              type: 'string',
              title: '选择模式',
              'x-decorator': 'FormItem',
              'x-component': 'Select',
              enum: [
                { label: '单选', value: undefined },
                { label: '多选', value: 'multiple' },
                { label: '标签', value: 'tags' },
              ],
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        default: {
          type: 'string',
          title: '默认值',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
        'x-pattern': {
          type: 'string',
          title: '表单模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '可编辑', value: 'editable' },
            { label: '只读', value: 'readOnly' },
            { label: '纯文本', value: 'readPretty' },
            { label: '禁用', value: 'disabled' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '下拉选择' }, 'en-US': { title: 'Select' } },
})

ShadcnSelect.Resource = createResource({
  icon: 'SelectSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'string',
        'x-component': 'Select',
        title: '下拉选择',
        enum: [
          { label: '选项1', value: '1' },
          { label: '选项2', value: '2' },
        ],
      },
    },
  ],
})

// ────────────────────────────────────────────────────────────────────────────
// Checkbox - 复选框
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnCheckbox: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const { title, children } = props
  const label = title || children || '复选框'
  return (
    <div className="flex items-center space-x-2" {...nodeIdProps}>
      <Checkbox disabled />
      <Label>{label}</Label>
    </div>
  )
}

ShadcnCheckbox.Behavior = createBehavior({
  name: 'Checkbox',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'Checkbox',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
        },
        'x-component-props': {
          type: 'object',
          properties: {
            disabled: {
              type: 'boolean',
              title: '禁用',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        default: {
          type: 'boolean',
          title: '默认值',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '复选框' }, 'en-US': { title: 'Checkbox' } },
})

ShadcnCheckbox.Resource = createResource({
  icon: 'CheckboxGroupSource',
  elements: [{ componentName: 'Field', props: { type: 'boolean', 'x-component': 'Checkbox', title: '复选框' } }],
})

// ────────────────────────────────────────────────────────────────────────────
// Switch - 开关
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnSwitch: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const { title, children } = props
  const label = title || children || '开关'
  return (
    <div className="flex items-center space-x-2" {...nodeIdProps}>
      <Switch disabled />
      <Label>{label}</Label>
    </div>
  )
}

ShadcnSwitch.Behavior = createBehavior({
  name: 'Switch',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'Switch',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
        },
        'x-component-props': {
          type: 'object',
          properties: {
            disabled: {
              type: 'boolean',
              title: '禁用',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        default: {
          type: 'boolean',
          title: '默认值',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '开关' }, 'en-US': { title: 'Switch' } },
})

ShadcnSwitch.Resource = createResource({
  icon: 'SwitchSource',
  elements: [{ componentName: 'Field', props: { type: 'boolean', 'x-component': 'Switch', title: '开关' } }],
})

// ────────────────────────────────────────────────────────────────────────────
// DatePicker - 日期选择
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnDatePicker: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const { title } = props
  return (
    <div className="space-y-2" {...nodeIdProps}>
      {title && <Label>{title}</Label>}
      <DatePicker disabled />
    </div>
  )
}

ShadcnDatePicker.Behavior = createBehavior({
  name: 'DatePicker',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'DatePicker',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
          default: 'FormItem',
        },
        'x-component-props': {
          type: 'object',
          properties: {
            placeholder: {
              type: 'string',
              title: '占位提示',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            format: {
              type: 'string',
              title: '日期格式',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
              'x-component-props': {
                placeholder: '如 yyyy-MM-dd',
              },
            },
            disabled: {
              type: 'boolean',
              title: '禁用',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
        'x-pattern': {
          type: 'string',
          title: '表单模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '可编辑', value: 'editable' },
            { label: '只读', value: 'readOnly' },
            { label: '纯文本', value: 'readPretty' },
            { label: '禁用', value: 'disabled' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '日期选择' }, 'en-US': { title: 'DatePicker' } },
})

ShadcnDatePicker.Resource = createResource({
  icon: 'DatePickerSource',
  elements: [{ componentName: 'Field', props: { type: 'string', 'x-component': 'DatePicker', title: '日期选择' } }],
})

// ────────────────────────────────────────────────────────────────────────────
// NumberPicker - 数字输入
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnNumberPicker: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const { title, placeholder } = props
  return (
    <div className="space-y-2" {...nodeIdProps}>
      {title && <Label>{title}</Label>}
      <Input type="number" placeholder={placeholder || '请输入数字'} disabled />
    </div>
  )
}

ShadcnNumberPicker.Behavior = createBehavior({
  name: 'NumberPicker',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'NumberPicker',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
          default: 'FormItem',
        },
        'x-component-props': {
          type: 'object',
          properties: {
            placeholder: {
              type: 'string',
              title: '占位提示',
              'x-decorator': 'FormItem',
              'x-component': 'Input',
            },
            min: {
              type: 'number',
              title: '最小值',
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
            },
            max: {
              type: 'number',
              title: '最大值',
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
            },
            step: {
              type: 'number',
              title: '步长',
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
              default: 1,
            },
            precision: {
              type: 'number',
              title: '精度',
              'x-decorator': 'FormItem',
              'x-component': 'NumberPicker',
              'x-component-props': {
                min: 0,
                max: 10,
              },
            },
            disabled: {
              type: 'boolean',
              title: '禁用',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
            readOnly: {
              type: 'boolean',
              title: '只读',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        default: {
          type: 'number',
          title: '默认值',
          'x-decorator': 'FormItem',
          'x-component': 'NumberPicker',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
        'x-pattern': {
          type: 'string',
          title: '表单模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '可编辑', value: 'editable' },
            { label: '只读', value: 'readOnly' },
            { label: '纯文本', value: 'readPretty' },
            { label: '禁用', value: 'disabled' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '数字输入' }, 'en-US': { title: 'NumberPicker' } },
})

ShadcnNumberPicker.Resource = createResource({
  icon: 'NumberPickerSource',
  elements: [{ componentName: 'Field', props: { type: 'number', 'x-component': 'NumberPicker', title: '数字输入' } }],
})

// ────────────────────────────────────────────────────────────────────────────
// Space - 间距容器
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnSpace: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const componentProps = props?.['x-component-props'] || {}

  const direction = componentProps.direction || 'horizontal'
  const size = componentProps.size ?? 8
  const align = componentProps.align
  const wrap = componentProps.wrap

  // 统一的样式处理函数
  const processStyleObject = (styleObj: any): CSSProperties => {
    const processed: CSSProperties = {}

    Object.entries(styleObj).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // 处理嵌套对象（如 background, border 等）
        // 这些通常来自 Formily 的样式 setter
        if (key === 'background' && 'backgroundColor' in value) {
          const bgValue = value as any
          processed.background = bgValue.backgroundColor || bgValue.background
        } else if (key === 'border') {
          const borderObj = value as any
          if (borderObj.style && borderObj.width && borderObj.color) {
            processed.border = `${borderObj.width}px ${borderObj.style} ${borderObj.color}`
          }
        } else if (key === 'borderRadius') {
          const br = value as any
          processed.borderRadius = `${br.topLeft || 0}px ${br.topRight || 0}px ${br.bottomRight || 0}px ${br.bottomLeft || 0}px`
        } else if (key === 'boxShadow') {
          const shadow = value as any
          if (shadow.x !== undefined) {
            processed.boxShadow = `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`
          }
        } else if (key === 'margin' || key === 'padding') {
          const spacing = value as any
          processed[key] = `${spacing.top || 0}px ${spacing.right || 0}px ${spacing.bottom || 0}px ${spacing.left || 0}px`
        }
      } else {
        // 直接应用简单值
        processed[key as keyof CSSProperties] = value as any
      }
    })

    return processed
  }

  // 处理组件样式（style）
  const componentStyle = componentProps.style || {}
  const processedComponentStyle = processStyleObject(componentStyle)

  // 处理容器样式（containerStyle）
  const containerStyle = componentProps.containerStyle || {}
  const processedContainerStyle = processStyleObject(containerStyle)

  const mergedStyle: CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    gap: `${size}px`,
    minHeight: '40px',
    minWidth: '100px',
    border: '1px dashed #d9d9d9',
    // 应用组件样式
    ...processedComponentStyle,
    // 应用容器样式
    ...processedContainerStyle,
    // 向后兼容：扁平化属性（优先级最高）
    ...(componentProps.padding && { padding: componentProps.padding }),
    ...(componentProps.backgroundColor && { backgroundColor: componentProps.backgroundColor }),
    ...(componentProps.borderRadius && { borderRadius: componentProps.borderRadius }),
    ...(componentProps.border && { border: componentProps.border }),
    ...(componentProps.boxShadow && { boxShadow: componentProps.boxShadow }),
    ...(align && { alignItems: align }),
    ...(direction === 'horizontal' && wrap && { flexWrap: 'wrap' }),
  }

  return (
    <DroppableWidget {...props}>
      <div style={mergedStyle} className={componentProps.containerClassName} {...nodeIdProps}>
        {props.children}
      </div>
    </DroppableWidget>
  )
}

ShadcnSpace.Behavior = createBehavior(
  {
    name: 'Space',
    extends: ['Field'],
    selector: (node) => node.props?.['x-component'] === 'Space',
    designerProps: {
      droppable: true,
      propsSchema: {
        type: 'object',
        properties: {
          'field-group': {
            type: 'void',
            'x-component': 'CollapseItem',
            properties: {
              name: {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
              title: {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'Input',
              },
              description: {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'Input.TextArea',
              },
              'x-display': {
                type: 'string',
                enum: ['visible', 'hidden', 'none', ''],
                'x-decorator': 'FormItem',
                'x-component': 'Select',
                'x-component-props': {
                  defaultValue: 'visible',
                },
              },
              'x-pattern': {
                type: 'string',
                enum: ['editable', 'disabled', 'readOnly', 'readPretty', ''],
                'x-decorator': 'FormItem',
                'x-component': 'Select',
                'x-component-props': {
                  defaultValue: 'editable',
                },
              },
            },
          },
          'component-group': {
            type: 'void',
            'x-component': 'CollapseItem',
            properties: {
              'x-component-props': {
                type: 'object',
                properties: {
                  direction: {
                    type: 'string',
                    'x-decorator': 'FormItem',
                    'x-component': 'Radio.Group',
                    'x-component-props': {
                      defaultValue: 'horizontal',
                      optionType: 'button',
                    },
                    enum: [
                      { label: '水平', value: 'horizontal' },
                      { label: '垂直', value: 'vertical' },
                    ],
                  },
                  size: {
                    type: 'number',
                    'x-decorator': 'FormItem',
                    'x-component': 'NumberPicker',
                    'x-component-props': {
                      defaultValue: 8,
                    },
                  },
                  align: {
                    type: 'string',
                    enum: ['start', 'end', 'center', 'baseline', 'stretch', ''],
                    'x-decorator': 'FormItem',
                    'x-component': 'Select',
                  },
                  wrap: {
                    type: 'boolean',
                    'x-decorator': 'FormItem',
                    'x-component': 'Switch',
                  },
                },
              },
            },
          },
          'component-style-group': {
            type: 'void',
            'x-component': 'CollapseItem',
            'x-component-props': { defaultExpand: false },
            properties: {
              'x-component-props.style.width': {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'SizeInput',
              },
              'x-component-props.style.height': {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'SizeInput',
              },
              'x-component-props.style.display': {
                'x-component': 'DisplayStyleSetter',
              },
              'x-component-props.style.background': {
                'x-component': 'BackgroundStyleSetter',
              },
              'x-component-props.style.boxShadow': {
                'x-component': 'BoxShadowStyleSetter',
              },
              'x-component-props.style.font': {
                'x-component': 'FontStyleSetter',
              },
              'x-component-props.style.margin': {
                'x-component': 'BoxStyleSetter',
              },
              'x-component-props.style.padding': {
                'x-component': 'BoxStyleSetter',
              },
              'x-component-props.style.borderRadius': {
                'x-component': 'BorderRadiusStyleSetter',
              },
              'x-component-props.style.border': {
                'x-component': 'BorderStyleSetter',
              },
              'x-component-props.style.opacity': {
                'x-decorator': 'FormItem',
                'x-component': 'Slider',
                'x-component-props': {
                  defaultValue: 1,
                  min: 0,
                  max: 1,
                  step: 0.01,
                },
              },
            },
          },
          'decorator-style-group': {
            type: 'void',
            'x-component': 'CollapseItem',
            'x-component-props': { defaultExpand: false },
            properties: {
              'x-component-props.containerStyle.width': {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'SizeInput',
              },
              'x-component-props.containerStyle.height': {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'SizeInput',
              },
              'x-component-props.containerStyle.display': {
                'x-component': 'DisplayStyleSetter',
              },
              'x-component-props.containerStyle.background': {
                'x-component': 'BackgroundStyleSetter',
              },
              'x-component-props.containerStyle.boxShadow': {
                'x-component': 'BoxShadowStyleSetter',
              },
              'x-component-props.containerStyle.margin': {
                'x-component': 'BoxStyleSetter',
              },
              'x-component-props.containerStyle.padding': {
                'x-component': 'BoxStyleSetter',
              },
              'x-component-props.containerStyle.borderRadius': {
                'x-component': 'BorderRadiusStyleSetter',
              },
              'x-component-props.containerStyle.border': {
                'x-component': 'BorderStyleSetter',
              },
              'x-component-props.containerStyle.opacity': {
                'x-decorator': 'FormItem',
                'x-component': 'Slider',
                'x-component-props': {
                  defaultValue: 1,
                  min: 0,
                  max: 1,
                  step: 0.01,
                },
              },
              'x-component-props.containerClassName': {
                type: 'string',
                'x-decorator': 'FormItem',
                'x-component': 'Input',
                'x-component-props': {
                  placeholder: 'shadow-sm rounded-lg',
                },
              },
            },
          },
        },
      },
    },
    designerLocales: SpaceLocales,
  },
  {
    name: 'Space.SpaceItem',
    extends: ['Field'],
    selector: (node) => node.componentName === 'Field' && node.parent?.props?.['x-component'] === 'Space',
    designerProps: {
      droppable: true,
      allowDrop: (node) => node.props?.['x-component'] !== 'Form',
    },
  }
)

ShadcnSpace.Resource = createResource({
  icon: 'SpaceSource',
  elements: [
    {
      componentName: 'Field',
      props: { type: 'void', 'x-component': 'Space', 'x-component-props': { direction: 'horizontal', size: 8 } },
    },
  ],
})

// ────────────────────────────────────────────────────────────────────────────
// ArrayCards - 自增卡片
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnArrayCards: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  return (
    <DroppableWidget {...props}>
      <div className="space-y-4" style={{ minHeight: '80px', border: '1px dashed #d9d9d9', padding: '16px' }} {...nodeIdProps}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">#1</CardTitle>
          </CardHeader>
          <CardContent>{props.children}</CardContent>
        </Card>
        <div className="text-center text-sm text-muted-foreground">设计态预览 - 自增卡片</div>
      </div>
    </DroppableWidget>
  )
}

ShadcnArrayCards.Behavior = createBehavior({
  name: 'ArrayCards',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'ArrayCards',
  designerProps: {
    droppable: true,
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
        },
        'x-component-props': {
          type: 'object',
          properties: {
            readOnly: {
              type: 'boolean',
              title: '只读模式',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '自增卡片' }, 'en-US': { title: 'ArrayCards' } },
})

ShadcnArrayCards.Resource = createResource({
  icon: 'ArrayCardsSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'array',
        'x-component': 'ArrayCards',
        title: '自增卡片',
        items: { type: 'object', properties: {} },
      },
    },
  ],
})

// ────────────────────────────────────────────────────────────────────────────
// ArrayTable - 自增表格
// ────────────────────────────────────────────────────────────────────────────

export const ShadcnArrayTable: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  return (
    <DroppableWidget {...props}>
      <div style={{ minHeight: '80px', border: '1px dashed #d9d9d9', padding: '16px' }} {...nodeIdProps}>
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs">#</th>
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs">列1</th>
                <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground text-xs w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3} className="h-24 text-center text-muted-foreground text-sm">
                  设计态预览 - 自增表格
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2">{props.children}</div>
      </div>
    </DroppableWidget>
  )
}

ShadcnArrayTable.Behavior = createBehavior({
  name: 'ArrayTable',
  extends: ['Field'],
  selector: (node) => node.props?.['x-component'] === 'ArrayTable',
  designerProps: {
    droppable: true,
    propsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: '字段标识',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        title: {
          type: 'string',
          title: '字段标题',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
        },
        description: {
          type: 'string',
          title: '字段描述',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
        'x-decorator': {
          type: 'string',
          title: '装饰器',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: 'FormItem', value: 'FormItem' },
            { label: '无', value: undefined },
          ],
        },
        'x-component-props': {
          type: 'object',
          properties: {
            readOnly: {
              type: 'boolean',
              title: '只读模式',
              'x-decorator': 'FormItem',
              'x-component': 'Switch',
            },
          },
        },
        required: {
          type: 'boolean',
          title: '必填',
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
        'x-display': {
          type: 'string',
          title: '显示模式',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          enum: [
            { label: '显示', value: 'visible' },
            { label: '隐藏', value: 'hidden' },
            { label: '不渲染', value: 'none' },
          ],
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '自增表格' }, 'en-US': { title: 'ArrayTable' } },
})

ShadcnArrayTable.Resource = createResource({
  icon: 'ArrayTableSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'array',
        'x-component': 'ArrayTable',
        title: '自增表格',
        items: { type: 'object', properties: {} },
      },
    },
  ],
})
