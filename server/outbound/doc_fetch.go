package outbound

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// DocPage 单个被抓取页面的归一化结果。
type DocPage struct {
	URL         string `json:"url"`
	ContentType string `json:"content_type"`
	Text        string `json:"text"` // 已归一/截断的正文（HTML 抽正文、JSON/MD 原样）
}

// DocBundle 一次文档抓取（含 1-3 级探测）的汇总结果。
type DocBundle struct {
	Pages     []DocPage `json:"pages"`
	Truncated bool      `json:"truncated"` // 因页数/字节上限被截断
}

const (
	docMaxPagesHard    = 12              // 总抓取页数硬上限
	docMaxDepthHard    = 5               // 跟随深度硬上限（最多分析 5 层页面）
	docPerPageMaxBytes = 512 * 1024      // 单页响应体上限（HTTP 回退路径）
	docTotalMaxBytes   = 2 * 1024 * 1024 // 全部页面正文累计上限
	docFetchTimeoutSec = 10              // 单页请求超时（秒，HTTP 回退路径）
	docMenuMaxNodes    = 80              // SPA 树菜单点击式遍历的最大节点数
)

var (
	reHTMLTag     = regexp.MustCompile(`(?is)<(script|style)[^>]*>.*?</(script|style)>`)
	reAnyTag      = regexp.MustCompile(`(?s)<[^>]+>`)
	reHrefSrc     = regexp.MustCompile(`(?i)(?:href|src)\s*=\s*["']([^"']+)["']`)
	reWhitespace  = regexp.MustCompile(`[ \t\r\f]*\n[ \t\r\f\n]*`)
	reManySpaces  = regexp.MustCompile(`[ \t]{2,}`)
	apiHintTokens = []string{"swagger", "openapi", "api", "docs", ".json", ".yaml", ".yml", "reference", "endpoint"}
)

// pageResult 单页抓取的归一返回：渲染/读取到的正文、内容类型、跳转后的最终 URL。
type pageResult struct {
	body     string
	ctype    string
	finalURL string
}

// pageFetcher 抽象单页抓取，便于在「无头浏览器（执行 JS、跟随跳转）」与「纯 HTTP」两种实现间切换。
type pageFetcher interface {
	fetch(ctx context.Context, rawURL string) (pageResult, error)
	close()
}

// menuTraverser 可选能力：对「左侧树菜单 + 点击切换内容」型 SPA 文档站做点击式遍历。
// 仅无头浏览器实现具备；HTTP 回退不具备。
type menuTraverser interface {
	traverseMenu(ctx context.Context, maxNodes, totalBudget int) ([]MenuDoc, error)
}

