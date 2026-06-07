import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useEditorStore } from '@/store/editorStore'
import { generateId, snapToGrid } from '@/utils/canvas'
import type { CanvasElement, ElementType } from '@/types'
import { scadaApi } from '@/api/scada'

// base 路径（生产: /scada-editor/，开发: /）
const BASE = import.meta.env.BASE_URL
const img = (path: string) => `${BASE}images/${path}`

export interface WidgetDef {
  type: ElementType
  label: string
  iconPath: string
  imageSrc?: string   // thumbnail for image-based widgets
  defaults?: Partial<CanvasElement>
}

// ── Static asset catalogs (mirrors public/images/*/index.json) ──────────────

const BG_ITEMS: WidgetDef[] = [
  { type: 'image-bg', label: '背景-01', iconPath: '', imageSrc: img('bg/bg01.jpg'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg01.jpg') } },
  { type: 'image-bg', label: '背景-02', iconPath: '', imageSrc: img('bg/bg02.jpg'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg02.jpg') } },
  { type: 'image-bg', label: '背景-03', iconPath: '', imageSrc: img('bg/bg03.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg03.png') } },
  { type: 'image-bg', label: '背景-04', iconPath: '', imageSrc: img('bg/bg04.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg04.png') } },
  { type: 'image-bg', label: '背景-05', iconPath: '', imageSrc: img('bg/bg05.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg05.png') } },
  { type: 'image-bg', label: '背景-06', iconPath: '', imageSrc: img('bg/bg06.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg06.png') } },
  { type: 'image-bg', label: '背景-07', iconPath: '', imageSrc: img('bg/bg07.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg07.png') } },
  { type: 'image-bg', label: '背景-08', iconPath: '', imageSrc: img('bg/bg08.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg08.png') } },
  { type: 'image-bg', label: '背景-09', iconPath: '', imageSrc: img('bg/bg09.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg09.png') } },
  { type: 'image-bg', label: '背景-10', iconPath: '', imageSrc: img('bg/bg10.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg10.png') } },
  { type: 'image-bg', label: '背景-11', iconPath: '', imageSrc: img('bg/bg11.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg11.png') } },
  { type: 'image-bg', label: '背景-12', iconPath: '', imageSrc: img('bg/bg12.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg12.png') } },
  { type: 'image-bg', label: '背景-13', iconPath: '', imageSrc: img('bg/bg13.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg13.png') } },
  { type: 'image-bg', label: '背景-14', iconPath: '', imageSrc: img('bg/bg14.png'), defaults: { width: 1920, height: 1080, imageUrl: img('bg/bg14.png') } },
]

