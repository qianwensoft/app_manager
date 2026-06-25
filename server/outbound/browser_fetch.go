package outbound

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"app-manager/config"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/fetch"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
)

// browserSession 持有一个无头浏览器实例，用于「执行完整 JS 后」抓取渲染结果并跟随 JS 跳转。
// 同一 tab 内顺序导航各待抓地址；通过 CDP Fetch 域拦截浏览器发出的每一个请求做 SSRF 判定，
// 防止页面内 JS / 子资源 / 跳转把浏览器引向内网。
type browserSession struct {
	allocCtx    context.Context
	browserCtx  context.Context
	cancelAlloc context.CancelFunc
	cancelBrwsr context.CancelFunc
}

const browserPageTimeoutSec = 18 // 单页导航+渲染超时（秒）

// newBrowserSession 启动无头浏览器并装好请求拦截器；若本机无 Chrome/Chromium 或启动失败，
// 返回 error 以便上层回退到纯 HTTP 抓取。
func newBrowserSession(ctx context.Context) (*browserSession, error) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.DisableGPU,
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("blink-settings", "imagesEnabled=false"), // 不加载图片，省带宽/加速
		// 桌面视口：很多文档站在窄视口走移动端布局（侧栏菜单被折叠/隐藏），导致树菜单抓不到。
		chromedp.WindowSize(1440, 900),
	)
	if p := strings.TrimSpace(config.C.Chrome.Path); p != "" {
		opts = append(opts, chromedp.ExecPath(p))
	}
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	browserCtx, cancelBrwsr := chromedp.NewContext(allocCtx)

	b := &browserSession{
		allocCtx:    allocCtx,
		browserCtx:  browserCtx,
		cancelAlloc: cancelAlloc,
		cancelBrwsr: cancelBrwsr,
	}

	// 请求拦截器：在 browser 上下文注册一次，覆盖此后所有导航。
	chromedp.ListenTarget(browserCtx, func(ev interface{}) {
		if e, ok := ev.(*fetch.EventRequestPaused); ok {
			go b.handlePaused(e)
		}
	})

	// 不在此处预热 Run：空 Run 后再取消其上下文会干扰后续导航。浏览器是否可用由 probe() 判定。
	return b, nil
}

// probe 验证浏览器可真正启动（无 Chrome/Chromium 时在此失败，便于上层回退到 HTTP）。
// 注意：probe 直接在 browserCtx 上跑且不取消它——取消用于 Run 的上下文会拆掉整个会话。
func (b *browserSession) probe() error {
	done := make(chan error, 1)
	go func() {
		done <- chromedp.Run(b.browserCtx, fetch.Enable(), chromedp.Navigate("about:blank"))
	}()
	select {
	case err := <-done:
		return err
	case <-time.After(12 * time.Second):
		return fmt.Errorf("无头浏览器启动超时")
	}
}

// Close 关闭浏览器并释放资源。
func (b *browserSession) Close() {
	if b.cancelBrwsr != nil {
		b.cancelBrwsr()
	}
	if b.cancelAlloc != nil {
		b.cancelAlloc()
	}
}

// fetchPage 在浏览器中导航到 rawURL，执行 JS、等待渲染，返回渲染后的 outerHTML、内容类型与
// JS 跳转后的最终 URL。各页在同一 tab 内顺序导航，复用已注册的请求拦截器。
func (b *browserSession) fetchPage(ctx context.Context, rawURL string) (body, ctype, finalURL string, err error) {
	runCtx, cancel := context.WithTimeout(b.browserCtx, browserPageTimeoutSec*time.Second)
	defer cancel()

	err = chromedp.Run(runCtx,
		fetch.Enable(),
		chromedp.Navigate(rawURL),
		// 等待 body 就绪 + 一段渲染沉淀时间，尽量让 SPA / 异步内容与 JS 跳转完成。
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.Sleep(2500*time.Millisecond),
		chromedp.OuterHTML("html", &body, chromedp.ByQuery),
		chromedp.Evaluate(`document.location.href`, &finalURL),
	)
	if err != nil {
		return "", "", "", fmt.Errorf("浏览器抓取失败：%v", err)
	}
	if strings.TrimSpace(finalURL) == "" {
		finalURL = rawURL
	}
	return body, "text/html", finalURL, nil
}

// MenuDoc 单个菜单节点点击后捕获的内容。
type MenuDoc struct {
	Label string // 菜单节点文字
	Text  string // 点击后主内容区的纯文本
}

