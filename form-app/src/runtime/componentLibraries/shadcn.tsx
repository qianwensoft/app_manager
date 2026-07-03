/**
 * shadcn/ui 组件库适配层 for Formily
 * 将 @formily/antd 组件替换为 shadcn/ui 组件
 */
import { type ReactNode } from 'react'
import { connect, mapProps, mapReadPretty } from '@formily/react'
import {
  FormItem,
  FormGrid,
  FormLayout,
  Space,
} from '@formily/antd'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import PrintButton from '../PrintButton'
import SubmitButton from '../SubmitButton'
import { ActionButton, EventButton, NavigateButton } from '../ActionButtons'
import { FeedbackButton } from '../FeedbackButton'
import { CustomButton } from '../Button'
import ConfirmDialogButton from '../ConfirmDialogButton'
import { PageHeader, Section, Divider, StaticImage, StaticText } from '../layout'
import { ShadcnArrayCards, ShadcnArrayTable } from './shadcnArrayComponents'

/**
 * design_schema 根节点 x-component 为 'Form'；外层已由库的 Form
 * 容器提供，这里把内层 Form 节点降级为透传容器。
 */
const PassthroughForm = ({ children }: { children?: ReactNode }) => <>{children}</>

/**
 * shadcn Input 适配 Formily
 * - value/onChange 自动映射
 * - readPretty 模式显示纯文本
 */
const FormilyInput = connect(
  Input,
  mapProps((props: any) => ({
    ...props,
    value: props.value ?? '',
  })),
  mapReadPretty((props: any) => <span>{props.value || '-'}</span>)
)

/**
 * shadcn Textarea 适配
 */
const FormilyTextarea = connect(
  Textarea,
  mapProps((props: any) => ({
    ...props,
    value: props.value ?? '',
  })),
  mapReadPretty((props: any) => <span className="whitespace-pre-wrap">{props.value || '-'}</span>)
)

/**
 * shadcn Select 适配 Formily
 * Formily 会将 schema 的 enum 传递为 field.dataSource，
 * 我们需要用 mapProps 将 dataSource 映射为组件的 options
 */
const FormilySelect = connect(
  (props: any) => {
    const { value, onChange, options = [], placeholder } = props
    console.log('[FormilySelect] props:', { value, options, placeholder, allProps: props })
    return (
      <Select value={value ? String(value) : undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder || '请选择'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt: any) => (
            <SelectItem key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  },
  mapProps({
    dataSource: 'options',
  }),
  mapReadPretty((props: any) => {
    const { value, options = [] } = props
    const item = options.find((opt: any) => String(opt.value) === String(value))
    return <span>{item?.label || value || '-'}</span>
  })
)

/**
 * shadcn Checkbox 适配（单个复选框）
 */
const FormilyCheckbox = connect(
  (props: any) => {
    const { value, onChange, children } = props
    return (
      <div className="flex items-center space-x-2">
        <Checkbox
          checked={!!value}
          onCheckedChange={onChange}
          id={props.id}
        />
        {children && <Label htmlFor={props.id}>{children}</Label>}
      </div>
    )
  },
  mapReadPretty((props: any) => <span>{props.value ? '是' : '否'}</span>)
)

/**
 * shadcn Switch 适配
 */
const FormilySwitch = connect(
  Switch,
  mapProps((props: any, field: any) => ({
    ...props,
    checked: !!props.value,
    onCheckedChange: props.onChange,
  })),
  mapReadPretty((props: any) => <span>{props.value ? '开' : '关'}</span>)
)

/**
 * NumberPicker 简单实现（Input type=number）
 */
const FormilyNumberPicker = connect(
  (props: any) => {
    const { value, onChange, ...rest } = props
    return (
      <Input
        {...rest}
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const num = e.target.value === '' ? undefined : Number(e.target.value)
          onChange?.(num)
        }}
      />
    )
  },
  mapReadPretty((props: any) => <span>{props.value ?? '-'}</span>)
)

/**
 * Password 密码输入
 */
const FormilyPassword = connect(
  (props: any) => <Input {...props} type="password" value={props.value ?? ''} />,
  mapReadPretty(() => <span>******</span>)
)

/**
 * 与具体 UI 库无关的业务组件
 */
export const sharedComponents = {
  PrintButton,
  SubmitButton,
  ActionButton,
  EventButton,
  NavigateButton,
  FeedbackButton,
  CustomButton,
  ConfirmDialogButton,
  PageHeader,
  Section,
  Divider,
  StaticImage,
  StaticText,
}

/**
 * shadcn/ui 组件表：抽象 x-component 名 → shadcn 组件
 */
export const shadcnComponents = {
  Form: PassthroughForm,
  FormItem,
  FormGrid,
  FormLayout,
  Space,
  Input: FormilyInput,
  'Input.TextArea': FormilyTextarea,
  Password: FormilyPassword,
  NumberPicker: FormilyNumberPicker,
  Select: FormilySelect,
  Checkbox: FormilyCheckbox,
  Switch: FormilySwitch,
  ArrayCards: ShadcnArrayCards,
  ArrayTable: ShadcnArrayTable,
  // 暂不支持的高级组件（后续按需添加）：
  // DatePicker, TimePicker, Upload, TreeSelect, Cascader, Transfer
  // Radio, Rate, Slider
  ...sharedComponents,
}

/** shadcn 的表单容器组件（简化版，只提供基本布局） */
export const ShadcnFormContainer = ({ children }: { children?: ReactNode }) => (
  <div className="space-y-6">{children}</div>
)