const WIDGET_ITEMS: WidgetDef[] = [
  { type: 'image-widget', label: '球',     iconPath: '', imageSrc: img('widget/qiu.png'),     defaults: { width: 198, height: 185, imageUrl: img('widget/qiu.png') } },
  { type: 'image-widget', label: '波浪',   iconPath: '', imageSrc: img('widget/bolang.png'),  defaults: { width: 381, height: 146, imageUrl: img('widget/bolang.png') } },
  { type: 'image-widget', label: '标题-01',iconPath: '', imageSrc: img('widget/title01.png'), defaults: { width: 474, height: 29,  imageUrl: img('widget/title01.png') } },
  { type: 'image-widget', label: '标题-02',iconPath: '', imageSrc: img('widget/title02.png'), defaults: { width: 181, height: 15,  imageUrl: img('widget/title02.png') } },
  { type: 'image-widget', label: '标题-03',iconPath: '', imageSrc: img('widget/title03.png'), defaults: { width: 660, height: 40,  imageUrl: img('widget/title03.png') } },
  { type: 'image-widget', label: '标题-04',iconPath: '', imageSrc: img('widget/title04.png'), defaults: { width: 214, height: 9,   imageUrl: img('widget/title04.png') } },
  { type: 'image-widget', label: '标题-05',iconPath: '', imageSrc: img('widget/title05.png'), defaults: { width: 406, height: 80,  imageUrl: img('widget/title05.png') } },
  { type: 'image-widget', label: '标题-06',iconPath: '', imageSrc: img('widget/title06.png'), defaults: { width: 131, height: 12,  imageUrl: img('widget/title06.png') } },
  { type: 'image-widget', label: '标题-07',iconPath: '', imageSrc: img('widget/title07.png'), defaults: { width: 59,  height: 17,  imageUrl: img('widget/title07.png') } },
  { type: 'image-widget', label: '标题-08',iconPath: '', imageSrc: img('widget/title08.png'), defaults: { width: 941, height: 30,  imageUrl: img('widget/title08.png') } },
  { type: 'image-widget', label: '块-01',  iconPath: '', imageSrc: img('widget/block01.png'), defaults: { width: 101, height: 36,  imageUrl: img('widget/block01.png') } },
  { type: 'image-widget', label: '块-02',  iconPath: '', imageSrc: img('widget/block02.png'), defaults: { width: 69,  height: 31,  imageUrl: img('widget/block02.png') } },
  { type: 'image-widget', label: '圆-01',  iconPath: '', imageSrc: img('widget/circle01.png'),defaults: { width: 81,  height: 81,  imageUrl: img('widget/circle01.png') } },
  { type: 'image-widget', label: '圆-02',  iconPath: '', imageSrc: img('widget/circle02.png'),defaults: { width: 256, height: 85,  imageUrl: img('widget/circle02.png') } },
  { type: 'image-widget', label: '圆-03',  iconPath: '', imageSrc: img('widget/circle03.png'),defaults: { width: 472, height: 204, imageUrl: img('widget/circle03.png') } },
  { type: 'image-widget', label: '圆-04',  iconPath: '', imageSrc: img('widget/circle04.png'),defaults: { width: 492, height: 540, imageUrl: img('widget/circle04.png') } },
  { type: 'image-widget', label: '部件-01',iconPath: '', imageSrc: img('widget/widget01.png'),defaults: { width: 145, height: 31,  imageUrl: img('widget/widget01.png') } },
  { type: 'image-widget', label: '部件-02',iconPath: '', imageSrc: img('widget/widget02.png'),defaults: { width: 231, height: 108, imageUrl: img('widget/widget02.png') } },
  { type: 'image-widget', label: '部件-03',iconPath: '', imageSrc: img('widget/widget03.png'),defaults: { width: 604, height: 40,  imageUrl: img('widget/widget03.png') } },
  { type: 'image-widget', label: '部件-04',iconPath: '', imageSrc: img('widget/widget04.png'),defaults: { width: 38,  height: 38,  imageUrl: img('widget/widget04.png') } },
]

const DECORATION_ITEMS: WidgetDef[] = Array.from({ length: 50 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0')
  const src = i < 10 ? img(`decoration/gif${n}.gif`) : img(`decoration/gif${n}.png`)
  return {
    type: 'image-decoration' as ElementType,
    label: `装饰-${n}`,
    iconPath: '',
    imageSrc: src,
    defaults: { width: 200, height: 200, imageUrl: src },
  }
})

