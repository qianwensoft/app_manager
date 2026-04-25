export const BUILTIN_FUNCS = [
  { label: '$now()', detail: '当前 Unix 时间戳（秒）', apply: '$now()' },
  { label: '$now_ms()', detail: '当前 Unix 时间戳（毫秒）', apply: '$now_ms()' },
  { label: '$format_date(fmt)', detail: '格式化当前日期，fmt 如 2006-01-02', apply: '$format_date("2006-01-02")' },
  { label: '$format_datetime(fmt)', detail: '格式化当前日期时间', apply: '$format_datetime("2006-01-02 15:04:05")' },
  { label: '$date()', detail: '当前日期字符串 YYYY-MM-DD', apply: '$date()' },
  { label: '$datetime()', detail: '当前日期时间字符串', apply: '$datetime()' },
  { label: '$random_str(n)', detail: '随机 n 位字母数字字符串', apply: '$random_str(16)' },
  { label: '$random_int(min,max)', detail: '随机整数 [min, max)', apply: '$random_int(0, 1000000)' },
  { label: '$random_hex(n)', detail: '随机 n 位十六进制字符串', apply: '$random_hex(32)' },
  { label: '$uuid()', detail: '随机 UUID v4', apply: '$uuid()' },
  { label: '$nonce()', detail: '随机 32 位随机串（alias uuid hex）', apply: '$nonce()' }
]
