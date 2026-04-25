/**
 * 由常用字段生成各库 DSN（与 Go 侧 sql.Open 驱动一致）。
 * @param {string} type sqlite|mysql|postgres|sqlserver
 * @param {Record<string,string|number>} f
 */
export function buildDsnFromFields (type, f) {
  const t = String(type || 'sqlite').toLowerCase()
  const esc = (s) => encodeURIComponent(String(s ?? ''))

  if (t === 'sqlite' || t === 'sqllite') {
    const path = String(f.sqlite_path || f.path || './data.db').trim() || './data.db'
    if (path.startsWith('file:')) return path
    return `file:${path}?_fk=1`
  }
  if (t === 'mysql' || t === 'mariadb') {
    const host = String(f.host || '127.0.0.1')
    const port = Number(f.port) || 3306
    const user = String(f.user || 'root')
    const password = String(f.password ?? '')
    const db = String(f.database || f.db || 'mysql')
    return `${user}:${esc(password)}@tcp(${host}:${port})/${db}?parseTime=true&loc=Local`
  }
  if (t === 'postgres' || t === 'postgresql' || t === 'pgsql') {
    const host = String(f.host || '127.0.0.1')
    const port = Number(f.port) || 5432
    const user = String(f.user || 'postgres')
    const password = String(f.password ?? '')
    const db = String(f.database || f.db || 'postgres')
    return `postgres://${esc(user)}:${esc(password)}@${host}:${port}/${esc(db)}?sslmode=disable`
  }
  if (t === 'sqlserver' || t === 'mssql') {
    const host = String(f.host || '127.0.0.1')
    const port = Number(f.port) || 1433
    const user = String(f.user || 'sa')
    const password = String(f.password ?? '')
    const db = String(f.database || f.db || 'master')
    return `sqlserver://${esc(user)}:${esc(password)}@${host}:${port}?database=${esc(db)}`
  }
  return ''
}

/** 合并写入 data_sources.config_json（保留未知键；patch 值为 null 则删除该键） */
export function mergeDataSourceConfigJson (existingJson, patch) {
  let base = {}
  if (existingJson && String(existingJson).trim()) {
    try {
      base = JSON.parse(existingJson)
    } catch {
      base = {}
    }
  }
  for (const [k, v] of Object.entries(patch || {})) {
    if (v == null) {
      delete base[k]
    } else {
      base[k] = v
    }
  }
  return JSON.stringify(base, null, 0)
}
