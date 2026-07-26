import type { DateTimeConfig } from '@/types'

const CN_WEEK = ['日', '一', '二', '三', '四', '五', '六']
const EN_WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const EN_WEEK_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EN_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const EN_MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 常用格式预设，供引导式配置使用 */
export const DATETIME_PRESETS: { label: string; format: string }[] = [
  { label: '日期时间', format: 'YYYY-MM-DD HH:mm:ss' },
  { label: '日期', format: 'YYYY-MM-DD' },
  { label: '时间', format: 'HH:mm:ss' },
  { label: '时:分', format: 'HH:mm' },
  { label: '中文日期', format: 'YYYY年MM月DD日' },
  { label: '中文日期时间', format: 'YYYY年MM月DD日 HH:mm:ss' },
  { label: '带星期', format: 'YYYY-MM-DD dddd HH:mm:ss' },
  { label: '月日时分', format: 'MM-DD HH:mm' },
  { label: '斜杠日期', format: 'YYYY/MM/DD' },
  { label: '英文月日', format: 'MMM DD, YYYY' },
]

/** 引导式 token 说明，供属性面板“插入”按钮使用 */
export const DATETIME_TOKENS: { token: string; desc: string; sample: string }[] = [
  { token: 'YYYY', desc: '四位年', sample: '2026' },
  { token: 'YY', desc: '两位年', sample: '26' },
  { token: 'MM', desc: '两位月', sample: '07' },
  { token: 'M', desc: '月', sample: '7' },
  { token: 'DD', desc: '两位日', sample: '25' },
  { token: 'D', desc: '日', sample: '25' },
  { token: 'HH', desc: '24时(两位)', sample: '18' },
  { token: 'H', desc: '24时', sample: '18' },
  { token: 'hh', desc: '12时(两位)', sample: '06' },
  { token: 'h', desc: '12时', sample: '6' },
  { token: 'mm', desc: '两位分', sample: '08' },
  { token: 'ss', desc: '两位秒', sample: '05' },
  { token: 'SSS', desc: '毫秒', sample: '023' },
  { token: 'A', desc: '上/下午(大写)', sample: 'PM' },
  { token: 'a', desc: '上/下午(小写)', sample: 'pm' },
  { token: 'dddd', desc: '星期(全)', sample: '星期六' },
  { token: 'ddd', desc: '星期(简)', sample: '周六' },
  { token: 'MMMM', desc: '月名(全)', sample: 'July' },
  { token: 'MMM', desc: '月名(简)', sample: 'Jul' },
]

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

/**
 * 自动将任意输入解析为 Date：
 * - number / 纯数字字符串：按位数判定秒(10)或毫秒(13)时间戳
 * - ISO / 常见日期字符串：交给 Date 解析（含 "YYYY-MM-DD HH:mm:ss"，兼容 Safari 用 / 替换 -）
 * inputType 可强制指定解析方式。
 */
export function parseAnyToDate(
  value: unknown,
  inputType: DateTimeConfig['inputType'] = 'auto',
): Date | null {
  if (value === undefined || value === null || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  const asNumber = (n: number, mode: 'unix_s' | 'unix_ms' | 'auto'): Date | null => {
    if (!Number.isFinite(n)) return null
    let ms: number
    if (mode === 'unix_s') ms = n * 1000
    else if (mode === 'unix_ms') ms = n
    else {
      // auto：>= 1e12 视为毫秒，否则视为秒（约 2001 年之后的秒级时间戳约 1e9）
      const abs = Math.abs(n)
      ms = abs >= 1e12 ? n : n * 1000
    }
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }

  if (inputType === 'unix_s') return asNumber(Number(value), 'unix_s')
  if (inputType === 'unix_ms') return asNumber(Number(value), 'unix_ms')

  if (typeof value === 'number') return asNumber(value, 'auto')

  const str = String(value).trim()
  if (!str) return null

  if (inputType === 'iso' || inputType === 'string') {
    const d = parseDateString(str)
    return d
  }

  // auto：纯数字字符串按时间戳，否则按日期字符串
  if (/^-?\d+$/.test(str)) {
    return asNumber(Number(str), 'auto')
  }
  return parseDateString(str)
}

function parseDateString(str: string): Date | null {
  let d = new Date(str)
  if (!isNaN(d.getTime())) return d
  // Safari 不支持 "YYYY-MM-DD HH:mm:ss"，将 - 换成 / 再试
  const normalized = str.replace(/-/g, '/').replace('T', ' ').replace(/\.\d+.*$/, '')
  d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d
}

/** 按 token 模板格式化 Date */
export function formatDate(date: Date, format: string, locale: 'zh' | 'en' = 'zh'): string {
  const year = date.getFullYear()
  const month = date.getMonth() // 0-based
  const day = date.getDate()
  const hours24 = date.getHours()
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()
  const ms = date.getMilliseconds()
  const weekday = date.getDay()
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  const isPM = hours24 >= 12

  const weekLong = locale === 'en' ? EN_WEEK_LONG[weekday] : `星期${CN_WEEK[weekday]}`
  const weekShort = locale === 'en' ? EN_WEEK_SHORT[weekday] : `周${CN_WEEK[weekday]}`

  // 顺序很重要：长 token 先于短 token 匹配
  const replacements: [RegExp, string][] = [
    [/YYYY/g, String(year)],
    [/YY/g, pad(year % 100)],
    [/MMMM/g, EN_MONTH_LONG[month]],
    [/MMM/g, EN_MONTH_SHORT[month]],
    [/MM/g, pad(month + 1)],
    [/M/g, String(month + 1)],
    [/DD/g, pad(day)],
    [/D/g, String(day)],
    [/dddd/g, weekLong],
    [/ddd/g, weekShort],
    [/HH/g, pad(hours24)],
    [/H/g, String(hours24)],
    [/hh/g, pad(hours12)],
    [/h/g, String(hours12)],
    [/mm/g, pad(minutes)],
    [/m/g, String(minutes)],
    [/ss/g, pad(seconds)],
    [/s/g, String(seconds)],
    [/SSS/g, pad(ms, 3)],
    [/A/g, isPM ? 'PM' : 'AM'],
    [/a/g, isPM ? 'pm' : 'am'],
  ]

  // 用占位符避免已替换文本被二次匹配（如月名 July 里的 y）
  const tokens: string[] = []
  let result = format
  for (const [re, val] of replacements) {
    result = result.replace(re, () => {
      tokens.push(val)
      return `\u0000${tokens.length - 1}\u0000`
    })
  }
  result = result.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)])
  return result
}

/** 组合入口：解析 + 格式化，供绑定运行时使用 */
export function formatDateTimeValue(
  value: unknown,
  cfg: DateTimeConfig,
): string {
  const date = cfg.source === 'current'
    ? new Date()
    : parseAnyToDate(value, cfg.inputType ?? 'auto')
  if (!date) return cfg.fallback ?? ''
  return formatDate(date, cfg.format || 'YYYY-MM-DD HH:mm:ss', cfg.locale ?? 'zh')
}

/** 默认配置 */
export function defaultDateTimeConfig(): DateTimeConfig {
  return {
    source: 'current',
    format: 'YYYY-MM-DD HH:mm:ss',
    inputType: 'auto',
    refreshMs: 1000,
    fallback: '--',
    locale: 'zh',
  }
}
