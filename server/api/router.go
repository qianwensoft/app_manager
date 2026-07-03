package api

import (
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/datastack"
	"app-manager/lowcode"
	"app-manager/mcp"
	"app-manager/ratelimit"
	"log"

	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
	// 启动无线 ADB 保活（每 30 秒 reconnect，防止 adb server 重启后连接丢失）
	StartAdbKeepalive()

	r := gin.Default()

	// 受信任代理：默认不信任任何代理（用 RemoteAddr 作为客户端 IP，X-Forwarded-For 不可伪造）。
	// 部署在反向代理后时，在配置 server.trusted_proxies 填入代理地址以正确解析真实客户端 IP。
	// 这同时消除 Gin "trusted all proxies" 的不安全警告。
	if err := r.SetTrustedProxies(config.C.Server.TrustedProxies); err != nil {
		log.Printf("SetTrustedProxies failed: %v", err)
	}

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-API-Key,X-Device-Token")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 接口调用量埋点（内存累加，定期 flush；仅统计 /api/*）
	r.Use(MetricsMiddleware())

	// 静态文件（路径可通过配置文件配置，未配置时使用默认值）
	webDistPath := config.C.Server.WebDistPath()
	r.Static("/assets", webDistPath+"/assets")
	r.StaticFile("/", webDistPath+"/index.html")
	r.StaticFile("/auth-eteams-callback.html", webDistPath+"/auth-eteams-callback.html")
	// scada-editor
	r.Static("/scada-editor", config.C.Server.ScadaEditorPath())
	// form-app: 禁用缓存以避免浏览器加载旧版本的 JavaScript 文件
	formAppDir := config.C.Server.FormAppPath()
	formAppGroup := r.Group("/form-app")
	formAppGroup.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.Next()
	})
	formAppGroup.StaticFS("", gin.Dir(formAppDir, false))

	// Prometheus（内网抓取；生产请用防火墙或反向代理限制访问）
	r.GET("/metrics", PrometheusMetrics)

	// 安装状态检查（正常模式）
	r.GET("/api/setup/status", GetSetupStatus)

	// Agent 上传录屏（凭 X-Device-Token，无需登录）
	r.POST("/api/agent/recordings/upload", AgentRecordingUpload)
	// Agent 测速 HTTP（凭 X-Device-Token）
	r.GET("/api/agent/speed-test/download", AgentSpeedTestDownload)
	r.POST("/api/agent/speed-test/upload", AgentSpeedTestUpload)
	// Agent App 只读：自定义事件定义、出站连接器（凭 X-Device-Token）
	r.GET("/api/agent/custom-event-definitions", AgentListCustomEventDefinitions)
	r.GET("/api/agent/custom-events/listen-state", AgentGetCustomEventListenState)
	r.POST("/api/agent/custom-events/listen/pause", AgentPauseCustomEventListen)
	r.DELETE("/api/agent/custom-events/listen-state", AgentDeleteCustomEventListenState)
	r.GET("/api/agent/outbound-connectors", AgentListOutboundConnectors)
	r.POST("/api/agent/outbound-connectors/:id/pause", AgentOutboundConnectorPause)
	r.POST("/api/agent/outbound-connectors/:id/enable", AgentOutboundConnectorEnable)
	r.POST("/api/agent/outbound-connectors/:id/exclude", AgentOutboundConnectorExclude)
	r.GET("/api/agent/install-apk", AgentInstallApkDownload)
	r.POST("/api/agent/pulled-apk-upload", AgentPulledApkUpload)
	r.GET("/api/agent/menu-manifest", AgentMenuManifest)
	r.POST("/api/agent/menu-execution/report", AgentMenuExecutionReport)
	r.GET("/api/agent/update/check", AgentUpdateCheck)

	// 免登录：组态分享
	r.GET("/api/scada/info/share/:token", GetScadaInfoByShareToken)
	// 免登录：表单分享
	r.GET("/api/form-app/info/share/:token", GetFormAppByShareToken)
	// 免登录：工单报告分享
	r.GET("/api/share/work-order-reports/:token", GetWorkOrderReportShare)
	r.GET("/api/share/work-order-reports/:token/work-orders", GetSharedWorkOrders)
	r.GET("/api/share/work-order-reports/:token/statistics", GetSharedWorkOrderStatistics)
	r.GET("/api/share/work-order-reports/:token/work-orders/:id/progress", GetSharedWorkOrderProgress)
	// 组态静态资源（上传目录映射）
	r.Static("/api/scada/resource", config.C.Storage.Path)

	// 免登录：分享页校验链接
	r.GET("/api/screen-share/claims", ScreenShareClaims)

	// 免登录：文件上传链接
	r.GET("/api/upload/:token", GetUploadLinkInfo)
	r.POST("/api/upload/:token", UploadFileByLink)

	// 免登录：Agent APK 下载（扫码下载无需登录）
	r.GET("/api/agent-updates/latest", GetLatestAgentUpdate)
	r.GET("/api/agent-updates/:id/download", DownloadAgentAPK)

	rl := config.C.RateLimit

	// 认证
	a := r.Group("/api/auth")
	{
		a.POST("/register", Register)
		a.POST("/login",
			ratelimit.Middleware(ratelimit.KeyByClientIP, rl.LoginRPM(), rl.LoginBurstSize()),
			Login,
		)
		a.POST("/thirdparty/login", ThirdPartyLogin) // 第三方平台 SSO 登录
		a.GET("/me", auth.AuthMiddleware(), Me)
		a.GET("/scope-catalog", auth.AuthMiddleware(), ScopeCatalog)
		a.POST("/apikey", auth.AuthMiddleware(), CreateAPIKey)
		a.GET("/apikey", auth.AuthMiddleware(), ListAPIKeys)
		a.DELETE("/apikey/:id", auth.AuthMiddleware(), RevokeAPIKey)
	}

	// 设备
	d := r.Group("/api/devices", auth.AuthMiddleware())
	{
		d.GET("", ListDevices)
		d.POST("", CreateDevice)
		d.GET("/:id", GetDevice)
		d.PUT("/:id", UpdateDevice)
		d.DELETE("/:id", DeleteDevice)
		d.GET("/groups/list", GetDeviceGroups)
		d.POST("/scan", ScanDevices)
		d.POST("/:id/connect", ConnectDevice)
		d.GET("/:id/info", GetDeviceInfo)
		d.GET("/:id/apps", GetDeviceApps)
		d.POST("/:id/apps/refresh", RefreshDeviceAppsFromAgent)
		d.POST("/:id/apps/pull-apk", auth.RequireRole("admin", "operator"), PullInstalledApkFromAgent)
		d.POST("/:id/apps/export-to-server", auth.RequireRole("admin", "operator"), ExportInstalledApkToServer)
		d.POST("/:id/agent/refresh-info", RefreshAgentDeviceInfoFromAgent)
		d.POST("/:id/agent/open-wireless-adb", auth.RequireRole("admin", "operator"), OpenWirelessAdbOnAgent)
		d.POST("/:id/agent/trigger-menu", auth.RequireRole("admin", "operator"), TriggerAgentMenuOnAgent)
		d.POST("/:id/agent/push-update", auth.RequireRole("admin", "operator"), PushAgentUpdate)
		d.POST("/:id/agent/nav-key", auth.RequireRole("admin", "operator"), AgentNavKey)
		d.POST("/:id/speed-test", auth.RequireRole("admin", "operator"), DeviceSpeedTest)
		d.GET("/:id/file-hub", ListDeviceFileHub)
		d.POST("/:id/audio-recording/start", auth.RequireRole("admin", "operator"), StartAudioRecording)
		d.POST("/:id/audio-recording/stop", auth.RequireRole("admin", "operator"), StopAudioRecording)
		d.POST("/:id/screen-shares", CreateScreenShare)
		d.GET("/:id/screen-shares", ListScreenShares)
		d.DELETE("/:id/screen-shares/:sid", RevokeScreenShare)
		d.GET("/:id/agent/fs/list", auth.RequireRole("admin", "operator"), AgentFsList)
		d.GET("/:id/agent/fs/download", auth.RequireRole("admin", "operator"), AgentFsDownload)

		// ADB 操作
		op := d.Group("/:id/adb", auth.RequireRole("admin", "operator"))
		op.POST("/reboot", AdbReboot)
		op.POST("/screenshot", AdbScreenshot)
		op.POST("/keyevent", AdbKeyEvent)
		op.POST("/input/text", AdbInputText)
		op.POST("/input", AdbInputTouch)
		op.POST("/push", AdbPush)
		op.POST("/push-file", AdbPushFile)
		op.GET("/pull", AdbPull)
		op.POST("/app/start", AdbStartApp)
		op.POST("/app/stop", AdbStopApp)
		op.POST("/app/clear", AdbClearApp)
		op.POST("/app/grant", AdbGrantPermission)
		op.GET("/files", AdbListFiles)
		op.POST("/recording/start", StartRecording)
		op.POST("/recording/stop", StopRecording)
		op.POST("/grant-read-logs", GrantAgentReadLogs)
		op.POST("/grant-accessibility", GrantAgentAccessibility)
		op.POST("/connect-by-ip", AdbConnectByAgentIP)
		op.POST("/pair-by-ip", AdbPairByAgentIP)
		op.GET("/status", GetAdbStatus)
		op.POST("/disconnect", AdbWirelessDisconnect)
		op.POST("/shell", AdbShellRun)
	}

	// APK
	ap := r.Group("/api/apps", auth.AuthMiddleware())
	{
		ap.POST("/upload", auth.RequireRole("admin", "operator"), UploadApp)
		ap.GET("", ListApps)
		ap.GET("/:id", GetApp)
		ap.PUT("/:id", auth.RequireRole("admin", "operator"), UpdateAppMeta)
		ap.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteApp)
		ap.POST("/:id/install", auth.RequireRole("admin", "operator"), InstallApp)
		ap.POST("/:id/uninstall", auth.RequireRole("admin", "operator"), UninstallApp)
	}

	// 任务
	t := r.Group("/api/tasks", auth.AuthMiddleware())
	{
		t.GET("", ListTasks)
		t.GET("/:id", GetTask)
		t.DELETE("/:id", auth.RequireRole("admin", "operator"), CancelTask)
	}

	// 审计日志
	r.GET("/api/audit", auth.AuthMiddleware(), auth.RequireRole("admin"), ListAuditLogs)

	// 系统设置
	settings := r.Group("/api/settings", auth.AuthMiddleware(), auth.RequireRole("admin"))
	{
		settings.GET("/heartbeat", GetHeartbeatSettings)
		settings.PUT("/heartbeat", UpdateHeartbeatSettings)
		settings.GET("/register", GetRegisterSetting)
		settings.PUT("/register", UpdateRegisterSetting)
		settings.GET("/cluster", ClusterStatus)
		settings.GET("/cluster/agent-route/:deviceKey", ClusterAgentRoute)
		settings.GET("/system-info", GetSystemInfo)
		settings.PUT("/env", UpdateEnvSettings)
		settings.POST("/ffmpeg/check", CheckFFmpeg)
		settings.POST("/ffmpeg/install", InstallFFmpeg)
		// 运行监控：Agent 在线连接 + 接口调用量趋势/详情 + STOMP 主题统计
		settings.GET("/agent-connections", GetAgentConnections)
		settings.GET("/agent-online-trend", GetAgentOnlineTrend)
		settings.GET("/api-call-trend", GetApiCallTrend)
		settings.GET("/api-call-details", GetApiCallDetails)
		settings.GET("/stomp-stats", GetStompStats)
		// AI（Claude）配置
		settings.GET("/claude", GetClaudeSettings)
		settings.PUT("/claude", UpdateClaudeSettings)
		settings.POST("/claude/demo-chat", ClaudeDemoChat)
	}

	// 用户管理（仅 admin）
	users := r.Group("/api/users", auth.AuthMiddleware(), auth.RequireRole("admin"))
	{
		users.GET("", ListUsers)
		users.POST("", CreateUser)
		users.PUT("/:id", UpdateUser)
		users.DELETE("/:id", DeleteUser)
	}

	// Agent 更新管理（需登录：上传、列表、删除）
	agentUpdate := r.Group("/api/agent-updates", auth.AuthMiddleware())
	{
		agentUpdate.POST("", auth.RequireRole("admin"), UploadAgentAPK)
		agentUpdate.GET("", ListAgentUpdates)
		agentUpdate.DELETE("/:id", auth.RequireRole("admin"), DeleteAgentUpdate)
	}

	// 录屏管理
	rec := r.Group("/api/recordings", auth.AuthMiddleware())
	{
		rec.GET("", ListRecordings)
		rec.GET("/:id/stream", StreamRecording)
		rec.GET("/:id/download", DownloadRecording)
		rec.GET("/:id/hls/:file", StreamRecordingHls)
		rec.POST("/:id/shares", auth.RequireRole("admin", "operator"), CreateRecordingShare)
		rec.GET("/:id/shares", auth.RequireRole("admin", "operator"), ListRecordingShares)
		rec.DELETE("/:id/shares/:sid", auth.RequireRole("admin", "operator"), RevokeRecordingShare)
		rec.PATCH("/:id", auth.RequireRole("admin", "operator"), RenameRecording)
		rec.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteRecording)
	}
	// 录屏分享（无鉴权，凭 ?share=token）
	r.GET("/api/recordings/share/hls/:file", StreamRecordingHls)
	r.GET("/api/recordings/share/stream", StreamRecording)

	// 设备媒体（截图存档、上传音频等）
	dm := r.Group("/api/device-media", auth.AuthMiddleware())
	{
		dm.GET("/:id/download", DownloadDeviceMedia)
		dm.GET("/:id/stream", StreamDeviceMedia)
		dm.PATCH("/:id", auth.RequireRole("admin", "operator"), RenameDeviceMedia)
		dm.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteDeviceMedia)
	}

	// Agent上传接口（支持Agent token认证）
	r.POST("/api/devices/:id/media/upload", UploadDeviceMedia)

	// 设备事件（含 PDA 扫码等 Agent 上报）
	e := r.Group("/api/events", auth.AuthMiddleware())
	{
		e.GET("", ListDeviceEvents)
		e.GET("/types", GetEventTypes)
	}

	// 自定义事件：分组、Intent 定义、批量下发监听（只读接口含 viewer，写操作仍为 admin/operator）
	ce := r.Group("/api/custom-events", auth.AuthMiddleware())
	{
		ce.GET("/listen-state", auth.RequireRole("admin", "operator", "viewer"), ListCustomEventListenState)
		ce.GET("/listen-state/aggregates", auth.RequireRole("admin", "operator", "viewer"), ListenStateAggregates)
		ce.DELETE("/listen-state/device/:device_id", auth.RequireRole("admin", "operator"), DeleteDeviceCustomListenState)
		ce.POST("/listen/start", auth.RequireRole("admin", "operator"), BatchStartCustomEventListen)
		ce.POST("/listen/stop", auth.RequireRole("admin", "operator"), BatchStopCustomEventListen)
		ce.POST("/analyze/start", auth.RequireRole("admin", "operator"), StartCustomEventAnalyze)
		ce.POST("/analyze/stop", auth.RequireRole("admin", "operator"), StopCustomEventAnalyze)
		ce.GET("/analyze/session/:device_id", auth.RequireRole("admin", "operator", "viewer"), GetCustomEventAnalyzeSession)
	}
	ceg := r.Group("/api/custom-event-groups", auth.AuthMiddleware())
	{
		ceg.GET("", auth.RequireRole("admin", "operator", "viewer"), ListCustomEventGroups)
		ceg.POST("", auth.RequireRole("admin", "operator"), CreateCustomEventGroup)
		ceg.PUT("/:id", auth.RequireRole("admin", "operator"), UpdateCustomEventGroup)
		ceg.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteCustomEventGroup)
	}
	ced := r.Group("/api/custom-event-definitions", auth.AuthMiddleware())
	{
		ced.GET("", auth.RequireRole("admin", "operator", "viewer"), ListCustomEventDefinitions)
		ced.POST("/import-pda-presets", auth.RequireRole("admin", "operator"), ImportPdaScanPresets)
		ced.GET("/:id", auth.RequireRole("admin", "operator", "viewer"), GetCustomEventDefinition)
		ced.POST("", auth.RequireRole("admin", "operator"), CreateCustomEventDefinition)
		ced.PUT("/:id", auth.RequireRole("admin", "operator"), UpdateCustomEventDefinition)
		ced.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteCustomEventDefinition)
	}

	// 出站连接器：统一 /api/outbound + 鉴权；device-states 允许 viewer，其余需 operator
	obBase := r.Group("/api/outbound", auth.AuthMiddleware())
	{
		obBase.GET("/connectors/:id/device-states", auth.RequireRole("admin", "operator", "viewer"), GetOutboundConnectorDeviceStates)
		obBase.GET("/connectors", auth.RequireRole("admin", "operator", "viewer"), ListOutboundConnectors)

		// 连接器接口元信息（所有认证用户可读）
		obBase.GET("/connector-interfaces", ListConnectorInterfaces)
		obBase.GET("/connector-interfaces/:code", GetConnectorInterface)

		ob := obBase.Group("", auth.RequireRole("admin", "operator"))
		{
			ob.GET("/apps", ListOutboundApps)
			ob.POST("/apps", CreateOutboundApp)
			ob.GET("/apps/:id/token/status", GetOutboundAppTokenStatus)
			ob.POST("/apps/:id/token/code", PostOutboundAppTokenCode)
			ob.POST("/apps/:id/token/fetch", PostOutboundAppTokenFetch)
			ob.POST("/apps/:id/token/refresh", PostOutboundAppTokenRefresh)
			ob.PUT("/apps/:id/params", PutOutboundAppParams)
			ob.GET("/apps/:id", GetOutboundApp)
			ob.PUT("/apps/:id", UpdateOutboundApp)
			ob.DELETE("/apps/:id", DeleteOutboundApp)
			ob.POST("/apps/:id/clone", CloneOutboundApp)
			ob.POST("/apps/:id/script-ai", OutboundScriptAIChat)
			ob.POST("/interface-ai", OutboundInterfaceAIChat)

			ob.GET("/endpoints", ListOutboundEndpoints)
			ob.POST("/endpoints", CreateOutboundEndpoint)
			ob.GET("/template-demo", GetOutboundTemplateDemo)
			ob.POST("/template-expand", PostOutboundTemplateExpand)
			ob.GET("/template-vars", GetOutboundTemplateVars)
			ob.POST("/phase-preview", PostOutboundPhasePreview)
			ob.POST("/interface-debug", PostOutboundInterfaceDebug)
			ob.POST("/endpoints/debug", PostOutboundEndpointDebug)
			ob.GET("/endpoints/:id", GetOutboundEndpoint)
			ob.GET("/endpoints/:id/param-schema", GetEndpointParamSchema)
			ob.PUT("/endpoints/:id", UpdateOutboundEndpoint)
			ob.DELETE("/endpoints/:id", DeleteOutboundEndpoint)

			ob.POST("/connectors", CreateOutboundConnector)
			ob.POST("/connectors/script-ai", OutboundScriptAIChat)
			ob.POST("/connectors/:id/devices/:device_id/pause", PostOutboundConnectorDevicePause)
			ob.POST("/connectors/:id/devices/:device_id/enable", PostOutboundConnectorDeviceEnable)
			ob.POST("/connectors/:id/devices/:device_id/exclude", PostOutboundConnectorDeviceExclude)
			ob.GET("/connectors/:id/execution-trace", GetOutboundConnectorExecutionTrace)
			ob.GET("/connectors/:id/trigger/status", GetOutboundConnectorTriggerStatus)
			ob.GET("/connectors/:id", GetOutboundConnector)
			ob.PUT("/connectors/:id", UpdateOutboundConnector)
			ob.DELETE("/connectors/:id", DeleteOutboundConnector)

			ob.GET("/webhooks", ListOutboundWebhooks)
			ob.POST("/webhooks", CreateOutboundWebhook)
			ob.GET("/webhooks/:id", GetOutboundWebhook)
			ob.GET("/webhooks/:id/config", GetOutboundWebhookConfig)
			ob.PUT("/webhooks/:id", UpdateOutboundWebhook)
			ob.DELETE("/webhooks/:id", DeleteOutboundWebhook)
			ob.GET("/webhooks/:id/logs", ListOutboundWebhookLogs)
			ob.DELETE("/webhooks/:id/logs", DeleteOutboundWebhookLogs)
			ob.GET("/webhooks/:id/event-types", ListOutboundWebhookEventTypes)
			ob.POST("/webhooks/:id/event-types", CreateOutboundWebhookEventType)
			ob.PUT("/webhooks/:id/event-types/:etid", UpdateOutboundWebhookEventType)
			ob.DELETE("/webhooks/:id/event-types/:etid", DeleteOutboundWebhookEventType)

			ob.GET("/deliveries/:id", GetOutboundDelivery)
			ob.POST("/deliveries/:id/retry", PostRetryOutboundDelivery)
			ob.GET("/deliveries", ListOutboundDeliveries)
		}
	}

	// 出站接口调用：供 form-app 运行时调用（connector / third_party）。
	// 用 FormRuntimeAuthMiddleware 同时接受管理端 JWT Bearer 与 Agent WebView 的 X-Device-Token，
	// 否则 Agent 端（仅有 X-Device-Token）调用 connector/third_party 接口会 401。
	obCall := r.Group("/api/outbound", auth.FormRuntimeAuthMiddleware())
	{
		obCall.POST("/connector-interfaces/call", CallConnectorInterface)
		obCall.GET("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
		obCall.POST("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
		obCall.PUT("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
		obCall.DELETE("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
		obCall.PATCH("/connector-interfaces/:code/invoke", CallConnectorInterfaceByCode)
		obCall.POST("/endpoints/:id/call", CallOutboundEndpoint)
	}

	// 上传链接管理
	ul := r.Group("/api/upload-links", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"))
	{
		ul.POST("", CreateUploadLink)
		ul.GET("", ListUploadLinks)
		ul.DELETE("/:id", DeleteUploadLink)
		ul.GET("/:id/files", ListUploadedFiles)
	}

	// SCADA 组态 / 点位模拟 / 数据栈 / Agent 菜单
	sca := r.Group("/api/scada", auth.AuthMiddleware(), auth.RequireRole("admin", "operator", "viewer"))
	{
		sca.GET("/groups", ListScadaGroups)
		sca.POST("/groups", auth.RequireRole("admin", "operator"), CreateScadaGroup)
		sca.PUT("/groups/:id", auth.RequireRole("admin", "operator"), UpdateScadaGroup)
		sca.DELETE("/groups/:id", auth.RequireRole("admin", "operator"), DeleteScadaGroup)
		sca.GET("/infos", ListScadaInfos)
		sca.GET("/infos/:scada_id", GetScadaInfo)
		sca.GET("/infos/code/:code", GetScadaInfoByCode)
		sca.POST("/infos", auth.RequireRole("admin", "operator"), CreateScadaInfo)
		sca.PUT("/infos/:scada_id", auth.RequireRole("admin", "operator"), UpdateScadaInfo)
		sca.DELETE("/infos/:scada_id", auth.RequireRole("admin", "operator"), DeleteScadaInfo)
		sca.POST("/save-canvas", auth.RequireRole("admin", "operator"), SaveScadaCanvas)
		sca.POST("/infos/:scada_id/save-canvas", auth.RequireRole("admin", "operator"), SaveScadaCanvasByID)
		sca.POST("/infos/:scada_id/publish", auth.RequireRole("admin", "operator"), PublishScada)
		sca.POST("/infos/:scada_id/unpublish", auth.RequireRole("admin", "operator"), UnpublishScada)
		sca.POST("/resource/upload/:category", auth.RequireRole("admin", "operator"), UploadScadaResource)
		sca.GET("/customize/components", ListScadaCustomizeComponents)
		sca.POST("/customize/component/create", auth.RequireRole("admin", "operator"), CreateScadaCustomizeComponent)
		sca.DELETE("/customize/component/:id", auth.RequireRole("admin", "operator"), DeleteScadaCustomizeComponent)
		sca.GET("/customize/file/:id", GetScadaCustomizeFile)
		// access policies
		sca.GET("/infos/:scada_id/access-policies", auth.RequireRole("admin", "operator"), ListScadaAccessPolicies)
		sca.POST("/infos/:scada_id/access-policies", auth.RequireRole("admin", "operator"), CreateScadaAccessPolicy)
		sca.PUT("/access-policies/:id", auth.RequireRole("admin", "operator"), UpdateScadaAccessPolicy)
		sca.DELETE("/access-policies/:id", auth.RequireRole("admin", "operator"), DeleteScadaAccessPolicy)
	}
	sim := r.Group("/api/scada/sim-points", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"))
	{
		sim.GET("", ListScadaSimPoints)
		sim.GET("/snapshot/:scada_code", GetScadaSimSnapshot)
		sim.GET("/history/:scada_code", GetScadaSimHistory)
		sim.POST("", CreateScadaSimPoint)
		sim.PUT("/:id", UpdateScadaSimPoint)
		sim.DELETE("/:id", DeleteScadaSimPoint)
	}
	dstack := r.Group("/api/data", auth.AuthMiddleware(), auth.RequireRole("admin", "operator", "viewer"))
	{
		dstack.GET("/sources", ListDataSources)
		dstack.POST("/sources", auth.RequireRole("admin", "operator"), CreateDataSource)
		dstack.PUT("/sources/:id", auth.RequireRole("admin", "operator"), UpdateDataSource)
		dstack.DELETE("/sources/:id", auth.RequireRole("admin", "operator"), DeleteDataSource)
		dstack.GET("/sources/:id/test", auth.RequireRole("admin", "operator"), TestDataSource)
		dstack.GET("/sources/:id/pool-stats", auth.RequireRole("admin", "operator"), GetDataSourcePoolStats)
		dstack.GET("/sources/:id/tables", ListDataSourceTables)
		dstack.GET("/sources/:id/tables/:table/columns", ListDataSourceTableColumns)
		dstack.GET("/sources/:id/select-all-sql", DataSourceSelectAllSQL)
		dstack.POST("/sources/:id/exec-ddl", auth.RequireRole("admin", "operator"), ExecDataSourceDDL)
		dstack.GET("/datasets", ListDatasets)
		dstack.POST("/datasets", auth.RequireRole("admin", "operator"), CreateDataset)
		dstack.PUT("/datasets/:id", auth.RequireRole("admin", "operator"), UpdateDataset)
		dstack.DELETE("/datasets/:id", auth.RequireRole("admin", "operator"), DeleteDataset)
		dstack.POST("/datasets/:id/preview", auth.RequireRole("admin", "operator"), PreviewDataset)
		dstack.POST("/datasets/:id/debug", auth.RequireRole("admin", "operator"), DebugDataset)
		dstack.GET("/datasets/:id/mock-params", auth.RequireRole("admin", "operator"), MockParamsDataset)
		dstack.GET("/datasets/:id/event-rows", auth.RequireRole("admin", "operator"), GetDatasetEventRows)
		dstack.GET("/datasets/:id/structures", ListDataStructures)
		dstack.POST("/datasets/:id/structures", auth.RequireRole("admin", "operator"), CreateDataStructure)
		dstack.PUT("/datasets/:id/structures/:sid", auth.RequireRole("admin", "operator"), UpdateDataStructure)
		dstack.DELETE("/datasets/:id/structures/:sid", auth.RequireRole("admin", "operator"), DeleteDataStructure)
		dstack.POST("/interfaces/:id/debug", auth.RequireRole("admin", "operator"), DebugDataInterface)
		dstack.POST("/interfaces/:id/invoke", auth.RequireRole("admin", "operator", "viewer"), InvokeDataInterfaceForClient)
		dstack.GET("/interfaces/:id/mock-params", auth.RequireRole("admin", "operator"), MockParamsInterface)
		dstack.GET("/interfaces/:id/param-schema", auth.RequireRole("admin", "operator"), GetInterfaceParamSchema)
		dstack.POST("/datasets/:id/generate-static-crud-interfaces", auth.RequireRole("admin", "operator"), GenerateStaticCrudInterfaces)
		dstack.POST("/datasets/:id/generate-crud-interfaces", auth.RequireRole("admin", "operator"), GenerateCrudInterfaces)
		dstack.POST("/datasets/:id/apply-ddl", auth.RequireRole("admin", "operator"), ApplyDatasetDDL)
		dstack.GET("/interface-groups", ListDataInterfaceGroups)
		dstack.POST("/interface-groups", auth.RequireRole("admin", "operator"), CreateDataInterfaceGroup)
		dstack.PUT("/interface-groups/:id", auth.RequireRole("admin", "operator"), UpdateDataInterfaceGroup)
		dstack.DELETE("/interface-groups/:id", auth.RequireRole("admin", "operator"), DeleteDataInterfaceGroup)
		dstack.GET("/interfaces", ListDataInterfaces)
		dstack.POST("/interfaces", auth.RequireRole("admin", "operator"), CreateDataInterface)
		dstack.PUT("/interfaces/:id", auth.RequireRole("admin", "operator"), UpdateDataInterface)
		dstack.DELETE("/interfaces/:id", auth.RequireRole("admin", "operator"), DeleteDataInterface)
		dstack.POST("/interfaces/batch-delete", auth.RequireRole("admin", "operator"), BatchDeleteDataInterfaces)

		// Workflow execution logs
		dstack.GET("/workflow-executions", ListWorkflowExecutionLogs)
		dstack.GET("/workflow-executions/recent", GetRecentWorkflowExecutions)
		dstack.GET("/workflow-executions/stats", GetWorkflowExecutionStats)
		dstack.GET("/workflow-executions/:request_id", GetWorkflowExecutionLog)
		dstack.GET("/workflow-executions/:request_id/progress", GetWorkflowExecutionProgress)
		dstack.GET("/workflow-executions/:request_id/timeline", GetWorkflowExecutionTimeline)
		dstack.POST("/workflow-executions/:request_id/retry", auth.RequireRole("admin", "operator"), RetryWorkflowExecution)
		dstack.DELETE("/workflow-executions/:request_id", auth.RequireRole("admin"), DeleteWorkflowExecutionLog)

		// Compensation dead letter queue
		dstack.GET("/compensation-deadletters", ListCompensationDeadLetters)
		dstack.GET("/compensation-deadletters/stats", GetCompensationDeadLetterStats)
		dstack.GET("/compensation-deadletters/:id", GetCompensationDeadLetter)
		dstack.POST("/compensation-deadletters/:id/retry", auth.RequireRole("admin", "operator"), RetryCompensationDeadLetter)
		dstack.POST("/compensation-deadletters/:id/mark-processed", auth.RequireRole("admin", "operator"), MarkCompensationDeadLetterProcessed)
		dstack.DELETE("/compensation-deadletters/:id", auth.RequireRole("admin"), DeleteCompensationDeadLetter)
		dstack.POST("/compensation-deadletters/batch-delete", auth.RequireRole("admin"), BatchDeleteCompensationDeadLetters)
		dstack.POST("/compensation-deadletters/purge-processed", auth.RequireRole("admin"), PurgeProcessedDeadLetters)

		// 异步任务管理
		dstack.GET("/async-tasks", auth.RequireRole("admin", "operator", "viewer"), ListRunningAsyncTasks)
		dstack.GET("/async-tasks/stats", auth.RequireRole("admin", "operator", "viewer"), GetAsyncExecutorStats)
		dstack.GET("/async-tasks/:request_id/:step_id", auth.RequireRole("admin", "operator", "viewer"), GetAsyncTaskStatus)
		dstack.POST("/async-tasks/cleanup", auth.RequireRole("admin"), CleanupAsyncTasks)
	}
	amenu := r.Group("/api/agent-menus", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"))
	{
		amenu.GET("", ListAgentMenuItems)
		amenu.GET("/execution-logs", ListAgentMenuExecutionLogs)
		amenu.GET("/matrix", GetAgentMenuMatrix)
		amenu.POST("", CreateAgentMenuItem)
		amenu.PUT("/:id", UpdateAgentMenuItem)
		amenu.DELETE("/:id", DeleteAgentMenuItem)
		amenu.POST("/deploy", DeployAgentMenus)
		amenu.PUT("/assignments", SetAgentMenuAssignments)
	}
	// 工单（问题反馈）
	// 创建 / 上传附件 / 我的工单：支持登录用户(JWT) 或 Agent(X-Device-Token)
	woRuntime := r.Group("/api/work-orders", auth.FormRuntimeAuthMiddleware())
	{
		woRuntime.POST("", CreateWorkOrder)
		woRuntime.GET("/types", ListWorkOrderTypes)
		woRuntime.GET("/mine", ListMyWorkOrders)
		woRuntime.GET("/mine/:id", GetMyWorkOrder)
		woRuntime.PUT("/mine/:id", UpdateMyWorkOrder)
		woRuntime.POST("/mine/:id/status", ChangeMyWorkOrderStatus)
		woRuntime.POST("/:id/items", UploadWorkOrderItem)
		woRuntime.GET("/:id/items/:item_id/download", DownloadWorkOrderItem)
		woRuntime.PUT("/:id/items/:item_id", UpdateWorkOrderItem)
		woRuntime.POST("/items/:item_id/recognize-barcode", RecognizeWorkOrderItemBarcode)
		// 工单进展：web(JWT) 与 app(device-token) 共用
		woRuntime.GET("/:id/progress", ListWorkOrderProgress)
		woRuntime.POST("/:id/progress", CreateWorkOrderProgress)
		woRuntime.POST("/progress/:progress_id/attachments", UploadWorkOrderProgressAttachment)
		woRuntime.GET("/progress/attachments/:att_id/download", DownloadWorkOrderProgressAttachment)
		// 标签字典读取 + 工单标签维护：web(JWT) 与 app(device-token) 共用
		woRuntime.GET("/tags", ListWorkOrderTagDict)
		woRuntime.PUT("/:id/tags", SetWorkOrderTags)
	}
	// Agent 端工单列表和详情：支持 JWT(admin可查看所有) 或 device-token(仅查看本设备)
	agentWO := r.Group("/api/agent/work-orders", auth.FormRuntimeAuthMiddleware())
	{
		agentWO.GET("", AgentListWorkOrders)
		agentWO.GET("/:id", AgentGetWorkOrder)
	}
	// 管理/处理：登录用户
	wo := r.Group("/api/work-orders", auth.AuthMiddleware())
	{
		wo.GET("", ListWorkOrders)
		wo.POST("/types", auth.RequireRole("admin", "operator"), CreateWorkOrderType)
		wo.PUT("/types/:id", auth.RequireRole("admin", "operator"), UpdateWorkOrderType)
		wo.DELETE("/types/:id", auth.RequireRole("admin", "operator"), DeleteWorkOrderType)
		wo.GET("/webhooks", auth.RequireRole("admin", "operator"), ListWorkOrderWebhooks)
		wo.POST("/webhooks", auth.RequireRole("admin", "operator"), CreateWorkOrderWebhook)
		wo.PUT("/webhooks/:id", auth.RequireRole("admin", "operator"), UpdateWorkOrderWebhook)
		wo.DELETE("/webhooks/:id", auth.RequireRole("admin", "operator"), DeleteWorkOrderWebhook)
		wo.GET("/webhooks/logs", auth.RequireRole("admin", "operator"), ListWorkOrderWebhookLogs)
		wo.GET("/webhooks/logs/:id", auth.RequireRole("admin", "operator"), GetWorkOrderWebhookLog)
		// 工作流管理（admin/operator）
		wo.GET("/workflows", auth.RequireRole("admin", "operator"), ListWorkOrderWorkflows)
		wo.GET("/workflows/:id", auth.RequireRole("admin", "operator"), GetWorkOrderWorkflow)
		wo.POST("/workflows", auth.RequireRole("admin", "operator"), CreateWorkOrderWorkflow)
		wo.PUT("/workflows/:id", auth.RequireRole("admin", "operator"), UpdateWorkOrderWorkflow)
		wo.DELETE("/workflows/:id", auth.RequireRole("admin", "operator"), DeleteWorkOrderWorkflow)
		wo.POST("/workflows/:id/test", auth.RequireRole("admin", "operator"), TestWorkOrderWorkflow)
		wo.GET("/workflow-logs", auth.RequireRole("admin", "operator"), ListWorkOrderWorkflowLogs)
		// 标签字典管理（admin/operator）
		wo.GET("/tag-dict", auth.RequireRole("admin", "operator"), ListWorkOrderTags)
		wo.POST("/tag-dict", auth.RequireRole("admin", "operator"), CreateWorkOrderTag)
		wo.PUT("/tag-dict/:id", auth.RequireRole("admin", "operator"), UpdateWorkOrderTag)
		wo.DELETE("/tag-dict/:id", auth.RequireRole("admin", "operator"), DeleteWorkOrderTag)
		// 批量归档/取消归档（静态段，须在 /:id 之前避免路由歧义）
		wo.POST("/batch/archive", auth.RequireRole("admin", "operator"), BatchArchiveWorkOrders)
		wo.POST("/batch/unarchive", auth.RequireRole("admin", "operator"), BatchUnarchiveWorkOrders)
		// 统计分析报告
		wo.GET("/statistics", GetWorkOrderStatistics)
		// 报告分享管理
		wo.POST("/report-shares", CreateWorkOrderReportShare)
		wo.GET("/report-shares", ListWorkOrderReportShares)
		wo.GET("/report-shares/:id/views", GetWorkOrderReportShareViews)
		wo.DELETE("/report-shares/:id", DeleteWorkOrderReportShare)
		wo.GET("/:id", GetWorkOrder)
		wo.PUT("/:id", auth.RequireRoleOrWoWrite("admin", "operator"), UpdateWorkOrder)
		wo.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteWorkOrder)
		wo.POST("/:id/assign", auth.RequireRole("admin", "operator"), AssignWorkOrder)
		wo.POST("/:id/status", auth.RequireRoleOrWoWrite("admin", "operator"), ChangeWorkOrderStatus)
	}
	fapp := r.Group("/api/form-app", auth.AuthMiddleware(), auth.RequireRole("admin", "operator", "viewer"))
	{
		fapp.GET("/infos", ListFormApps)
		fapp.GET("/infos/:id", GetFormApp)
		fapp.GET("/infos/code/:code", GetFormAppByCode)
		fapp.POST("/infos", auth.RequireRole("admin", "operator"), CreateFormApp)
		fapp.PUT("/infos/:id", auth.RequireRole("admin", "operator"), UpdateFormApp)
		fapp.DELETE("/infos/:id", auth.RequireRole("admin", "operator"), DeleteFormApp)
		fapp.POST("/infos/:id/save-schema", auth.RequireRole("admin", "operator"), SaveFormAppSchema)
		fapp.POST("/repair-generated-schemas", auth.RequireRole("admin", "operator"), RepairGeneratedFormSchemas)
		fapp.POST("/infos/:id/generate-pages-from-table", auth.RequireRole("admin", "operator"), GenerateFormAppPagesFromTable)
		fapp.POST("/infos/:id/publish", auth.RequireRole("admin", "operator"), PublishFormApp)
		fapp.POST("/infos/:id/unpublish", auth.RequireRole("admin", "operator"), UnpublishFormApp)
		fapp.POST("/infos/:id/deploy-to-devices", auth.RequireRole("admin", "operator"), DeployFormAppToDevices)
		fapp.POST("/runtime/query", auth.RequireRole("admin", "operator"), FormRuntimeQuery)
		fapp.POST("/runtime/submit", auth.RequireRole("admin", "operator"), FormRuntimeSubmit)
		fapp.GET("/runtime/draft", FormRuntimeGetDraft)
		fapp.PUT("/runtime/draft", FormRuntimePutDraft)
		fapp.DELETE("/runtime/draft", FormRuntimeDeleteDraft)

		fapp.GET("/infos/:id/pages", GetFormAppPages)
		fapp.POST("/infos/:id/pages", auth.RequireRole("admin", "operator"), CreateFormAppPage)
		fapp.GET("/pages/:page_id", GetFormAppPage)
		fapp.PUT("/pages/:page_id", auth.RequireRole("admin", "operator"), UpdateFormAppPage)
		fapp.DELETE("/pages/:page_id", auth.RequireRole("admin", "operator"), DeleteFormAppPage)
		fapp.POST("/pages/:page_id/duplicate", auth.RequireRole("admin", "operator"), DuplicateFormAppPage)
		// AI 编辑字段快照与回滚
		fapp.GET("/pages/:page_id/snapshots", ListPageSnapshots)
		fapp.POST("/pages/:page_id/ai-save", auth.RequireRole("admin", "operator"), AISavePage)
		fapp.POST("/pages/:page_id/snapshots/:snapshot_id/rollback", auth.RequireRole("admin", "operator"), RollbackPageSnapshot)
		fapp.POST("/print-debug", auth.RequireRole("admin", "operator"), FormAppPrintDebug)
		fapp.POST("/infos/:id/pages/batch-delete", auth.RequireRole("admin", "operator"), BatchDeleteFormAppPages)
		fapp.POST("/infos/:id/pages/clear", auth.RequireRole("admin", "operator"), ClearFormAppPages)
		fapp.POST("/infos/:id/pages/regenerate", auth.RequireRole("admin", "operator"), RegenerateSinglePage)
		fapp.POST("/infos/:id/pages/reorder", auth.RequireRole("admin", "operator"), ReorderFormAppPages)

		fapp.GET("/infos/:id/links", GetFormAppPageLinks)
		fapp.POST("/infos/:id/links", auth.RequireRole("admin", "operator"), CreateFormAppPageLink)
		fapp.PUT("/links/:link_id", auth.RequireRole("admin", "operator"), UpdateFormAppPageLink)
		fapp.DELETE("/links/:link_id", auth.RequireRole("admin", "operator"), DeleteFormAppPageLink)

		// AI 技能管理 + AI Chat 流式生成字段
		fapp.GET("/skills", ListAISkills)
		fapp.GET("/skills/:skill_id", GetAISkill)
		fapp.POST("/skills", auth.RequireRole("admin", "operator"), CreateAISkill)
		fapp.PUT("/skills/:skill_id", auth.RequireRole("admin", "operator"), UpdateAISkill)
		fapp.DELETE("/skills/:skill_id", auth.RequireRole("admin", "operator"), DeleteAISkill)
		fapp.POST("/ai/chat", FormAppAIChat)
		fapp.POST("/ai/sql-generate", SQLAIGenerate)

		fapp.GET("/infos/:id/event-routes", GetFormAppEventRoutes)
		fapp.POST("/infos/:id/event-routes", auth.RequireRole("admin", "operator"), CreateFormAppEventRoute)
		fapp.PUT("/event-routes/:route_id", auth.RequireRole("admin", "operator"), UpdateFormAppEventRoute)
		fapp.DELETE("/event-routes/:route_id", auth.RequireRole("admin", "operator"), DeleteFormAppEventRoute)
		fapp.POST("/infos/:id/test-event", auth.RequireRole("admin", "operator"), TestFormAppEvent)
	}

	// Form App Agent 运行时（JWT 或 X-Device-Token）
	agentFapp := r.Group("/api/form-app/agent-runtime", auth.FormRuntimeAuthMiddleware())
	{
		agentFapp.GET("/:code/bootstrap", FormRuntimeBootstrap)
		agentFapp.POST("/query", FormRuntimeQuery)
		agentFapp.POST("/submit", FormRuntimeSubmit)
		agentFapp.POST("/match-event", FormRuntimeMatchEvent)
	}

	// 组织架构
	org := r.Group("/api/org", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"))
	{
		org.GET("/departments", ListDepartments)
		org.POST("/departments", auth.RequireRole("admin"), CreateDepartment)
		org.PUT("/departments/:id", auth.RequireRole("admin"), UpdateDepartment)
		org.DELETE("/departments/:id", auth.RequireRole("admin"), DeleteDepartment)
		org.GET("/positions", ListPositions)
		org.POST("/positions", auth.RequireRole("admin"), CreatePosition)
		org.PUT("/positions/:id", auth.RequireRole("admin"), UpdatePosition)
		org.DELETE("/positions/:id", auth.RequireRole("admin"), DeletePosition)
		org.GET("/users/:user_id/departments", ListUserDepartments)
		org.POST("/users/:user_id/departments", auth.RequireRole("admin"), AssignUserDepartment)
		org.DELETE("/users/:user_id/departments/:dept_id", auth.RequireRole("admin"), RemoveUserDepartment)
		org.GET("/device-groups", ListDeviceGroupsTree)
		org.POST("/device-groups", auth.RequireRole("admin"), CreateDeviceGroup)
		org.PUT("/device-groups/:id", auth.RequireRole("admin"), UpdateDeviceGroup)
		org.DELETE("/device-groups/:id", auth.RequireRole("admin"), DeleteDeviceGroup)
		org.GET("/device-groups/:id/members", ListDeviceGroupMembers)
		org.POST("/device-groups/:id/members", auth.RequireRole("admin"), AddDeviceGroupMember)
		org.DELETE("/device-groups/:id/members/:device_id", auth.RequireRole("admin"), RemoveDeviceGroupMember)
	}

	// OAuth 2.0 — token endpoint (无需登录，Client Credentials)
	r.POST("/api/oauth/token", PostOAuthToken)
	// OAuth 2.0 — authorization code flow
	r.GET("/api/oauth/authorize", OAuthAuthorizeInfo)
	r.POST("/api/oauth/authorize", auth.AuthMiddleware(), OAuthAuthorizeConsent)
	// OAuth 2.0 — client management (admin only)
	oauthAdmin := r.Group("/api/oauth", auth.AuthMiddleware(), auth.RequireRole("admin"))
	{
		oauthAdmin.GET("/clients", ListOAuthClients)
		oauthAdmin.POST("/clients", CreateOAuthClient)
		oauthAdmin.GET("/clients/:id", GetOAuthClient)
		oauthAdmin.PUT("/clients/:id", UpdateOAuthClient)
		oauthAdmin.DELETE("/clients/:id", DeleteOAuthClient)
		oauthAdmin.POST("/clients/:id/revoke-tokens", RevokeOAuthClientTokens)
		oauthAdmin.POST("/introspect", OAuthIntrospect)
	}

	// Third-party OAuth providers (admin only)
	tp := r.Group("/api/thirdparty", auth.AuthMiddleware(), auth.RequireRole("admin"))
	{
		tp.GET("", ListThirdPartyProviders)
		tp.POST("", CreateThirdPartyProvider)
		tp.GET("/:id", GetThirdPartyProvider)
		tp.PUT("/:id", UpdateThirdPartyProvider)
		tp.DELETE("/:id", DeleteThirdPartyProvider)
		tp.GET("/:id/token", GetThirdPartyTokenStatus)
		// FreePass
		tp.GET("/:id/authorize", FreePassAuthorizeURL)
		tp.GET("/:id/freepass/callback", FreePassCallback)
		tp.POST("/:id/freepass/refresh", FreePassRefresh)
		// WeChat Open Platform
		tp.POST("/:id/wechat/preauthcode", WechatPreAuthCode)
		tp.GET("/:id/wechat/callback", WechatCallback)
		tp.POST("/:id/wechat/refresh", WechatRefresh)
		tp.POST("/:id/wechat/ticket", WechatTicket)
		// eTeams/FreePass SSO
		tp.GET("/:id/eteams/auth-url", GetETeamsAuthURL)

		// API Endpoints
		tp.GET("/endpoints", ListThirdPartyApiEndpoints)
		tp.POST("/endpoints", CreateThirdPartyApiEndpoint)
		tp.GET("/endpoints/:id", GetThirdPartyApiEndpoint)
		tp.PUT("/endpoints/:id", UpdateThirdPartyApiEndpoint)
		tp.DELETE("/endpoints/:id", DeleteThirdPartyApiEndpoint)

		// User Sync
		tp.POST("/:id/sync-users", SyncUsersFromProvider)
		tp.GET("/:id/sync-status", GetUserSyncStatus)
	}

	// Third party API call (accessible to operators for form-app scanner)
	r.POST("/api/thirdparty/call", auth.AuthMiddleware(), CallThirdPartyApi)

	// WebSocket
	r.GET("/ws/stomp", StompWSAuth, StompWS)
	r.GET("/ws/stomp-scada", StompScadaShareAuth, StompScadaShareWS)
	r.GET("/ws/open/stomp", OpenStompWSAuth, OpenStompWS)
	r.GET("/ws/scada/stream/:scada_code", ScadaStreamWS)
	r.GET("/ws/screen/:deviceId", auth.ScreenWSAuth(), ScreenWS)
	r.GET("/ws/shell/:deviceId", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"), ShellWS)
	r.GET("/ws/logcat/:deviceId", auth.AuthMiddleware(), LogcatWS)
	r.GET("/ws/agent/:deviceId", AgentWS)
	r.GET("/ws/agent-fs/:deviceId", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"), AgentFsWS)
	r.GET("/ws/camera/:deviceId", auth.AuthMiddleware(), CameraWS)
	r.GET("/ws/channel", ChannelWS)
	r.GET("/ws/yjs/:room", YjsWS)

	// 缓冲入站 Webhook（免 API Key，凭 X-Webhook-Secret）
	r.POST("/api/open/v1/ingress/buffer/:dataset_code", datastack.OpenBufferWebhook(database.DB))
	// event_bound Webhook 推送入站（免 API Key，凭 webhook 自身鉴权）
	r.POST("/api/open/v1/ingress/webhook/:webhook_id", datastack.OpenWebhookPush(database.DB))
	// 出站连接器 Webhook 触发器入站（免 API Key，凭 token 自身鉴权）
	r.POST("/api/open/v1/trigger/:token", InboundWebhookTrigger)
	// 出站 Webhook 接收端点（按 ID 路由，自带鉴权/解密）
	r.Any("/api/open/v1/outbound/webhooks/receive/:app_code/:token", ReceiveOutboundWebhook)

	// 对外开放 API
	open := r.Group("/api/open/v1",
		auth.APIKeyMiddleware(),
		ratelimit.Middleware(ratelimit.KeyByAPIKey, rl.OpenAPIRPM(), rl.OpenAPIBurstSize()),
	)
	{
		open.GET("/data/:code", OpenDataInterfaceInvoke)
		open.POST("/data/:code", OpenDataInterfaceInvoke)
		open.GET("/devices", auth.RequireOpenScope(auth.OpenDevicesList), ListDevices)
		open.GET("/devices/:id/info", auth.RequireOpenScope(auth.OpenDeviceInfo), GetDeviceInfo)
		open.GET("/devices/:id/apps", auth.RequireOpenScope(auth.OpenDeviceApps), GetDeviceApps)
		open.POST("/apps/upload", auth.RequireOpenScope(auth.OpenAppsUpload), UploadApp)
		open.POST("/apps/:id/install", auth.RequireOpenScope(auth.OpenAppsInstall), InstallApp)
		open.GET("/tasks/:id", auth.RequireOpenScope(auth.OpenTasksGet), GetTask)
		open.GET("/events", auth.RequireOpenScope(auth.OpenEventsList), ListDeviceEvents)
		// 工单：第三方查询/处理/关闭
		open.GET("/work-orders/:code", auth.RequireOpenScope(auth.OpenWorkOrderRead), OpenGetWorkOrder)
		open.POST("/work-orders/:code/process", auth.RequireOpenScope(auth.OpenWorkOrderWrite), OpenProcessWorkOrder)
		open.POST("/work-orders/:code/close", auth.RequireOpenScope(auth.OpenWorkOrderWrite), OpenCloseWorkOrder)
	}

	// Workflow Engine (兼容原有事件系统)
	wf := r.Group("/api/workflows", auth.AuthMiddleware())
	{
		wf.GET("", ListWorkflows)
		wf.POST("", auth.RequireRole("admin", "operator"), CreateWorkflow)
		wf.GET("/:id", GetWorkflow)
		wf.PUT("/:id", auth.RequireRole("admin", "operator"), UpdateWorkflow)
		wf.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteWorkflow)

		// 执行
		wf.POST("/:id/execute", auth.RequireRole("admin", "operator"), ExecuteWorkflow)
		wf.GET("/:id/executions", ListExecutions)
		wf.GET("/executions/:exec_id", GetExecution)
		wf.POST("/executions/:exec_id/cancel", auth.RequireRole("admin", "operator"), CancelExecution)
		wf.GET("/executions/:exec_id/status", GetExecutionLiveStatus)

		// 测试
		wf.POST("/:id/test", auth.RequireRole("admin", "operator"), TestWorkflow)
	}

	// Workflow WebSocket
	r.GET("/ws/workflow/executions/:exec_id", auth.AuthMiddleware(), WorkflowExecutionWS)
	r.GET("/api/workflows/executions/:exec_id/events", auth.AuthMiddleware(), WorkflowExecutionEventsSSE)

	// Workflow 绑定到现有事件（扩展原有 API）
	r.POST("/api/custom-events/:id/bind-workflow", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"), BindWorkflowToCustomEvent)
	r.DELETE("/api/custom-events/:id/unbind-workflow", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"), UnbindWorkflowFromCustomEvent)
	r.POST("/api/form-apps/:id/event-routes/:route_id/bind-workflow", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"), BindWorkflowToFormEvent)

	// MCP — Model Context Protocol (X-API-Key auth)
	mcpGroup := r.Group("/mcp/v1",
		auth.APIKeyMiddleware(),
		ratelimit.Middleware(ratelimit.KeyByAPIKey, rl.MCPRPM(), rl.MCPBurstSize()),
	)
	{
		mcpGroup.POST("/", mcp.Handle)
	}

	// X5 内核管理
	RegisterX5KernelRoutes(r)

	// Low-Code Platform API
	api := r.Group("/api")
	lowcode.RegisterRoutes(api)

	// SPA 回退放最后，避免未匹配 API 被误判为前端路由
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if len(path) >= 14 && path[:14] == "/scada-editor/" {
			c.File(config.C.Server.ScadaEditorPath() + "/index.html")
			return
		}
		if len(path) >= 10 && path[:10] == "/form-app/" {
			c.File(config.C.Server.FormAppPath() + "/index.html")
			return
		}
		c.File(config.C.Server.WebDistPath() + "/index.html")
	})

	return r
}
