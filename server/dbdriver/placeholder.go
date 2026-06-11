package dbdriver

import (
	"regexp"
	"strings"
)

// ExtractPlaceholderNames 提取 SQL 中所有 {{name}} 占位符名（去重、保序）。
func ExtractPlaceholderNames(sqlStr string) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range rePlaceholder.FindAllStringSubmatch(sqlStr, -1) {
		name := m[1]
		if !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}

// StripMissingClauses 在参数化之前，剔除 SQL 中引用了缺失 {{name}} 的部分：
//  1. INSERT INTO t (cols) VALUES (vals)：移除缺失参数对应的列/值对（使自增列等可省略）。
//  2. WHERE 子句：移除包含缺失 {{name}} 的条件片段（按连接词 AND/OR 边界推断），
//     直到下一个连接词或 ORDER BY / GROUP BY / HAVING / LIMIT / OFFSET / 右括号 / 结尾。
//
// 兼容旧的 /*? ... ?*/ 可选块：块内任一 {{name}} 缺失则整块移除（否则去掉注释标记保留）。
func StripMissingClauses(sqlStr string, params map[string]interface{}) string {
	if params == nil {
		params = map[string]interface{}{}
	}
	sqlStr = stripLegacyOptionalBlocks(sqlStr, params)
	if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(sqlStr)), "INSERT") {
		return stripMissingInsertPairs(sqlStr, params)
	}
	return stripMissingWhereClauses(sqlStr, params)
}

var reLegacyOptionalBlock = regexp.MustCompile(`/\*\?\s*(.*?)\s*\?\*/`)

// stripLegacyOptionalBlocks 兼容历史 /*? ... ?*/ 写法：块内任一 {{name}} 缺失则移除整块。
func stripLegacyOptionalBlocks(sqlStr string, params map[string]interface{}) string {
	return reLegacyOptionalBlock.ReplaceAllStringFunc(sqlStr, func(match string) string {
		sub := reLegacyOptionalBlock.FindStringSubmatch(match)
		if len(sub) < 2 {
			return match
		}
		inner := sub[1]
		for _, name := range ExtractPlaceholderNames(inner) {
			if _, ok := params[name]; !ok {
				return ""
			}
		}
		return inner
	})
}

// connectorBoundaries 标识 WHERE 条件片段的右边界关键字（大写匹配）。
var reClauseTerminator = regexp.MustCompile(`(?i)\b(ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT)\b`)

// stripMissingWhereClauses 移除包含缺失 {{name}} 的 WHERE 条件片段。
// 边界推断：以 AND / OR 为连接词切分；某片段引用了缺失参数则连同其前驱连接词一并删除。
func stripMissingWhereClauses(sqlStr string, params map[string]interface{}) string {
	// 仅处理含 {{}} 的语句；无占位符直接返回。
	if !rePlaceholder.MatchString(sqlStr) {
		return sqlStr
	}
	// 定位 WHERE。无 WHERE 则不做子句剔除（占位符将走原样参数化或在缺参时报错）。
	whereLoc := regexp.MustCompile(`(?i)\bWHERE\b`).FindStringIndex(sqlStr)
	if whereLoc == nil {
		return sqlStr
	}
	whereEnd := whereLoc[1]

	// 找 WHERE 子句的右边界（第一个终结关键字，或结尾）。
	rest := sqlStr[whereEnd:]
	termLoc := reClauseTerminator.FindStringIndex(rest)
	clauseEnd := len(sqlStr)
	if termLoc != nil {
		clauseEnd = whereEnd + termLoc[0]
	}

	head := sqlStr[:whereEnd]               // "... WHERE"
	clause := sqlStr[whereEnd:clauseEnd]     // 条件主体
	tail := sqlStr[clauseEnd:]               // "ORDER BY ..." 等

	rebuilt := rebuildWhereClause(clause, params)
	if strings.TrimSpace(rebuilt) == "" {
		// 全部条件被剔除：移除 WHERE 关键字本身，避免 "WHERE ORDER BY"。
		head = strings.TrimRight(head, " \t\r\n")
		head = regexp.MustCompile(`(?i)\s*\bWHERE$`).ReplaceAllString(head, "")
		joiner := ""
		if tail != "" && !strings.HasPrefix(tail, " ") {
			joiner = " "
		}
		return head + joiner + tail
	}
	return head + " " + strings.TrimSpace(rebuilt) + " " + tail
}

