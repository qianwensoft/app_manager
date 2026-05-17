package api

import (
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/datastack"
	"app-manager/mcp"
	"os"

	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
	// 启动无线 ADB 保活（每 30 秒 reconnect，防止 adb server 重启后连接丢失）
	StartAdbKeepalive()

	r := gin.Default()

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

	// 静态文件
	r.Static("/assets", "./web/dist/assets")
	r.StaticFile("/", "./web/dist/index.html")
	// scada-editor: 优先 web/dist/scada-editor（make 构建后），fallback 到 scada-editor/dist（开发模式）
	scadaEditorDir := "./web/dist/scada-editor"
	if _, err := os.Stat(scadaEditorDir); os.IsNotExist(err) {
		scadaEditorDir = "../scada-editor/dist"
	}
	r.Static("/scada-editor", scadaEditorDir)
	// form-app: 优先 web/dist/form-app（make 构建后），fallback 到 form-app/dist（开发模式）
	formAppDir := "./web/dist/form-app"
	if _, err := os.Stat(formAppDir); os.IsNotExist(err) {
		formAppDir = "../form-app/dist"
	}
	r.Static("/form-app", formAppDir)

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

	// 免登录：组态分享
	r.GET("/api/scada/info/share/:token", GetScadaInfoByShareToken)
	// 免登录：表单分享
	r.GET("/api/form-app/info/share/:token", GetFormAppByShareToken)
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

	// 认证
	a := r.Group("/api/auth")
	{
		a.POST("/register", Register)
		a.POST("/login", Login)
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
		d.POST("/:id/agent/refresh-info", RefreshAgentDeviceInfoFromAgent)
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

			ob.GET("/endpoints", ListOutboundEndpoints)
			ob.POST("/endpoints", CreateOutboundEndpoint)
			ob.GET("/template-demo", GetOutboundTemplateDemo)
			ob.POST("/template-expand", PostOutboundTemplateExpand)
			ob.GET("/template-vars", GetOutboundTemplateVars)
			ob.POST("/phase-preview", PostOutboundPhasePreview)
			ob.POST("/endpoints/debug", PostOutboundEndpointDebug)
			ob.GET("/endpoints/:id", GetOutboundEndpoint)
			ob.GET("/endpoints/:id/param-schema", GetEndpointParamSchema)
			ob.PUT("/endpoints/:id", UpdateOutboundEndpoint)
			ob.DELETE("/endpoints/:id", DeleteOutboundEndpoint)

			ob.POST("/connectors", CreateOutboundConnector)
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
	}
	amenu := r.Group("/api/agent-menus", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"))
	{
		amenu.GET("", ListAgentMenuItems)
		amenu.GET("/execution-logs", ListAgentMenuExecutionLogs)
		amenu.POST("", CreateAgentMenuItem)
		amenu.PUT("/:id", UpdateAgentMenuItem)
		amenu.DELETE("/:id", DeleteAgentMenuItem)
		amenu.POST("/deploy", DeployAgentMenus)
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

		fapp.GET("/infos/:id/pages", GetFormAppPages)
		fapp.POST("/infos/:id/pages", auth.RequireRole("admin", "operator"), CreateFormAppPage)
		fapp.GET("/pages/:page_id", GetFormAppPage)
		fapp.PUT("/pages/:page_id", auth.RequireRole("admin", "operator"), UpdateFormAppPage)
		fapp.DELETE("/pages/:page_id", auth.RequireRole("admin", "operator"), DeleteFormAppPage)
		fapp.POST("/pages/:page_id/duplicate", auth.RequireRole("admin", "operator"), DuplicateFormAppPage)
		fapp.POST("/infos/:id/pages/batch-delete", auth.RequireRole("admin", "operator"), BatchDeleteFormAppPages)
		fapp.POST("/infos/:id/pages/clear", auth.RequireRole("admin", "operator"), ClearFormAppPages)
		fapp.POST("/infos/:id/pages/regenerate", auth.RequireRole("admin", "operator"), RegenerateSinglePage)
		fapp.POST("/infos/:id/pages/reorder", auth.RequireRole("admin", "operator"), ReorderFormAppPages)

		fapp.GET("/infos/:id/links", GetFormAppPageLinks)
		fapp.POST("/infos/:id/links", auth.RequireRole("admin", "operator"), CreateFormAppPageLink)
		fapp.PUT("/links/:link_id", auth.RequireRole("admin", "operator"), UpdateFormAppPageLink)
		fapp.DELETE("/links/:link_id", auth.RequireRole("admin", "operator"), DeleteFormAppPageLink)

		fapp.GET("/infos/:id/event-routes", GetFormAppEventRoutes)
		fapp.POST("/infos/:id/event-routes", auth.RequireRole("admin", "operator"), CreateFormAppEventRoute)
		fapp.PUT("/event-routes/:route_id", auth.RequireRole("admin", "operator"), UpdateFormAppEventRoute)
		fapp.DELETE("/event-routes/:route_id", auth.RequireRole("admin", "operator"), DeleteFormAppEventRoute)
		fapp.POST("/infos/:id/test-event", auth.RequireRole("admin", "operator"), TestFormAppEvent)
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
	}

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

	// 缓冲入站 Webhook（免 API Key，凭 X-Webhook-Secret）
	r.POST("/api/open/v1/ingress/buffer/:dataset_code", datastack.OpenBufferWebhook(database.DB))
	// event_bound Webhook 推送入站（免 API Key，凭 webhook 自身鉴权）
	r.POST("/api/open/v1/ingress/webhook/:webhook_id", datastack.OpenWebhookPush(database.DB))
	// 出站连接器 Webhook 触发器入站（免 API Key，凭 token 自身鉴权）
	r.POST("/api/open/v1/trigger/:token", InboundWebhookTrigger)
	// 出站 Webhook 接收端点（按 ID 路由，自带鉴权/解密）
	r.Any("/api/open/v1/outbound/webhooks/receive/:app_code/:token", ReceiveOutboundWebhook)

	// 对外开放 API
	open := r.Group("/api/open/v1", auth.APIKeyMiddleware())
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
	}

	// MCP — Model Context Protocol (X-API-Key auth)
	mcpGroup := r.Group("/mcp/v1", auth.APIKeyMiddleware())
	{
		mcpGroup.POST("/", mcp.Handle)
	}

	// SPA 回退放最后，避免未匹配 API 被误判为前端路由
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if len(path) >= 14 && path[:14] == "/scada-editor/" {
			c.File("./web/dist/scada-editor/index.html")
			return
		}
		if len(path) >= 10 && path[:10] == "/form-app/" {
			c.File("./web/dist/form-app/index.html")
			return
		}
		c.File("./web/dist/index.html")
	})

	return r
}
