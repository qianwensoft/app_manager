/**
 * 设计态「页面布局 / 展示」组件（@designable 自定义资源），由 PageDesignerPage 注册到
 * 「页面布局」分组。它们都是 type:'void' 字段，对应运行态 runtime/layout.tsx 的同名组件。
 *
 * 设计态只负责：画布预览 + 属性面板（propsSchema）+ 资源拖拽项（Resource）。
 * 真正渲染由运行态组件完成；这里的预览尽量贴近运行态外观即可。
 */
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'
import { useNodeIdProps } from '@designable/react'
import {
  PageHeader as RtPageHeader,
  Section as RtSection,
  Divider as RtDivider,
  StaticImage as RtStaticImage,
  StaticText as RtStaticText,
} from '../runtime/layout'

const cp = (props: any) => props?.['x-component-props'] || {}

// ── 页头 ──────────────────────────────────────────────────────────────

export const PageHeader: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  const componentProps = cp(props)
  return (
    <div {...nodeIdProps}>
      <RtPageHeader {...componentProps} />
    </div>
  )
}

PageHeader.Behavior = createBehavior({
  name: 'PageHeader',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'PageHeader',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            title: { type: 'string', title: '标题', 'x-decorator': 'FormItem', 'x-component': 'Input' },
            subtitle: { type: 'string', title: '副标题', 'x-decorator': 'FormItem', 'x-component': 'Input' },
            align: {
              type: 'string', title: '对齐', 'x-decorator': 'FormItem', 'x-component': 'Select',
              enum: [{ label: '左对齐', value: 'left' }, { label: '居中', value: 'center' }],
            },
            background: { type: 'string', title: '背景色', 'x-decorator': 'FormItem', 'x-component': 'ColorInput' },
            color: { type: 'string', title: '文字色', 'x-decorator': 'FormItem', 'x-component': 'ColorInput' },
          },
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '页头' }, 'en-US': { title: 'PageHeader' } },
})

PageHeader.Resource = createResource({
  icon: 'TextSource',
  elements: [{
    componentName: 'Field',
    props: { type: 'void', 'x-component': 'PageHeader', 'x-component-props': { title: '页面标题', subtitle: '', align: 'left' } },
  }],
})

// ── 分区容器 ──────────────────────────────────────────────────────────

export const Section: DnFC<any> = (props) => (
  <RtSection {...cp(props)}>{props.children}</RtSection>
)

Section.Behavior = createBehavior({
  name: 'Section',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'Section',
  designerProps: {
    droppable: true,
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            title: { type: 'string', title: '分区标题', 'x-decorator': 'FormItem', 'x-component': 'Input' },
            bordered: { type: 'boolean', title: '显示边框', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
            background: { type: 'string', title: '背景色', 'x-decorator': 'FormItem', 'x-component': 'Input' },
          },
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '分区' }, 'en-US': { title: 'Section' } },
})

Section.Resource = createResource({
  icon: 'CardSource',
  elements: [{
    componentName: 'Field',
    props: { type: 'void', 'x-component': 'Section', 'x-component-props': { title: '分区', bordered: true } },
  }],
})

// ── 分割线 ────────────────────────────────────────────────────────────

export const Divider: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  return <div {...nodeIdProps}><RtDivider {...cp(props)} /></div>
}

Divider.Behavior = createBehavior({
  name: 'Divider',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'Divider',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            text: { type: 'string', title: '文字', 'x-decorator': 'FormItem', 'x-component': 'Input' },
            dashed: { type: 'boolean', title: '虚线', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
          },
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '分割线' }, 'en-US': { title: 'Divider' } },
})

Divider.Resource = createResource({
  icon: 'TextSource',
  elements: [{
    componentName: 'Field',
    props: { type: 'void', 'x-component': 'Divider', 'x-component-props': {} },
  }],
})

// ── 静态图片 ──────────────────────────────────────────────────────────

export const StaticImage: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  return <div {...nodeIdProps}><RtStaticImage {...cp(props)} /></div>
}

StaticImage.Behavior = createBehavior({
  name: 'StaticImage',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'StaticImage',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            src: { type: 'string', title: '图片地址', 'x-decorator': 'FormItem', 'x-component': 'Input' },
            alt: { type: 'string', title: '替代文本', 'x-decorator': 'FormItem', 'x-component': 'Input' },
            width: { type: 'string', title: '宽度', 'x-decorator': 'FormItem', 'x-component': 'Input', 'x-component-props': { placeholder: '如 100% / 200px' } },
            rounded: { type: 'boolean', title: '圆角', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
          },
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '图片' }, 'en-US': { title: 'StaticImage' } },
})

StaticImage.Resource = createResource({
  icon: 'TextSource',
  elements: [{
    componentName: 'Field',
    props: { type: 'void', 'x-component': 'StaticImage', 'x-component-props': { src: '', width: '100%' } },
  }],
})

// ── 静态文本 ──────────────────────────────────────────────────────────

export const StaticText: DnFC<any> = (props) => {
  const nodeIdProps = useNodeIdProps()
  return <div {...nodeIdProps}><RtStaticText {...cp(props)} /></div>
}

StaticText.Behavior = createBehavior({
  name: 'StaticText',
  extends: ['Field'],
  selector: node => node.props?.['x-component'] === 'StaticText',
  designerProps: {
    propsSchema: {
      type: 'object',
      properties: {
        'x-component-props': {
          type: 'object',
          properties: {
            content: { type: 'string', title: '内容', 'x-decorator': 'FormItem', 'x-component': 'Input.TextArea' },
            fontSize: { type: 'number', title: '字号', 'x-decorator': 'FormItem', 'x-component': 'NumberPicker' },
            color: { type: 'string', title: '颜色', 'x-decorator': 'FormItem', 'x-component': 'Input' },
            align: {
              type: 'string', title: '对齐', 'x-decorator': 'FormItem', 'x-component': 'Select',
              enum: [{ label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' }],
            },
            bold: { type: 'boolean', title: '加粗', 'x-decorator': 'FormItem', 'x-component': 'Switch' },
          },
        },
      },
    },
  },
  designerLocales: { 'zh-CN': { title: '静态文本' }, 'en-US': { title: 'StaticText' } },
})

StaticText.Resource = createResource({
  icon: 'TextSource',
  elements: [{
    componentName: 'Field',
    props: { type: 'void', 'x-component': 'StaticText', 'x-component-props': { content: '文本内容', fontSize: 14 } },
  }],
})
