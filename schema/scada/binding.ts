// SCADA data binding, animation, and event schemas

/** Binds an element's value to a real-time data point */
export interface PointBinding {
  /** Unique key identifying the data point (matches keys in ScadaPointDataPayload.points) */
  pointKey: string
  /** Device code the point belongs to */
  deviceCode: string
  /** Optional named link for multi-source canvases */
  linkName?: string
  /** Optional JS expression to transform the raw value before display, e.g. "value * 100" */
  transform?: string
}

/** Conditional animation applied to an element based on its bound point value */
export interface ElementAnimation {
  type: 'rotate' | 'blink' | 'flow' | 'none'
  /** Animation cycle duration in milliseconds */
  duration?: number
  /** JS expression evaluated against the current point value; animation runs when truthy */
  condition?: string
}

/** Interaction event wired to a canvas element */
export interface ElementEvent {
  trigger: 'click' | 'dblclick' | 'hover'
  action: 'navigate' | 'popup' | 'script'
  /** For action="navigate": target URL or canvas id; for action="popup": popup panel id */
  target?: string
  /** For action="script": JS expression to execute */
  script?: string
}
