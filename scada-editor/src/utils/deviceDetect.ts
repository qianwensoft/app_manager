/**
 * 检测设备类型
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function detectDeviceType(): DeviceType {
  // 使用 User-Agent 和屏幕尺寸综合判断
  const ua = navigator.userAgent.toLowerCase()
  const width = window.innerWidth
  const height = window.innerHeight
  const maxDimension = Math.max(width, height)

  // 移动设备特征
  const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)

  // 平板特征
  const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(ua)

  // 根据屏幕尺寸判断
  if (isMobileUA && maxDimension < 768) {
    return 'mobile'
  }

  if (isTabletUA || (maxDimension >= 768 && maxDimension < 1200)) {
    return 'tablet'
  }

  return 'desktop'
}

/**
 * 检查当前设备是否应该自动横屏
 */
export function shouldAutoLandscape(autoLandscapeDevices?: DeviceType[]): boolean {
  if (!autoLandscapeDevices || autoLandscapeDevices.length === 0) {
    return false
  }

  const currentDevice = detectDeviceType()
  return autoLandscapeDevices.includes(currentDevice)
}

/**
 * 检查当前是否已经是横屏（宽 > 高）
 */
export function isLandscape(): boolean {
  return window.innerWidth > window.innerHeight
}
