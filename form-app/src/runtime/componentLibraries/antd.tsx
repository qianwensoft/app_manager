import { type ReactNode } from 'react'
import {
  Form as FormilyAntdForm,
  FormItem,
  FormGrid,
  FormLayout,
  FormTab,
  FormCollapse,
  Space,
  Input,
  Password,
  NumberPicker,
  Select,
  TreeSelect,
  Cascader,
  Transfer,
  DatePicker,
  TimePicker,
  Switch,
  Radio,
  Checkbox,
  Upload,
  ArrayCards,
  ArrayTable,
} from '@formily/antd'
import { Card, Rate, Slider } from 'antd'
import PrintButton from '../PrintButton'
import SubmitButton from '../SubmitButton'
import { ActionButton, EventButton, NavigateButton } from '../ActionButtons'
import { FeedbackButton } from '../FeedbackButton'
import { CustomButton } from '../Button'
import { PageHeader, Section, Divider, StaticImage, StaticText } from '../layout'

/**
 * design_schema 根节点 x-component 为 'Form'（来自布局设计器）；外层已由库的 Form
 * 容器提供，这里把内层 Form 节点降级为透传容器，否则 Formily 找不到 'Form' 组件
 * 会渲染原生 <Form> 并丢失字段上下文。各库共用这一处理。
 */
const PassthroughForm = ({ children }: { children?: ReactNode }) => <>{children}</>

/**
 * 与具体 UI 库无关的业务组件 / 页面布局 void 组件。每个库的组件表都会合并这一份，
 * 保证按钮、打印、页头等在任意终端都可渲染。
 */
export const sharedComponents = {
  PrintButton,
  SubmitButton,
  ActionButton,
  EventButton,
  NavigateButton,
  FeedbackButton,
  CustomButton,
  PageHeader,
  Section,
  Divider,
  StaticImage,
  StaticText,
}

/** antd（桌面）组件表：抽象 x-component 名 → @formily/antd 组件。 */
export const antdComponents = {
  Form: PassthroughForm,
  FormItem,
  FormGrid,
  FormLayout,
  FormTab,
  FormCollapse,
  Space,
  Card,
  Input,
  Password,
  NumberPicker,
  Select,
  TreeSelect,
  Cascader,
  Transfer,
  DatePicker,
  TimePicker,
  Switch,
  Radio,
  Checkbox,
  Rate,
  Slider,
  Upload,
  ArrayCards,
  ArrayTable,
  ...sharedComponents,
}

/** antd 的表单容器组件（FormProvider 内层）。 */
export const AntdFormContainer = FormilyAntdForm
