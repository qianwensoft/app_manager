package api

import (
	"app-manager/auth"

	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
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
	r.NoRoute(func(c *gin.Context) {
		c.File("./web/dist/index.html")
	})

	// Agent 上传录屏（凭 X-Device-Token，无需登录）
	r.POST("/api/agent/recordings/upload", AgentRecordingUpload)
	// Agent 测速 HTTP（凭 X-Device-Token）
	r.GET("/api/agent/speed-test/download", AgentSpeedTestDownload)
	r.POST("/api/agent/speed-test/upload", AgentSpeedTestUpload)
	r.GET("/api/agent/install-apk", AgentInstallApkDownload)
	r.POST("/api/agent/pulled-apk-upload", AgentPulledApkUpload)

	// 免登录：分享页校验链接
	r.GET("/api/screen-share/claims", ScreenShareClaims)

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
		d.POST("/:id/media/upload", auth.RequireRole("admin", "operator"), UploadDeviceMedia)
		d.POST("/:id/screen-shares", CreateScreenShare)
		d.GET("/:id/screen-shares", ListScreenShares)
		d.DELETE("/:id/screen-shares/:sid", RevokeScreenShare)

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

	// 录屏管理
	rec := r.Group("/api/recordings", auth.AuthMiddleware())
	{
		rec.GET("", ListRecordings)
		rec.GET("/:id/stream", StreamRecording)
		rec.GET("/:id/download", DownloadRecording)
		rec.PATCH("/:id", auth.RequireRole("admin", "operator"), RenameRecording)
		rec.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteRecording)
	}

	// 设备媒体（截图存档、上传音频等）
	dm := r.Group("/api/device-media", auth.AuthMiddleware())
	{
		dm.GET("/:id/download", DownloadDeviceMedia)
		dm.GET("/:id/stream", StreamDeviceMedia)
		dm.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteDeviceMedia)
	}

	// 设备事件
	e := r.Group("/api/events", auth.AuthMiddleware())
	{
		e.GET("", ListDeviceEvents)
		e.GET("/types", GetEventTypes)
	}

	// WebSocket
	r.GET("/ws/stomp", StompWSAuth, StompWS)
	r.GET("/ws/screen/:deviceId", auth.ScreenWSAuth(), ScreenWS)
	r.GET("/ws/shell/:deviceId", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"), ShellWS)
	r.GET("/ws/logcat/:deviceId", auth.AuthMiddleware(), LogcatWS)
	r.GET("/ws/agent/:deviceId", AgentWS)

	// 对外开放 API
	open := r.Group("/api/open/v1", auth.APIKeyMiddleware())
	{
		open.GET("/devices", auth.RequireOpenScope(auth.OpenDevicesList), ListDevices)
		open.GET("/devices/:id/info", auth.RequireOpenScope(auth.OpenDeviceInfo), GetDeviceInfo)
		open.GET("/devices/:id/apps", auth.RequireOpenScope(auth.OpenDeviceApps), GetDeviceApps)
		open.POST("/apps/upload", auth.RequireOpenScope(auth.OpenAppsUpload), UploadApp)
		open.POST("/apps/:id/install", auth.RequireOpenScope(auth.OpenAppsInstall), InstallApp)
		open.GET("/tasks/:id", auth.RequireOpenScope(auth.OpenTasksGet), GetTask)
	}

	return r
}