// traverseMenu 针对「左侧树形菜单 + 点击切换内容」型 SPA 文档站（无 <a href>、URL 不变）：
// 在当前已加载页面上展开所有树节点，依次点击每个节点，捕获主内容区文本。
// 通过内容去重避免重复/空节点。maxNodes 限制点击次数，totalBudget 控制累计文本字节。
// 返回去重后的各节点文档；若页面不是这种结构（无可点击树节点），返回空切片。
func (b *browserSession) traverseMenu(ctx context.Context, maxNodes, totalBudget int) ([]MenuDoc, error) {
	runCtx, cancel := context.WithTimeout(b.browserCtx, menuTraverseTimeoutSec*time.Second)
	defer cancel()

	// 等待树形菜单渲染出来（SPA 异步加载菜单，最多等 ~8s）。
	treeReady := false
	for i := 0; i < 16; i++ {
		var n int
		if err := chromedp.Run(runCtx, chromedp.Evaluate(jsCountTreeBars, &n)); err != nil {
			return nil, nil
		}
		if n > 0 {
			treeReady = true
			break
		}
		_ = chromedp.Run(runCtx, chromedp.Sleep(500*time.Millisecond))
	}
	if !treeReady {
		return nil, nil // 不是树形菜单结构，安静跳过
	}

	// 反复展开可折叠树节点，直到节点数稳定（最多 8 轮）。
	for i := 0; i < 8; i++ {
		var prev, now int
		if err := chromedp.Run(runCtx, chromedp.Evaluate(jsCountTreeBars, &prev)); err != nil {
			return nil, nil
		}
		_ = chromedp.Run(runCtx, chromedp.Evaluate(jsExpandTreeBars, nil), chromedp.Sleep(600*time.Millisecond))
		_ = chromedp.Run(runCtx, chromedp.Evaluate(jsCountTreeBars, &now))
		if now <= prev {
			break
		}
	}

	var total int
	if err := chromedp.Run(runCtx, chromedp.Evaluate(jsCountTreeBars, &total)); err != nil || total == 0 {
		return nil, nil
	}
	if total > maxNodes {
		total = maxNodes
	}

	var docs []MenuDoc
	seen := map[string]bool{}
	bytesUsed := 0
	for i := 0; i < total; i++ {
		var ok bool
		clickJS := fmt.Sprintf(`(function(){var b=document.querySelectorAll('li .ui-tree-bar');if(%d>=b.length)return false;b[%d].click();return true;})()`, i, i)
		if err := chromedp.Run(runCtx, chromedp.Evaluate(clickJS, &ok)); err != nil {
			break
		}
		if !ok {
			continue
		}
		var label, text string
		_ = chromedp.Run(runCtx,
			chromedp.Sleep(450*time.Millisecond),
			chromedp.Evaluate(fmt.Sprintf(`(function(){var b=document.querySelectorAll('li .ui-tree-bar');return (%d<b.length&&b[%d].innerText||'').trim();})()`, i, i), &label),
			chromedp.Evaluate(jsCaptureContent, &text),
		)
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		// 用内容指纹去重（折叠父节点点击后内容可能不变）
		fp := contentFingerprint(text)
		if seen[fp] {
			continue
		}
		seen[fp] = true
		docs = append(docs, MenuDoc{Label: label, Text: text})
		bytesUsed += len(text)
		if bytesUsed >= totalBudget {
			break
		}
	}
	return docs, nil
}

// contentFingerprint 取文本首尾片段做去重指纹，避免对长文本做整串比较。
func contentFingerprint(s string) string {
	const n = 120
	head := s
	if len(head) > n {
		head = head[:n]
	}
	tail := s
	if len(tail) > n {
		tail = tail[len(tail)-n:]
	}
	return fmt.Sprintf("%d|%s|%s", len(s), head, tail)
}

const (
	menuTraverseTimeoutSec = 90 // 整个菜单遍历超时（秒）

	// jsCountTreeBars 统计树形菜单节点数。
	jsCountTreeBars = `document.querySelectorAll('li .ui-tree-bar').length`

	// jsExpandTreeBars 点击所有带展开开关的树节点以展开子级。
	jsExpandTreeBars = `(function(){var bars=document.querySelectorAll('li .ui-tree-bar');var n=0;bars.forEach(function(b){if(b.querySelector('.ui-tree-bar-switcher-warp')){b.click();n++;}});return n;})()`

	// jsCaptureContent 抓取主内容区纯文本（优先 Milkdown/编辑器容器，回退到最大文本块）。
	jsCaptureContent = `(function(){var sel=['.milkdown .editor','.milkdown','.weapp-opendoc-content','.editor','article','main'];for(var i=0;i<sel.length;i++){var el=document.querySelector(sel[i]);if(el&&(el.innerText||'').trim().length>20)return el.innerText;}return document.body.innerText||'';})()`
)

// handlePaused 对浏览器发出的单个请求做 SSRF 判定：http(s) 校验目标主机；data/about/blob 放行；其余拒绝。
func (b *browserSession) handlePaused(e *fetch.EventRequestPaused) {
	c := chromedp.FromContext(b.browserCtx)
	if c == nil || c.Target == nil {
		return
	}
	exec := cdp.WithExecutor(b.browserCtx, c.Target)

	allow := false
	if u, perr := url.Parse(e.Request.URL); perr == nil {
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
			if blocked, _ := isDisallowedFetchTarget(u); !blocked {
				allow = true
			}
		case "data", "about", "blob":
			allow = true // 非网络出站，无 SSRF 风险
		}
	}

	if allow {
		_ = fetch.ContinueRequest(e.RequestID).Do(exec)
	} else {
		_ = fetch.FailRequest(e.RequestID, network.ErrorReasonBlockedByClient).Do(exec)
	}
}
