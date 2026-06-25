// SCADA canvas project schemas
// CanvasProject is serialized to JSON and stored in ScadaInfo.canvas_data

import type { CanvasElement } from './element'

/** Root document stored in ScadaInfo.canvas_data */
export interface CanvasProject {
  version: number
  /** Map of canvas id → CanvasData */
  canvases: Record<number, CanvasData>
  activeCanvasId: number
  canvasGroups: CanvasGroupNode[]
}

/** A single canvas panel */
export interface CanvasData {
  id: number
  name: string
  width: number
  height: number
  /** CSS color or gradient string for the canvas background */
  background: string
  backgroundColor: string
  backgroundImage?: string
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  gridColor: string
  showRuler: boolean
  elements: CanvasElement[]
  zoom: number
  viewport: { x: number; y: number; width: number; height: number }
}

/** Tree node in the canvas group/panel hierarchy */
export interface CanvasGroupNode {
  id: number
  name: string
  type: 'folder' | 'panel' | 'panelSet'
  children?: CanvasGroupNode[]
}
