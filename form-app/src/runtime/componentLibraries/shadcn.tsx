/**
 * shadcn/ui 组件库适配层 for Formily
 * 将 @formily/antd 组件替换为 shadcn/ui 组件
 */
import { type ReactNode, type CSSProperties } from 'react'
import { connect, mapProps, mapReadPretty } from '@formily/react'
import {
  FormItem,
  FormGrid,
  FormLayout,
} from '@formily/antd'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
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
 * 容器提供，这里把内层 Form 节点降级为透传容器，但保留样式支持。
 */
const PassthroughForm = ({ children, style, className }: { children?: ReactNode; style?: CSSProperties; className?: string }) => (
  <div style={style} className={className}>{children}</div>
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

// 为 Input 添加 TextArea 子组件，支持 Input.TextArea 语法
// 使用类型断言绕过 TypeScript 检查
;(FormilyInput as any).TextArea = FormilyTextarea

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
 * DatePicker 日期选择器
 */
const FormilyDatePicker = connect(
  DatePicker,
  mapProps((props: any) => {
    const { value, onChange, ...rest } = props
    return {
      ...rest,
      value: value ? (value instanceof Date ? value : new Date(value)) : undefined,
      onChange: (date: Date | undefined) => {
        // Convert to ISO date string for Formily
        onChange?.(date ? date.toISOString().split('T')[0] : undefined)
      },
    }
  }),
  mapReadPretty((props: any) => <span>{props.value || '-'}</span>)
)

/**
 * 自定义 Space 组件，支持容器样式配置
 *
 * 支持 x-component-props:
 * - direction: 'horizontal' | 'vertical' (默认 'horizontal')
 * - size: number (间距，默认 8)
 * - align: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
 * - wrap: boolean (是否换行，仅 horizontal 时有效)
 * - style: CSSProperties (组件自身样式)
 * - containerStyle: CSSProperties (容器样式对象)
 * - containerClassName: string (容器 className)
 * - 向后兼容扁平化属性: padding, backgroundColor, borderRadius, border, boxShadow
 */
const FormilySpace = ({
  children,
  direction = 'horizontal',
  size = 8,
  align,
  wrap = false,
  style = {},
  containerStyle = {},
  containerClassName = '',
  padding,
  backgroundColor,
  borderRadius,
  border,
  boxShadow,
}: {
  children?: ReactNode
  direction?: 'horizontal' | 'vertical'
  size?: number
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
  wrap?: boolean
  style?: CSSProperties
  containerStyle?: CSSProperties
  containerClassName?: string
  // 向后兼容的扁平化属性
  padding?: string
  backgroundColor?: string
  borderRadius?: string
  border?: string
  boxShadow?: string
}) => {
  const isHorizontal = direction === 'horizontal'

  // 合并所有样式：基础样式 + style + containerStyle + 扁平化属性（优先级最高）
  const mergedStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isHorizontal ? 'row' : 'column',
    gap: `${size}px`,
    ...(align && { alignItems: align }),
    ...(isHorizontal && wrap && { flexWrap: 'wrap' }),
    ...style,
    ...containerStyle,
    // 扁平化属性优先级最高（向后兼容）
    ...(padding && { padding }),
    ...(backgroundColor && { backgroundColor }),
    ...(borderRadius && { borderRadius }),
    ...(border && { border }),
    ...(boxShadow && { boxShadow }),
  }

  return (
    <div style={mergedStyle} className={containerClassName}>
      {children}
    </div>
  )
}

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
  Space: FormilySpace,
  Input: FormilyInput,
  'Input.TextArea': FormilyTextarea,
  TextArea: FormilyTextarea,  // 添加不带点号的别名
  Password: FormilyPassword,
  NumberPicker: FormilyNumberPicker,
  Select: FormilySelect,
  Checkbox: FormilyCheckbox,
  Switch: FormilySwitch,
  DatePicker: FormilyDatePicker,
  ArrayCards: ShadcnArrayCards,
  ArrayTable: ShadcnArrayTable,
  // 暂不支持的高级组件（后续按需添加）：
  // TimePicker, Upload, TreeSelect, Cascader, Transfer
  // Radio, Rate, Slider
  ...sharedComponents,
}

/** shadcn 的表单容器组件（支持自定义样式） */
export const ShadcnFormContainer = ({ children, style, className }: { children?: ReactNode; style?: CSSProperties; className?: string }) => (
  <div className={className || "space-y-6"} style={style}>{children}</div>
)
