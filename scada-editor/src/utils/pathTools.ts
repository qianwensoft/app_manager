/**
 * 路径工具辅助函数
 * 用于钢笔工具和铅笔工具的路径生成
 */

export interface PathPoint {
  x: number
  y: number
  type?: 'line' | 'curve'
  cp1?: { x: number; y: number }  // 控制点1（贝塞尔曲线）
  cp2?: { x: number; y: number }  // 控制点2（贝塞尔曲线）
}

/**
 * 将点数组转换为 SVG path d 属性字符串
 */
export function pointsToPathData(points: PathPoint[], closed: boolean = false): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${points[0].x} ${points[0].y}`

  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    if (point.type === 'curve' && point.cp1 && point.cp2) {
      // 贝塞尔曲线（钢笔工具）
      d += ` C ${point.cp1.x} ${point.cp1.y}, ${point.cp2.x} ${point.cp2.y}, ${point.x} ${point.y}`
    } else {
      // 直线
      d += ` L ${point.x} ${point.y}`
    }
  }

  if (closed) {
    d += ' Z'
  }

  return d
}

/**
 * 简化路径点（Douglas-Peucker 算法）
 * 用于铅笔工具平滑化
 */
export function simplifyPath(points: PathPoint[], tolerance: number = 2): PathPoint[] {
  if (points.length <= 2) return points

  const sqTolerance = tolerance * tolerance

  function getSqDist(p1: PathPoint, p2: PathPoint): number {
    const dx = p1.x - p2.x
    const dy = p1.y - p2.y
    return dx * dx + dy * dy
  }

  function getSqSegDist(p: PathPoint, p1: PathPoint, p2: PathPoint): number {
    let x = p1.x
    let y = p1.y
    let dx = p2.x - x
    let dy = p2.y - y

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)

      if (t > 1) {
        x = p2.x
        y = p2.y
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }

    dx = p.x - x
    dy = p.y - y

    return dx * dx + dy * dy
  }

  function simplifyDPStep(
    points: PathPoint[],
    first: number,
    last: number,
    sqTolerance: number,
    simplified: PathPoint[]
  ): void {
    let maxSqDist = sqTolerance
    let index = 0

    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(points[i], points[first], points[last])

      if (sqDist > maxSqDist) {
        index = i
        maxSqDist = sqDist
      }
    }

    if (maxSqDist > sqTolerance) {
      if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified)
      simplified.push(points[index])
      if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified)
    }
  }

  const last = points.length - 1
  const simplified = [points[0]]
  simplifyDPStep(points, 0, last, sqTolerance, simplified)
  simplified.push(points[last])

  return simplified
}

/**
 * 平滑路径（Catmull-Rom 样条）
 * 用于铅笔工具生成更平滑的曲线
 */
export function smoothPath(points: PathPoint[], tension: number = 0.5): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`

  let d = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2

    const cp1x = p1.x + (p2.x - p0.x) / 6 * tension
    const cp1y = p1.y + (p2.y - p0.y) / 6 * tension
    const cp2x = p2.x - (p3.x - p1.x) / 6 * tension
    const cp2y = p2.y - (p3.y - p1.y) / 6 * tension

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return d
}

/**
 * 计算两点间的距离
 */
export function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * 生成正多边形的顶点
 * @param cx 中心点 x
 * @param cy 中心点 y
 * @param radius 半径
 * @param sides 边数
 * @param rotation 旋转角度（度）
 */
export function generateRegularPolygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation: number = 0
): PathPoint[] {
  const points: PathPoint[] = []
  const angleStep = (Math.PI * 2) / sides
  const rotRad = (rotation * Math.PI) / 180

  for (let i = 0; i < sides; i++) {
    const angle = angleStep * i + rotRad
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  }

  return points
}

/**
 * 生成星形的顶点
 * @param cx 中心点 x
 * @param cy 中心点 y
 * @param outerRadius 外半径
 * @param innerRadius 内半径
 * @param points 星形角数
 * @param rotation 旋转角度（度）
 */
export function generateStar(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
  rotation: number = -90
): PathPoint[] {
  const result: PathPoint[] = []
  const angleStep = Math.PI / points
  const rotRad = (rotation * Math.PI) / 180

  for (let i = 0; i < points * 2; i++) {
    const angle = angleStep * i + rotRad
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    result.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  }

  return result
}