// FetchAPIDocBundle 抓取入口 URL，并按同源 BFS 跟随其下级链接（深度 maxDepth、页数 maxPages 封顶）。
// 默认使用无头浏览器执行完整 JS、分析 JS 跳转后的最终路径；无浏览器时回退到纯 HTTP 抓取。
// 仅用于把第三方接口文档汇聚成 AI 上下文；做严格 SSRF 防护：拒私网/loopback/链路本地/非 http(s)/回调本机开放接口。
func FetchAPIDocBundle(ctx context.Context, rawURL string, maxDepth, maxPages int) (DocBundle, error) {
	var bundle DocBundle

	entry := strings.TrimSpace(rawURL)
	if entry == "" {
		return bundle, fmt.Errorf("文档 URL 为空")
	}
	eu, err := url.Parse(entry)
	if err != nil || eu.Host == "" {
		return bundle, fmt.Errorf("无效的文档 URL")
	}
	if !isAllowedScheme(eu.Scheme) {
		return bundle, fmt.Errorf("仅支持 http/https 文档地址")
	}
	if blocked, reason := isDisallowedFetchTarget(eu); blocked {
		return bundle, fmt.Errorf("%s", reason)
	}

	if maxDepth < 1 {
		maxDepth = 1
	}
	if maxDepth > docMaxDepthHard {
		maxDepth = docMaxDepthHard
	}
	if maxPages < 1 {
		maxPages = 1
	}
	if maxPages > docMaxPagesHard {
		maxPages = docMaxPagesHard
	}

	// 优先无头浏览器；启动不了则回退 HTTP。
	fetcher := newPageFetcher(ctx)
	defer fetcher.close()

	type queued struct {
		u     *url.URL
		depth int
	}
	origin := strings.ToLower(eu.Hostname())
	seen := map[string]bool{}
	queue := []queued{{u: eu, depth: 0}}
	seen[normalizeURL(eu)] = true
	totalBytes := 0

	for len(queue) > 0 {
		if len(bundle.Pages) >= maxPages {
			bundle.Truncated = true
			break
		}
		cur := queue[0]
		queue = queue[1:]

		// 每个待抓地址都重新做 SSRF 判定（防止跟随链接逃逸）
		if !isAllowedScheme(cur.u.Scheme) {
			continue
		}
		if blocked, _ := isDisallowedFetchTarget(cur.u); blocked {
			continue
		}

		res, ferr := fetcher.fetch(ctx, cur.u.String())
		if ferr != nil {
			// 入口失败直接报错；下级失败仅跳过
			if cur.depth == 0 {
				return bundle, ferr
			}
			continue
		}

		// JS 跳转后的最终 URL 作为正文记录地址与下级链接解析基准；并对其再做一次 SSRF 判定。
		base := cur.u
		if fu, perr := url.Parse(strings.TrimSpace(res.finalURL)); perr == nil && fu.Host != "" {
			if blocked, _ := isDisallowedFetchTarget(fu); !blocked {
				base = fu
			}
		}

		text, links := normalizeContent(res.body, res.ctype, base)
		if totalBytes+len(text) > docTotalMaxBytes {
			if remain := docTotalMaxBytes - totalBytes; remain > 0 {
				text = text[:remain]
			} else {
				text = ""
			}
			bundle.Truncated = true
		}
		totalBytes += len(text)
		bundle.Pages = append(bundle.Pages, DocPage{URL: base.String(), ContentType: res.ctype, Text: text})

		// 入口页：若是「树菜单 + 点击切换内容」型 SPA 文档站（链接式 BFS 抓不到子页），
		// 在已加载页面上做点击式遍历，把每个菜单节点的内容并入。
		if cur.depth == 0 && !bundle.Truncated {
			if mt, ok := fetcher.(menuTraverser); ok {
				budget := docTotalMaxBytes - totalBytes
				if budget > 0 {
					if docs, mErr := mt.traverseMenu(ctx, docMenuMaxNodes, budget); mErr == nil {
						for _, d := range docs {
							if totalBytes >= docTotalMaxBytes {
								bundle.Truncated = true
								break
							}
							dt := d.Text
							if totalBytes+len(dt) > docTotalMaxBytes {
								dt = dt[:docTotalMaxBytes-totalBytes]
								bundle.Truncated = true
							}
							totalBytes += len(dt)
							label := strings.TrimSpace(d.Label)
							pageURL := base.String() + "#" + label
							bundle.Pages = append(bundle.Pages, DocPage{URL: pageURL, ContentType: "text/plain", Text: dt})
						}
					}
				}
			}
		}

		if cur.depth >= maxDepth || bundle.Truncated {
			continue
		}
		// 链接发现：仅同源 http(s)，优先疑似 API 文档；入队去重
		for _, l := range prioritizeLinks(links) {
			if len(bundle.Pages)+len(queue) >= maxPages {
				break
			}
			lu, perr := url.Parse(l)
			if perr != nil {
				continue
			}
			ref := base.ResolveReference(lu)
			if !isAllowedScheme(ref.Scheme) {
				continue
			}
			if strings.ToLower(ref.Hostname()) != origin {
				continue // 仅同源，限制横向探测面
			}
			key := normalizeURL(ref)
			if seen[key] {
				continue
			}
			if blocked, _ := isDisallowedFetchTarget(ref); blocked {
				continue
			}
			seen[key] = true
			queue = append(queue, queued{u: ref, depth: cur.depth + 1})
		}
	}

	if len(bundle.Pages) == 0 {
		return bundle, fmt.Errorf("未能抓取到任何文档内容")
	}
	return bundle, nil
}

// newPageFetcher 优先返回无头浏览器抓取器；启动失败（无 Chrome/Chromium 等）则回退到纯 HTTP 抓取器。
func newPageFetcher(ctx context.Context) pageFetcher {
	if bs, err := newBrowserSession(ctx); err == nil {
		if perr := bs.probe(); perr == nil {
			return &browserPageFetcher{sess: bs}
		}
		bs.Close()
	}
	return &httpPageFetcher{client: &http.Client{Timeout: docFetchTimeoutSec * time.Second}}
}

// browserPageFetcher 用无头浏览器抓取（执行 JS、跟随跳转）。
type browserPageFetcher struct{ sess *browserSession }

func (f *browserPageFetcher) fetch(ctx context.Context, rawURL string) (pageResult, error) {
	body, ctype, finalURL, err := f.sess.fetchPage(ctx, rawURL)
	if err != nil {
		return pageResult{}, err
	}
	return pageResult{body: body, ctype: ctype, finalURL: finalURL}, nil
}

func (f *browserPageFetcher) close() {
	if f.sess != nil {
		f.sess.Close()
	}
}

// traverseMenu 委托给浏览器会话做点击式菜单遍历。
func (f *browserPageFetcher) traverseMenu(ctx context.Context, maxNodes, totalBudget int) ([]MenuDoc, error) {
	return f.sess.traverseMenu(ctx, maxNodes, totalBudget)
}

// httpPageFetcher 纯 HTTP 抓取（无 JS 执行），作为无头浏览器不可用时的回退。
type httpPageFetcher struct{ client *http.Client }

func (f *httpPageFetcher) fetch(ctx context.Context, rawURL string) (pageResult, error) {
	body, ctype, err := fetchOne(ctx, f.client, rawURL)
	if err != nil {
		return pageResult{}, err
	}
	return pageResult{body: body, ctype: ctype, finalURL: rawURL}, nil
}

func (f *httpPageFetcher) close() {}

