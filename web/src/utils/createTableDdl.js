/** 与 SqlDialectEditor / 后端数据源 type 对齐 */
export function normalizeDialectKey (raw) {
  const t = String(raw || '')
    .toLowerCase()
    .trim()
  if (['postgres', 'postgresql', 'pgsql', 'postgree', 'postgre'].includes(t)) return 'postgres'
  if (['mysql', 'mariadb'].includes(t)) return 'mysql'
  if (['sqlserver', 'mssql', 'sql_server', 'microsoftsqlserver'].includes(t)) return 'sqlserver'
  return 'sqlite'
}

export function quoteIdent (dialectKey, name) {
  const d = normalizeDialectKey(dialectKey)
  const n = String(name || '').trim()
  if (!n) return '""'
  switch (d) {
    case 'mysql':
      return '`' + n.replace(/`/g, '') + '`'
    case 'sqlserver':
      return '[' + n.replace(/\]/g, ']]') + ']'
    default:
      return '"' + n.replace(/"/g, '') + '"'
  }
}

export function suggestedSqlTypes (dialectKey) {
  const d = normalizeDialectKey(dialectKey)
  switch (d) {
    case 'mysql':
      return [
        'INT',
        'BIGINT',
        'SMALLINT',
        'TINYINT',
        'VARCHAR(64)',
        'VARCHAR(255)',
        'TEXT',
        'DATETIME',
        'DATE',
        'DECIMAL(10,2)',
        'DOUBLE',
        'BOOLEAN',
        'JSON'
      ]
    case 'postgres':
      return [
        'SERIAL',
        'BIGSERIAL',
        'INTEGER',
        'BIGINT',
        'SMALLINT',
        'BOOLEAN',
        'VARCHAR(64)',
        'VARCHAR(255)',
        'TEXT',
        'TIMESTAMPTZ',
        'DATE',
        'NUMERIC(12,2)',
        'JSONB',
        'UUID'
      ]
    case 'sqlserver':
      return [
        'INT',
        'BIGINT',
        'SMALLINT',
        'BIT',
        'NVARCHAR(50)',
        'NVARCHAR(255)',
        'NVARCHAR(MAX)',
        'DATETIME2',
        'DATE',
        'DECIMAL(18,2)',
        'VARBINARY(MAX)',
        'UNIQUEIDENTIFIER'
      ]
    default:
      return [
        'INTEGER',
        'INTEGER PRIMARY KEY',
        'INTEGER PRIMARY KEY AUTOINCREMENT',
        'TEXT',
        'REAL',
        'BLOB',
        'NUMERIC',
        'BOOLEAN'
      ]
  }
}

let _colUid = 1
export function nextColumnUid () {
  return _colUid++
}

export function defaultCreateColumns (dialectKey) {
  const d = normalizeDialectKey(dialectKey)
  // For postgres, BIGSERIAL is self-incrementing; for others use autoIncrement flag
  let idType = 'INTEGER'
  let autoInc = true
  if (d === 'mysql') { idType = 'BIGINT'; autoInc = true }
  else if (d === 'postgres') { idType = 'BIGSERIAL'; autoInc = false }
  else if (d === 'sqlserver') { idType = 'INT'; autoInc = true }
  return [
    {
      id: nextColumnUid(),
      name: 'id',
      sqlType: idType,
      notNull: true,
      primaryKey: true,
      autoIncrement: autoInc,
      defaultExpr: ''
    },
    {
      id: nextColumnUid(),
      name: 'name',
      sqlType: d === 'mysql' ? 'VARCHAR(255)' : d === 'sqlserver' ? 'NVARCHAR(255)' : 'TEXT',
      notNull: false,
      primaryKey: false,
      autoIncrement: false,
      defaultExpr: ''
    }
  ]
}

/**
 * @param {string} dialectKey
 * @param {string} tableName
 * @param {Array<{ name: string, sqlType: string, notNull?: boolean, primaryKey?: boolean, defaultExpr?: string }>} columns
 * @returns {string} CREATE TABLE … ; 或空字符串
 */
export function buildCreateTableDDL (dialectKey, tableName, columns) {
  const d = normalizeDialectKey(dialectKey)
  const tn = String(tableName || '').trim()
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(tn)) return ''

  const rows = (columns || [])
    .map((c) => ({
      name: String(c?.name || '').trim(),
      sqlType: String(c?.sqlType || 'TEXT').trim(),
      notNull: !!c?.notNull,
      primaryKey: !!c?.primaryKey,
      defaultExpr: String(c?.defaultExpr || '').trim()
    }))
    .filter((c) => /^[a-zA-Z0-9_]{1,64}$/.test(c.name) && c.sqlType)

  if (!rows.length) return ''

  const pkCols = rows.filter((r) => r.primaryKey)
  const qt = quoteIdent(d, tn)

  const parts = rows.map((c) => {
    const qc = quoteIdent(d, c.name)
    const isSinglePk = pkCols.length === 1 && c.primaryKey
    const needsPkKeyword = isSinglePk && !/\bPRIMARY\s+KEY\b/i.test(c.sqlType)
    const needsAi = isSinglePk && c.autoIncrement && !/\bAUTOINCREMENT\b|\bAUTO_INCREMENT\b|\bIDENTITY\b|\bSERIAL\b/i.test(c.sqlType)

    if (d === 'sqlserver' && needsAi) {
      // SQL Server: type IDENTITY(1,1) [NOT NULL] PRIMARY KEY
      let line = `${qc} ${c.sqlType} IDENTITY(1,1)`
      if (c.notNull) line += ' NOT NULL'
      line += ' PRIMARY KEY'
      return line
    }

    let line = `${qc} ${c.sqlType}`
    if (isSinglePk && d === 'sqlite') {
      // SQLite: INTEGER PRIMARY KEY [AUTOINCREMENT] — NOT NULL is implicit, must not precede PRIMARY KEY
      if (needsPkKeyword) line += ' PRIMARY KEY'
      if (needsAi) line += ' AUTOINCREMENT'
    } else {
      if (c.notNull && !isSinglePk) line += ' NOT NULL'
      if (c.defaultExpr) line += ` DEFAULT ${c.defaultExpr}`
      if (needsPkKeyword) line += ' PRIMARY KEY'
      if (needsAi) {
        if (d === 'mysql') line += ' AUTO_INCREMENT'
        // postgres uses SERIAL/BIGSERIAL type, no extra keyword needed
      }
    }
    return line
  })

  let body = parts.join(',\n  ')
  if (pkCols.length > 1) {
    body += ',\n  PRIMARY KEY (' + pkCols.map((c) => quoteIdent(d, c.name)).join(', ') + ')'
  }

  return `CREATE TABLE ${qt} (\n  ${body}\n);`
}
