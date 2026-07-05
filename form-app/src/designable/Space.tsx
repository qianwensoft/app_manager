/**
 * Space 组件设计态定义 — 支持容器样式配置
 * 使用 shadcn 风格实现，确保与运行态渲染一致
 */
import { createBehavior, createResource } from '@designable/core'
import type { DnFC } from '@designable/react'
import { observer } from '@formily/react'
import { DroppableWidget } from '@designable/react'
import type { CSSProperties } from 'react'

export const Space: DnFC<any> = observer((props) => {
  const componentProps = props?.['x-component-props'] || {}

  const direction = componentProps.direction || 'horizontal'
  const size = componentProps.size ?? 8
  const align = componentProps.align
  const wrap = componentProps.wrap

  // 合并容器样式
  const containerStyle = componentProps.containerStyle || {}
  const mergedStyle: CSSProperties = {
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    gap: `${size}px`,
    minHeight: '40px',
    minWidth: '100px',
    border: '1px dashed #d9d9d9',
    ...containerStyle,
    ...(componentProps.padding && { padding: componentProps.padding }),
    ...(componentProps.backgroundColor && { backgroundColor: componentProps.backgroundColor }),
    ...(componentProps.borderRadius && { borderRadius: componentProps.borderRadius }),
    ...(componentProps.border && { border: componentProps.border }),
    ...(componentProps.boxShadow && { boxShadow: componentProps.boxShadow }),
    ...(align && { alignItems: align }),
    ...(direction === 'horizontal' && wrap && { flexWrap: 'wrap' }),
  }

  // 设计态：使用 DroppableWidget 确保空容器也可见可拖拽
  return (
    <DroppableWidget>
      <div style={mergedStyle} className={componentProps.containerClassName}>
        {props.children}
      </div>
    </DroppableWidget>
  )
})

Space.Behavior = createBehavior(
  {
    name: 'Space',
    extends: ['Field'],
    selector: (node) => node.props?.['x-component'] === 'Space',
    designerProps: {
      droppable: true,
      propsSchema: {
        type: 'object',
        properties: {
          'x-component-props': {
            type: 'object',
            properties: {
              // ── 组件样式 ──
              'style-group': {
                type: 'void',
                'x-component': 'FormCollapse',
                'x-component-props': {
                  ghost: true,
                  defaultActiveKey: ['layout'],
                },
                properties: {
                  layout: {
                    type: 'void',
                    'x-component': 'FormCollapse.CollapsePanel',
                    'x-component-props': { header: '组件样式' },
                    properties: {
                      direction: {
                        type: 'string',
                        title: '排列方向',
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        enum: [
                          { label: '水平', value: 'horizontal' },
                          { label: '垂直', value: 'vertical' },
                        ],
                        default: 'horizontal',
                      },
                      size: {
                        type: 'number',
                        title: '间距(px)',
                        'x-decorator': 'FormItem',
                        'x-component': 'NumberPicker',
                        default: 8,
                      },
                      align: {
                        type: 'string',
                        title: '对齐方式',
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        enum: [
                          { label: '顶部', value: 'start' },
                          { label: '居中', value: 'center' },
                          { label: '底部', value: 'end' },
                          { label: '基线', value: 'baseline' },
                          { label: '拉伸', value: 'stretch' },
                        ],
                      },
                      wrap: {
                        type: 'boolean',
                        title: '自动换行',
                        'x-decorator': 'FormItem',
                        'x-component': 'Switch',
                      },
                    },
                  },
                  container: {
                    type: 'void',
                    'x-component': 'FormCollapse.CollapsePanel',
                    'x-component-props': { header: '容器样式' },
                    properties: {
                      containerClassName: {
                        type: 'string',
                        title: '容器类名',
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': {
                          placeholder: '如 shadow-sm rounded-lg',
                        },
                      },
                      padding: {
                        type: 'string',
                        title: '内边距',
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': {
                          placeholder: '如 16px 或 1rem',
                        },
                      },
                      backgroundColor: {
                        type: 'string',
                        title: '背景色',
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': {
                          placeholder: '如 #f5f5f5',
                        },
                      },
                      borderRadius: {
                        type: 'string',
                        title: '圆角',
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': {
                          placeholder: '如 8px',
                        },
                      },
                      border: {
                        type: 'string',
                        title: '边框',
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': {
                          placeholder: '如 1px solid #ddd',
                        },
                      },
                      boxShadow: {
                        type: 'string',
                        title: '阴影',
                        'x-decorator': 'FormItem',
                        'x-component': 'Input',
                        'x-component-props': {
                          placeholder: '如 0 2px 4px rgba(0,0,0,0.1)',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    designerLocales: {
      'zh-CN': {
        title: '间距容器',
        settings: {
          'x-component-props': {
            direction: '排列方向',
            size: '间距(px)',
            align: '对齐方式',
            wrap: '自动换行',
            containerClassName: '容器类名',
            padding: '内边距',
            backgroundColor: '背景色',
            borderRadius: '圆角',
            border: '边框',
            boxShadow: '阴影',
          },
        },
      },
      'en-US': {
        title: 'Space',
      },
    },
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

Space.Resource = createResource({
  icon: 'SpaceSource',
  elements: [
    {
      componentName: 'Field',
      props: {
        type: 'void',
        'x-component': 'Space',
        'x-component-props': {
          direction: 'horizontal',
          size: 8,
        },
      },
    },
  ],
})
