import 'antd-mobile/es/global'
import {
  FormItem as MFormItem,
  FormLayout as MFormLayout,
  FormGrid as MFormGrid,
  Input as MInput,
  Selector as MSelector,
  Checkbox as MCheckbox,
  Switch as MSwitch,
  NumberPicker as MNumberPicker,
  DatePicker as MDatePicker,
  Cascader as MCascader,
  Space as MSpace,
} from '@formily/antd-mobile'
import {
  // 移动库缺失的组件用桌面 antd 兜底——在移动 WebView 里 antd 也能正常渲染，
  // 避免白屏。后续如需更佳移动体验可逐个替换为原生移动组件。
  Password,
  TreeSelect,
  Transfer,
  TimePicker,
  Radio,
  Upload,
  ArrayCards,
  ArrayTable,
  FormTab,
  FormCollapse,
} from '@formily/antd'
import { Card, Rate, Slider } from 'antd'
import { sharedComponents, antdComponents } from './antd'

/**
 * antd-mobile（移动 / H5）组件表：抽象 x-component 名 → @formily/antd-mobile 组件。
 *
 * 设计原则：schema 用的是与库无关的抽象组件名（Input/Select/DatePicker…）。这里把它们
 * 映射到移动库的对应实现；移动库没有的（Password/TreeSelect/Transfer/Rate/Slider 等）退回
 * 桌面 antd 实现，保证不丢渲染。映射的目标是「同名抽象组件在移动端有更合适的形态」，
 * 例如 Select→Selector（点选块）。
 */
export const antdMobileComponents = {
  Form: antdComponents.Form, // 透传容器，库无关
  FormItem: MFormItem,
  FormGrid: MFormGrid,
  FormLayout: MFormLayout,
  FormTab,
  FormCollapse,
  Space: MSpace,
  Card,
  Input: MInput,
  Password,
  NumberPicker: MNumberPicker,
  // 移动端 Select 用 Selector（块状点选）更顺手；如需下拉仍可在 schema 指定 antd 库。
  Select: MSelector,
  TreeSelect,
  Cascader: MCascader,
  Transfer,
  DatePicker: MDatePicker,
  TimePicker,
  Switch: MSwitch,
  Radio,
  Checkbox: MCheckbox,
  Rate,
  Slider,
  Upload,
  ArrayCards,
  ArrayTable,
  ...sharedComponents,
}
