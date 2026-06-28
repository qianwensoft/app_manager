package outbound

// ParseTokenCacheExported 导出版本的 parseTokenCache，供其他包调用
func ParseTokenCacheExported(raw string) (TokenCache, error) {
	return parseTokenCache(raw)
}