const BOX_ITEMS: WidgetDef[] = [
  { type: 'image-border-box', label: '边框-01', iconPath: '', imageSrc: img('box/box01.png'), defaults: { width: 500, height: 300, imageUrl: img('box/box01.png'), borderImageConfig: { width: '32px 37px', outset: '0', slice: '32 37 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-02', iconPath: '', imageSrc: img('box/box02.png'), defaults: { width: 541, height: 300, imageUrl: img('box/box02.png'), borderImageConfig: { width: '14px', outset: '0', slice: '14 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-03', iconPath: '', imageSrc: img('box/box03.png'), defaults: { width: 592, height: 131, imageUrl: img('box/box03.png'), borderImageConfig: { width: '17px 24px 18px 19px', outset: '0', slice: '17 24 18 19 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-04', iconPath: '', imageSrc: img('box/box04.png'), defaults: { width: 241, height: 138, imageUrl: img('box/box04.png'), borderImageConfig: { width: '14px 100px', outset: '0', slice: '14 100', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-05', iconPath: '', imageSrc: img('box/box05.png'), defaults: { width: 570, height: 338, imageUrl: img('box/box05.png'), borderImageConfig: { width: '14px', outset: '0', slice: '14 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-06', iconPath: '', imageSrc: img('box/box06.png'), defaults: { width: 805, height: 338, imageUrl: img('box/box06.png'), borderImageConfig: { width: '20px', outset: '0', slice: '20 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-07', iconPath: '', imageSrc: img('box/box07.png'), defaults: { width: 681, height: 418, imageUrl: img('box/box07.png'), borderImageConfig: { width: '32px 37px', outset: '0', slice: '32 37 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-08', iconPath: '', imageSrc: img('box/box08.png'), defaults: { width: 300, height: 301, imageUrl: img('box/box08.png'), borderImageConfig: { width: '14px', outset: '0', slice: '14 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-09', iconPath: '', imageSrc: img('box/box09.png'), defaults: { width: 524, height: 282, imageUrl: img('box/box09.png'), borderImageConfig: { width: '56px 4px 76px 393px', outset: '0', slice: '56 4 76 393 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-10', iconPath: '', imageSrc: img('box/box10.png'), defaults: { width: 731, height: 407, imageUrl: img('box/box10.png'), borderImageConfig: { width: '152px 27px 127px 354px', outset: '0', slice: '152 27 127 354 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-11', iconPath: '', imageSrc: img('box/box11.png'), defaults: { width: 541, height: 381, imageUrl: img('box/box11.png'), borderImageConfig: { width: '32px 37px', outset: '0', slice: '32 37 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-12', iconPath: '', imageSrc: img('box/box12.png'), defaults: { width: 300, height: 301, imageUrl: img('box/box12.png'), borderImageConfig: { width: '14px', outset: '0', slice: '14 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-13', iconPath: '', imageSrc: img('box/box13.png'), defaults: { width: 660, height: 394, imageUrl: img('box/box13.png'), borderImageConfig: { width: '60px 47px 227px 354px', outset: '0', slice: '60 47 227 354 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-14', iconPath: '', imageSrc: img('box/box14.png'), defaults: { width: 300, height: 301, imageUrl: img('box/box14.png'), borderImageConfig: { width: '14px', outset: '0', slice: '14 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-15', iconPath: '', imageSrc: img('box/box15.png'), defaults: { width: 689, height: 232, imageUrl: img('box/box15.png'), borderImageConfig: { width: '46px 305px 117px 33px', outset: '0', slice: '46 305 117 33 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-16', iconPath: '', imageSrc: img('box/box16.png'), defaults: { width: 506, height: 178, imageUrl: img('box/box16.png'), borderImageConfig: { width: '14px', outset: '0', slice: '14 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-17', iconPath: '', imageSrc: img('box/box17.png'), defaults: { width: 1390, height: 146, imageUrl: img('box/box17.png'), borderImageConfig: { width: '101px 690px 35px 693px', outset: '0', slice: '101 690 35 693 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-18', iconPath: '', imageSrc: img('box/box18.png'), defaults: { width: 178, height: 90, imageUrl: img('box/box18.png'), borderImageConfig: { width: '14px', outset: '0', slice: '14 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-19', iconPath: '', imageSrc: img('box/box19.png'), defaults: { width: 1270, height: 840, imageUrl: img('box/box19.png'), borderImageConfig: { width: '423px 606px 410px 652px', outset: '0', slice: '423 606 410 652 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-20', iconPath: '', imageSrc: img('box/box20.png'), defaults: { width: 1186, height: 616, imageUrl: img('box/box20.png'), borderImageConfig: { width: '288px 500px 272px 680px', outset: '0', slice: '288 500 272 680 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-21', iconPath: '', imageSrc: img('box/box11.png'), defaults: { width: 492, height: 335, imageUrl: img('box/box11.png'), borderImageConfig: { width: '15px 11px 16px 8px', outset: '0', slice: '15 11 16 8 fill', repeat: 'repeat' } } },
  { type: 'image-border-box', label: '边框-22', iconPath: '', imageSrc: img('box/box22.png'), defaults: { width: 378, height: 223, imageUrl: img('box/box22.png'), borderImageConfig: { width: '30px', outset: '0', slice: '30 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-23', iconPath: '', imageSrc: img('box/box23.png'), defaults: { width: 378, height: 180, imageUrl: img('box/box23.png'), borderImageConfig: { width: '1px', outset: '0', slice: '1 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-24', iconPath: '', imageSrc: img('box/box24.png'), defaults: { width: 126, height: 154, imageUrl: img('box/box24.png'), borderImageConfig: { width: '71px 23px', outset: '0', slice: '71 23', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-25', iconPath: '', imageSrc: img('box/box25.png'), defaults: { width: 379, height: 180, imageUrl: img('box/box25.png'), borderImageConfig: { width: '10px 2px 2px 130px', outset: '0', slice: '10 2 2 130 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-26', iconPath: '', imageSrc: img('box/box26.png'), defaults: { width: 379, height: 180, imageUrl: img('box/box26.png'), borderImageConfig: { width: '10px', outset: '0', slice: '10 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-27', iconPath: '', imageSrc: img('box/box27.png'), defaults: { width: 379, height: 180, imageUrl: img('box/box27.png'), borderImageConfig: { width: '20px', outset: '0', slice: '20 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-28', iconPath: '', imageSrc: img('box/box28.png'), defaults: { width: 379, height: 181, imageUrl: img('box/box28.png'), borderImageConfig: { width: '12px', outset: '0', slice: '12 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-29', iconPath: '', imageSrc: img('box/box29.png'), defaults: { width: 379, height: 229, imageUrl: img('box/box29.png'), borderImageConfig: { width: '16px', outset: '0', slice: '16 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-30', iconPath: '', imageSrc: img('box/box30.png'), defaults: { width: 379, height: 225, imageUrl: img('box/box30.png'), borderImageConfig: { width: '10px', outset: '0', slice: '10 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-31', iconPath: '', imageSrc: img('box/box31.png'), defaults: { width: 378, height: 223, imageUrl: img('box/box31.png'), borderImageConfig: { width: '5px', outset: '0', slice: '5 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-32', iconPath: '', imageSrc: img('box/box32.png'), defaults: { width: 378, height: 223, imageUrl: img('box/box32.png'), borderImageConfig: { width: '10px', outset: '0', slice: '10 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-33', iconPath: '', imageSrc: img('box/box33.png'), defaults: { width: 378, height: 180, imageUrl: img('box/box33.png'), borderImageConfig: { width: '10px', outset: '0', slice: '10 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-34', iconPath: '', imageSrc: img('box/box34.png'), defaults: { width: 378, height: 223, imageUrl: img('box/box34.png'), borderImageConfig: { width: '5px', outset: '0', slice: '5 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-35', iconPath: '', imageSrc: img('box/box35.png'), defaults: { width: 378, height: 223, imageUrl: img('box/box35.png'), borderImageConfig: { width: '20px', outset: '0', slice: '20 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-36', iconPath: '', imageSrc: img('box/box36.png'), defaults: { width: 379, height: 180, imageUrl: img('box/box36.png'), borderImageConfig: { width: '24px', outset: '0', slice: '24 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-37', iconPath: '', imageSrc: img('box/box37.png'), defaults: { width: 379, height: 180, imageUrl: img('box/box37.png'), borderImageConfig: { width: '30px', outset: '0', slice: '30 fill', repeat: 'stretch' } } },
  { type: 'image-border-box', label: '边框-38', iconPath: '', imageSrc: img('box/box38.png'), defaults: { width: 378, height: 180, imageUrl: img('box/box38.png'), borderImageConfig: { width: '24px', outset: '0', slice: '24 fill', repeat: 'stretch' } } },
]

const LAYOUT_ITEMS: WidgetDef[] = [
  {
    type: 'layout-carousel',
    label: '轮播容器',
    iconPath: 'M2 12h20M8 6l-6 6 6 6M16 6l6 6-6 6',
    defaults: { width: 400, height: 300, fill: 'rgba(20,30,50,0.8)', stroke: '#4a9eff', strokeWidth: 1, layoutSlides: 3, layoutInterval: 3000 },
  },
  {
    type: 'layout-tabs',
    label: '标签页',
    iconPath: 'M3 4h18v4H3V4ZM3 10h6v10H3V10ZM11 10h10v10H11V10',
    defaults: { width: 400, height: 280, fill: 'rgba(20,30,50,0.8)', stroke: '#4a9eff', strokeWidth: 1, layoutTabLabels: ['Tab 1', 'Tab 2', 'Tab 3'], layoutActiveTab: 0 },
  },
  {
    type: 'layout-collapse',
    label: '折叠面板',
    iconPath: 'M4 6h16M4 12h16M4 18h10',
    defaults: { width: 360, height: 240, fill: 'rgba(20,30,50,0.8)', stroke: '#4a9eff', strokeWidth: 1, layoutCollapseTitle: '折叠面板', layoutCollapseExpanded: true },
  },
  {
    type: 'layout-modal',
    label: '弹窗容器',
    iconPath: 'M4 4h16v16H4V4ZM4 10h16M9 4v6',
    defaults: { width: 360, height: 240, fill: '', stroke: '#4a9eff', strokeWidth: 1, layoutModalTitle: '弹窗标题', layoutShowClose: true },
  },
]

const NAV_ITEMS: WidgetDef[] = [
  {
    type: 'alarm-light',
    label: '报警灯',
    iconPath: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8v4M12 16h.01',
    defaults: {
      width: 80, height: 100, fill: 'transparent', text: '报警',
      fontSize: 11, fontColor: '#ccc',
      alarmNormalColor: '#22c55e', alarmWarningColor: '#f59e0b', alarmDangerColor: '#ef4444',
      alarmThresholdWarning: 70, alarmThresholdDanger: 90, alarmBlinkMs: 500, alarmSoundEnabled: false,
    },
  },
]

const groups: { name: string; icon: string; items: WidgetDef[] }[] = [
  {
    name: '基础图形', icon: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z',
    items: [
      { type: 'rect',    label: '矩形', iconPath: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z', defaults: { width: 120, height: 80, fill: '#4a9eff33', stroke: '#4a9eff' } },
      { type: 'circle',  label: '圆形', iconPath: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', defaults: { width: 80, height: 80, fill: '#4a9eff33', stroke: '#4a9eff' } },
      { type: 'ellipse', label: '椭圆', iconPath: 'M12 19c-4.97 0-9-3.13-9-7s4.03-7 9-7 9 3.13 9 7-4.03 7-9 7Z', defaults: { width: 120, height: 70, fill: '#4a9eff33', stroke: '#4a9eff' } },
      { type: 'line',    label: '直线', iconPath: 'M5 19L19 5', defaults: { width: 120, height: 2, stroke: '#4a9eff', strokeWidth: 2 } },
    ],
  },
  {
    name: '文本控件', icon: 'M4 7V5h16v2M9 5v14m6-14v14M9 19h6',
    items: [
      { type: 'text',   label: '文本', iconPath: 'M4 7V5h16v2M9 5v14m6-14v14M9 19h6', defaults: { width: 120, height: 40, text: '文本', fontSize: 16, fontColor: '#fff', fill: 'transparent' } },
      { type: 'button', label: '按钮', iconPath: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z', defaults: { width: 100, height: 40, text: '按钮', fontSize: 14, fontColor: '#fff', fill: '#2980b9', stroke: '#4a9eff' } },
      {
        type: 'table',
        label: '表格',
        iconPath: 'M3 3h18v18H3V3ZM3 9h18M3 15h18M9 3v18M15 3v18',
        defaults: {
          width: 300, height: 200, fill: '', fontColor: '#e0e0e0', fontSize: 12,
          tableColumns: [
            { key: 'col1', title: '列1', width: 100 },
            { key: 'col2', title: '列2', width: 100 },
            { key: 'col3', title: '列3', width: 100 },
          ],
          tableData: [
            { col1: '-', col2: '-', col3: '-' },
          ],
          tableStriped: true,
          tableBordered: true,
        },
      },
      {
        type: 'form-input',
        label: '文本输入',
        iconPath: 'M3 5h18M3 10h18M3 15h12',
        defaults: { width: 240, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'field1', formFieldLabel: '字段', formGroupId: 'form1' },
      },
      {
        type: 'form-number',
        label: '数字输入',
        iconPath: 'M7 8h10M7 12h10M7 16h6',
        defaults: { width: 240, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'num1', formFieldLabel: '数值', formGroupId: 'form1' },
      },
      {
        type: 'form-select',
        label: '下拉选择',
        iconPath: 'M3 6h18M3 12h18M3 18h18M17 9l3 3-3 3',
        defaults: { width: 240, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'select1', formFieldLabel: '选项', formFieldOptions: '选项A,选项B,选项C', formGroupId: 'form1' },
      },
      {
        type: 'form-textarea',
        label: '多行文本',
        iconPath: 'M3 5h18M3 10h18M3 15h18M3 20h12',
        defaults: { width: 240, height: 72, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'memo', formFieldLabel: '备注', formGroupId: 'form1' },
      },
      {
        type: 'form-date',
        label: '日期选择',
        iconPath: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
        defaults: { width: 240, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'date1', formFieldLabel: '日期', formGroupId: 'form1' },
      },
      {
        type: 'form-switch',
        label: '开关',
        iconPath: 'M18 8a6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 12 0ZM6 8h12',
        defaults: { width: 240, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'enabled', formFieldLabel: '启用', formGroupId: 'form1' },
      },
      {
        type: 'form-radio',
        label: '单选组',
        iconPath: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8v4M12 16h.01',
        defaults: { width: 280, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'radio1', formFieldLabel: '选项', formFieldOptions: '选项A,选项B,选项C', formGroupId: 'form1' },
      },
      {
        type: 'form-checkbox',
        label: '多选组',
        iconPath: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
        defaults: { width: 280, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'checks', formFieldLabel: '多选', formFieldOptions: '选项A,选项B,选项C', formGroupId: 'form1' },
      },
      {
        type: 'form-rate',
        label: '评分',
        iconPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
        defaults: { width: 200, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'rate', formFieldLabel: '评分', formGroupId: 'form1' },
      },
      {
        type: 'form-slider',
        label: '滑块',
        iconPath: 'M4 12h16M8 6l-4 6 4 6',
        defaults: { width: 280, height: 36, fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, fontColor: '#ccc', fontSize: 13, formFieldKey: 'slider1', formFieldLabel: '滑块', formGroupId: 'form1' },
      },
      {
        type: 'form-submit',
        label: '提交按钮',
        iconPath: 'M5 12h14M12 5l7 7-7 7',
        defaults: { width: 120, height: 40, fill: '#2980b9', stroke: '#4a9eff', strokeWidth: 1, fontColor: '#fff', fontSize: 14, text: '提交', formGroupId: 'form1', borderRadius: 4 },
      },
    ],
  },
  {
    name: '图表', icon: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-3',
    items: [
      { type: 'echarts-bar',     label: '柱状图', iconPath: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-3', defaults: { width: 300, height: 200 } },
      { type: 'echarts-line',    label: '折线图', iconPath: 'M3 3v18h18M3 17l5-5 4 3 5-7 4 4', defaults: { width: 300, height: 200 } },
      { type: 'echarts-pie',     label: '饼图',   iconPath: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 2v10h10', defaults: { width: 200, height: 200 } },
      { type: 'echarts-gauge',   label: '仪表盘', iconPath: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 12L8.5 8.5M12 7v1', defaults: { width: 200, height: 200 } },
      { type: 'echarts-scatter', label: '散点图', iconPath: 'M3 3v18h18M7 7h.01M12 11h.01M17 8h.01M9 15h.01M15 14h.01', defaults: { width: 300, height: 200 } },
      { type: 'echarts-heatmap', label: '热力图', iconPath: 'M3 3h4v4H3zM9 3h4v4H9zM15 3h4v4h-4zM3 9h4v4H3zM9 9h4v4H9zM15 9h4v4h-4z', defaults: { width: 300, height: 200 } },
      { type: 'echarts-trend',   label: '趋势图', iconPath: 'M3 3v18h18M3 15l4-6 4 3 4-8 4 5', defaults: { width: 360, height: 220 } },
      { type: 'echarts-stacked-bar', label: '堆叠柱', iconPath: 'M3 3v18h18M7 16v-8M12 16V6M17 16v-4', defaults: { width: 300, height: 200 } },
      { type: 'echarts-horizontal-bar', label: '横向柱', iconPath: 'M3 3v18h18M7 7h10M7 12h7M7 17h12', defaults: { width: 300, height: 200 } },
      { type: 'echarts-area', label: '面积图', iconPath: 'M3 3v18h18M3 17l5-8 4 4 5-10 5 8', defaults: { width: 300, height: 200 } },
      { type: 'echarts-radar', label: '雷达图', iconPath: 'M12 2l8 4.5v7L12 22l-8-8.5v-7L12 2z', defaults: { width: 240, height: 220 } },
      { type: 'echarts-funnel', label: '漏斗图', iconPath: 'M4 4h16l-4 6h-8L4 4Zm0 14l4-6h8l4 6H4z', defaults: { width: 260, height: 240 } },
    ],
  },
  {
    name: '背景', icon: 'M3 3h18v18H3zM3 9h18M9 21V9',
    items: BG_ITEMS,
  },
  {
    name: '挂件', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    items: WIDGET_ITEMS,
  },
  {
    name: '装饰', icon: 'M5 3l14 9-14 9V3z',
    items: DECORATION_ITEMS,
  },
  {
    name: '边框', icon: 'M3 3h18v18H3zM7 7h10v10H7z',
    items: BOX_ITEMS,
  },
  {
    name: 'Layout 容器', icon: 'M3 3h18v18H3V3ZM3 9h18',
    items: LAYOUT_ITEMS,
  },
  {
    name: '导航/报警', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8v4',
    items: NAV_ITEMS,
  },
]

export const WIDGET_DRAG_TYPE = 'application/x-scada-widget'

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export function buildWidgetElement(def: WidgetDef, canvas: { elements: { length: number }; snapToGrid: boolean; gridSize: number }, x = 60, y = 60): CanvasElement {
  const sx = canvas.snapToGrid ? snapToGrid(x, canvas.gridSize) : x
  const sy = canvas.snapToGrid ? snapToGrid(y, canvas.gridSize) : y
  return {
    id: generateId(),
    type: def.type,
    name: def.label,
    width: def.defaults?.width ?? 100,
    height: def.defaults?.height ?? 60,
    rotation: 0,
    visible: true,
    locked: false,
    zIndex: canvas.elements.length,
    opacity: 1,
    ...def.defaults,
    x: sx,
    y: sy,
  }
}

export default function WidgetPanel() {
  const store = useEditorStore()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '基础图形': true, '文本控件': true, '图表': false,
  })
  const [customOpen, setCustomOpen] = useState(false)

  const { data: customComponents } = useQuery({
    queryKey: ['scada', 'customize-components'],
    queryFn: () => scadaApi.listCustomizeComponents().then(r => r.data),
  })

  const toggleGroup = (name: string) =>
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }))

  const addWidget = (def: WidgetDef) => {
    const canvas = store.activeCanvas()
    if (!canvas) return
    const isBg = def.type === 'image-bg'
    const el = buildWidgetElement(def, canvas, isBg ? 0 : 60, isBg ? 0 : 60)
    if (isBg) {
      el.selectable = false
      el.locked = true
    }
    store.addElement(el)
    store.selectElements([el.id])
  }

  const handleDragStart = (e: React.DragEvent, def: WidgetDef) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(WIDGET_DRAG_TYPE, JSON.stringify(def))
  }

  return (
    <div
      className="scada-scroll"
      style={{
        width: 'var(--sidebar-l-w)',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      <div className="panel-label">组件库</div>

      {/* Custom components group */}
      {customComponents && customComponents.length > 0 && (
        <div>
          <button
            onClick={() => setCustomOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 10px',
              background: customOpen ? 'var(--bg-overlay)' : 'var(--bg-surface)',
              border: 'none', borderBottom: '1px solid var(--border)',
              color: customOpen ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', cursor: 'pointer',
              transition: 'all var(--duration-fast)',
            }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.7 }}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span style={{ flex: 1, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>自定义</span>
            <ChevronIcon open={customOpen} />
          </button>
          {customOpen && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 5, padding: '6px 8px', background: 'var(--bg-base)',
            }}>
              {customComponents.map((comp) => {
                const def: WidgetDef = {
                  type: 'image-widget',
                  label: comp.name,
                  iconPath: '',
                  imageSrc: `/api/scada/customize/file/${comp.id}`,
                  defaults: { width: 120, height: 120, imageUrl: `/api/scada/customize/file/${comp.id}` },
                }
                return (
                  <button
                    key={comp.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, def)}
                    onClick={() => addWidget(def)}
                    title={`${comp.name}（单击添加，可拖拽到画布）`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '4px 2px',
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      transition: 'border-color var(--duration-fast), background var(--duration-fast)',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-overlay)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
                  >
                    <img
                      src={`/api/scada/customize/file/${comp.id}`}
                      alt={comp.name}
                      style={{ width: '100%', height: 44, objectFit: 'contain', borderRadius: 2, display: 'block' }}
                    />
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                      {comp.name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {groups.map((group) => {
        const isOpen = openGroups[group.name] ?? false
        return (
          <div key={group.name}>
            <button
              onClick={() => toggleGroup(group.name)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 10px',
                background: isOpen ? 'var(--bg-overlay)' : 'var(--bg-surface)',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                color: isOpen ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'all var(--duration-fast)',
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                <path d={group.icon} />
              </svg>
              <span style={{ flex: 1, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group.name}</span>
              <ChevronIcon open={isOpen} />
            </button>

            {isOpen && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: group.items[0]?.imageSrc ? '1fr 1fr 1fr' : '1fr 1fr',
                gap: 5,
                padding: '6px 8px',
                background: 'var(--bg-base)',
              }}>
                {group.items.map((item, idx) => (
                  item.imageSrc ? (
                    <button
                      key={`${item.type}-${idx}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onClick={() => addWidget(item)}
                      title={`${item.label}（单击添加，可拖拽到画布）`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        padding: '4px 2px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        transition: 'border-color var(--duration-fast), background var(--duration-fast)',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-overlay)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
                    >
                      <img
                        src={item.imageSrc}
                        alt={item.label}
                        style={{ width: '100%', height: 44, objectFit: 'cover', borderRadius: 2, display: 'block' }}
                      />
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                        {item.label}
                      </span>
                    </button>
                  ) : (
                    <button
                      key={`${item.type}-${idx}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDoubleClick={() => addWidget(item)}
                      onClick={() => addWidget(item)}
                      title={`${item.label}（单击或双击添加，可拖拽到画布）`}
                      className="widget-card focus-accent"
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                        <path d={item.iconPath} />
                      </svg>
                      <span>{item.label}</span>
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