// reConnector 在条件主体中按 AND / OR 切分（保留连接词以便重组）。
var reConnector = regexp.MustCompile(`(?i)\s+(AND|OR)\s+`)

type whereFrag struct {
	connector string // 前驱连接词（首个片段为空）
	text      string
}

// rebuildWhereClause 按连接词切分条件，丢弃引用缺失参数的片段后重组。
func rebuildWhereClause(clause string, params map[string]interface{}) string {
	var frags []whereFrag
	idx := 0
	prevConn := ""
	for {
		loc := reConnector.FindStringSubmatchIndex(clause[idx:])
		if loc == nil {
			frags = append(frags, whereFrag{connector: prevConn, text: clause[idx:]})
			break
		}
		segEnd := idx + loc[0]
		frags = append(frags, whereFrag{connector: prevConn, text: clause[idx:segEnd]})
		prevConn = strings.ToUpper(strings.TrimSpace(clause[idx+loc[2] : idx+loc[3]]))
		idx = idx + loc[1]
	}

	var kept []whereFrag
	for _, f := range frags {
		drop := false
		for _, name := range ExtractPlaceholderNames(f.text) {
			if _, ok := params[name]; !ok {
				drop = true
				break
			}
		}
		if !drop {
			kept = append(kept, f)
		}
	}
	if len(kept) == 0 {
		return ""
	}

	var b strings.Builder
	for i, f := range kept {
		seg := strings.TrimSpace(f.text)
		if i == 0 {
			b.WriteString(seg)
			continue
		}
		conn := f.connector
		if conn == "" {
			conn = "AND"
		}
		b.WriteString(" " + conn + " " + seg)
	}
	return b.String()
}

// stripMissingInsertPairs 对 INSERT INTO t (c1,...) VALUES ({{p1}},...)，移除缺失参数的列/值对。
func stripMissingInsertPairs(sqlStr string, params map[string]interface{}) string {
	open1 := strings.Index(sqlStr, "(")
	if open1 < 0 {
		return sqlStr
	}
	close1 := strings.Index(sqlStr[open1:], ")")
	if close1 < 0 {
		return sqlStr
	}
	close1 += open1
	afterClose1Upper := strings.ToUpper(sqlStr[close1+1:])
	valIdx := strings.Index(afterClose1Upper, "VALUES")
	if valIdx < 0 {
		return sqlStr
	}
	valKwEnd := close1 + 1 + valIdx + len("VALUES")
	rest := strings.TrimLeft(sqlStr[valKwEnd:], " \t\r\n")
	if !strings.HasPrefix(rest, "(") {
		return sqlStr
	}
	open2 := valKwEnd + strings.Index(sqlStr[valKwEnd:], "(")
	close2 := strings.LastIndex(sqlStr, ")")
	if close2 <= open2 {
		return sqlStr
	}
	cols := splitSQLListDriver(sqlStr[open1+1 : close1])
	vals := splitSQLListDriver(sqlStr[open2+1 : close2])
	if len(cols) != len(vals) {
		return sqlStr
	}
	var newCols, newVals []string
	changed := false
	for i, v := range vals {
		names := ExtractPlaceholderNames(v)
		if len(names) == 0 {
			newCols = append(newCols, cols[i])
			newVals = append(newVals, v)
			continue
		}
		missing := false
		for _, n := range names {
			if _, ok := params[n]; !ok {
				missing = true
				break
			}
		}
		if missing {
			changed = true
		} else {
			newCols = append(newCols, cols[i])
			newVals = append(newVals, v)
		}
	}
	if !changed {
		return sqlStr
	}
	prefix := sqlStr[:open1]
	between := sqlStr[close1+1 : open2]
	suffix := sqlStr[close2+1:]
	return prefix + "(" + strings.Join(newCols, ", ") + ")" + between + "(" + strings.Join(newVals, ", ") + ")" + suffix
}

func splitSQLListDriver(s string) []string {
	parts := strings.Split(s, ",")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}
	return parts
}