func fetchOne(ctx context.Context, client *http.Client, u string) (string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("User-Agent", "app-manager-doc-fetcher/1.0")
	req.Header.Set("Accept", "application/json, text/html, text/plain, */*")
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("抓取失败：%v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", "", fmt.Errorf("抓取失败：HTTP %d", resp.StatusCode)
	}
	ctype := strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Type")))
	raw, err := io.ReadAll(io.LimitReader(resp.Body, docPerPageMaxBytes))
	if err != nil {
		return "", "", fmt.Errorf("读取响应失败：%v", err)
	}
	return string(raw), ctype, nil
}

// normalizeContent 把响应归一为正文文本，并返回页面中发现的链接（仅 HTML 抽链接）。
func normalizeContent(body, ctype string, base *url.URL) (text string, links []string) {
	lc := strings.ToLower(body)
	isHTML := strings.Contains(ctype, "html") || (ctype == "" && (strings.Contains(lc, "<html") || strings.Contains(lc, "<!doctype html")))
	if !isHTML {
		// JSON / YAML / Markdown / 纯文本：原样保留（已被 LimitReader 截断）
		return body, nil
	}
	// 抽链接
	for _, m := range reHrefSrc.FindAllStringSubmatch(body, -1) {
		h := strings.TrimSpace(m[1])
		if h == "" || strings.HasPrefix(h, "#") || strings.HasPrefix(strings.ToLower(h), "javascript:") || strings.HasPrefix(strings.ToLower(h), "mailto:") {
			continue
		}
		if isAssetLink(h) {
			continue // 跳过 css/js/字体/图片等静态资源，只跟随文档类链接
		}
		links = append(links, h)
	}
	// 抽正文：去 script/style，再去标签，压缩空白
	s := reHTMLTag.ReplaceAllString(body, " ")
	s = reAnyTag.ReplaceAllString(s, " ")
	s = htmlUnescapeBasic(s)
	s = reManySpaces.ReplaceAllString(s, " ")
	s = reWhitespace.ReplaceAllString(s, "\n")
	return strings.TrimSpace(s), links
}

// prioritizeLinks 把疑似 API 文档/规范的链接排前面。
func prioritizeLinks(links []string) []string {
	var hot, cold []string
	for _, l := range links {
		ll := strings.ToLower(l)
		isHot := false
		for _, t := range apiHintTokens {
			if strings.Contains(ll, t) {
				isHot = true
				break
			}
		}
		if isHot {
			hot = append(hot, l)
		} else {
			cold = append(cold, l)
		}
	}
	return append(hot, cold...)
}

func normalizeURL(u *url.URL) string {
	c := *u
	c.Fragment = ""
	return strings.ToLower(c.Scheme) + "://" + strings.ToLower(c.Host) + c.Path + "?" + c.RawQuery
}

func isAllowedScheme(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	return s == "http" || s == "https"
}

// assetExts 静态资源后缀：这些链接不是文档页，跟随它们只会浪费页数预算。
// 注意：.json/.yaml/.yml 不在此列——它们常是 OpenAPI/Swagger 规范，需要跟随。
var assetExts = []string{
	".css", ".js", ".mjs", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
	".webp", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".mp3", ".zip",
	".gz", ".tar", ".pdf", ".wasm",
}

// isAssetLink 判断链接是否指向静态资源（按路径后缀，忽略查询串）。
func isAssetLink(href string) bool {
	h := strings.ToLower(href)
	if i := strings.IndexAny(h, "?#"); i >= 0 {
		h = h[:i]
	}
	for _, ext := range assetExts {
		if strings.HasSuffix(h, ext) {
			return true
		}
	}
	return false
}

// isDisallowedFetchTarget 对外部文档抓取做 SSRF 防护：解析 host 到 IP，拒绝私网/loopback/链路本地/未指定，
// 并拒绝回调本机开放接口 /api/open/v1/*。
func isDisallowedFetchTarget(u *url.URL) (bool, string) {
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return true, "无效的主机名"
	}
	// 回调本机开放接口直接拒绝
	if blocked, reason := BlockedSelfOpenAPIURL(u.String()); blocked {
		return true, reason
	}
	// 字面 loopback / 未指定
	if host == "localhost" || host == "0.0.0.0" {
		return true, "禁止抓取本机/回环地址"
	}
	if self := configuredServerHostname(); self != "" && strings.EqualFold(host, self) {
		return true, "禁止抓取本服务自身地址"
	}
	// 解析所有 IP，任一落入私网/保留段即拒绝
	ips, err := net.LookupIP(host)
	if err != nil {
		return true, fmt.Sprintf("无法解析主机：%s", host)
	}
	for _, ip := range ips {
		if isDisallowedIP(ip) {
			return true, fmt.Sprintf("禁止抓取内网/保留地址：%s", host)
		}
	}
	return false, ""
}

func isDisallowedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return true
	}
	return false
}

func htmlUnescapeBasic(s string) string {
	r := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", "\"",
		"&#39;", "'",
		"&nbsp;", " ",
	)
	return r.Replace(s)
}
