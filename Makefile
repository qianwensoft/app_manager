# App Manager — 构建与发布
# 在仓库根目录执行：make help

ROOT       := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
WEB        := $(ROOT)/web
SCADA_EDITOR := $(ROOT)/scada-editor
FORM_APP   := $(ROOT)/form-app
DOCS_APP   := $(ROOT)/docs-app
SERVER     := $(ROOT)/server
AGENT      := $(ROOT)/agent
BRIDGE     := $(ROOT)/bridge
BIN_DIR    := $(ROOT)/bin
DIST_DIR   := $(ROOT)/dist
RELEASE_DIR := $(DIST_DIR)/release

# 发布包版本号（优先 git 描述）
VERSION    ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

GO         ?= go
NPM        ?= npm
GRADLEW    := $(AGENT)/gradlew

# 服务端二进制输出路径
SERVER_BIN := $(BIN_DIR)/app-manager

.DEFAULT_GOAL := help

# ─── pbc40 部署目标 ────────────────────────────────────────────────────────
# 目标机器：pbc40（192.168.102.40），部署目录：/opt/app-manager，端口：88
PBC40_HOST    ?= pbc40
PBC40_DIR     ?= /opt/app-manager
PBC40_CONFIG  := server/config.yaml
PBC40_SERVICE := app-manager

.PHONY: help all clean docker-build docker-up \
	deps-web web web-build \
	deps-scada-editor scada-editor-build \
	deps-form-app form-app-build \
	deps-docs-app docs-app-build \
	server server-only server-only-linux-amd64 server-linux-amd64 server-linux-arm64 server-darwin-amd64 server-darwin-arm64 server-windows-amd64 \
	agent agent-debug agent-release agent-release-build install-agent bump-agent-version \
	bridge bridge-linux-amd64 bridge-linux-arm64 bridge-darwin-amd64 bridge-darwin-arm64 bridge-windows-amd64 bridge-all \
	release release-linux release-darwin release-windows release-all release-zip release-tar \
	check test fmt schema-check \
	deploy-pbc40 deploy-pbc40-server deploy-pbc40-web deploy-pbc40-agent deploy-pbc40-restart deploy-pbc40-quick deploy-pbc40-quick pbc40-install-service

help:
	@echo "App Manager — 常用目标"
	@echo ""
	@echo "  make all              构建 Web + Server 二进制（默认输出 $(SERVER_BIN)）"
	@echo "  make web              安装依赖并构建前端 → web/dist"
	@echo "  make server           先 web 再编译 Go 服务（需 web/dist 已存在）"
	@echo "  make server-only      仅编译 Go（不检查 web）"
	@echo "  make agent / agent-debug  编译 Agent 调试 APK"
	@echo "  make agent-release    自动检测 agent 提交→升级版本→编译 release APK"
	@echo "  make agent-release-build  仅编译 release APK（跳过版本升级）"
	@echo "  make bump-agent-version   仅升级 agent 版本号（不构建）"
	@echo "    AGENT_VERSION=x.y.z     直接指定版本名"
	@echo "    AGENT_CODE=N            直接指定 versionCode"
	@echo "    FORCE=1                 强制升级（无论是否有 agent 提交）"
	@echo "  make deploy-pbc40          完整构建（server+web+APK）并部署到 pbc40，访问 http://192.168.102.40:88"
	@echo "  make deploy-pbc40-quick    跳过重新构建，直接同步已有产物"
	@echo "  make deploy-pbc40-server   仅重新编译 server 并同步"
	@echo "  make deploy-pbc40-web      仅重新构建前端（web+scada+form-app）并同步"
	@echo "  make deploy-pbc40-agent    仅构建并上传 release APK"
	@echo "  make deploy-pbc40-restart  仅在远程重启服务"
	@echo "    PBC40_HOST=pbc40           SSH 主机名（默认 pbc40，需配置 ~/.ssh/config）"
	@echo "    PBC40_DIR=/opt/app-manager 远程部署目录"
	@echo ""
	@echo "  make release          生成 Linux 发布包（默认）"
	@echo "  make release-linux    生成 Linux 发布包 + systemd 服务"
	@echo "  make release-darwin   生成 macOS 发布包 + launchd 服务"
	@echo "  make release-windows  生成 Windows 发布包 + sc 服务"
	@echo "  make release-all      生成所有平台发布包"
	@echo "  make release-zip      release 再打 zip"
	@echo "  make release-tar      release 再打 tar.gz"
	@echo "  make clean            清理 bin、dist、web/dist、agent build"
	@echo "  make docker-build     构建 Docker 镜像 app-manager:$(VERSION)"
	@echo "  make docker-up        docker compose up -d --build"
	@echo ""
	@echo "交叉编译（输出到 $(BIN_DIR)/）："
	@echo "  make server-linux-amd64 | server-linux-arm64 | server-darwin-amd64 | server-darwin-arm64 | server-windows-amd64"
	@echo ""
	@echo "变量: VERSION=$(VERSION)  SERVER_BIN=$(SERVER_BIN)"

# ─── 依赖与前端 ───────────────────────────────────────────────────────────

deps-web:
	cd $(WEB) && $(NPM) ci

# 无 lockfile 环境可改用: cd web && npm install
web-build: deps-web
	cd $(WEB) && $(NPM) run build
	$(MAKE) scada-editor-build
	$(MAKE) form-app-build
	$(MAKE) docs-app-build

web: web-build

deps-scada-editor:
	cd $(SCADA_EDITOR) && $(NPM) ci

scada-editor-build: deps-scada-editor
	cd $(SCADA_EDITOR) && $(NPM) run build
	rm -rf $(WEB)/dist/scada-editor
	cp -R $(SCADA_EDITOR)/dist $(WEB)/dist/scada-editor

deps-form-app:
	cd $(FORM_APP) && $(NPM) ci --legacy-peer-deps

form-app-build: deps-form-app
	cd $(FORM_APP) && $(NPM) run build
	rm -rf $(WEB)/dist/form-app
	cp -R $(FORM_APP)/dist $(WEB)/dist/form-app

deps-docs-app:
	cd $(DOCS_APP) && $(NPM) install

docs-app-build: deps-docs-app
	cd $(DOCS_APP) && $(NPM) run build
	rm -rf $(WEB)/dist/docs-app
	cp -R $(DOCS_APP)/dist $(WEB)/dist/docs-app

# ─── Go 服务端 ─────────────────────────────────────────────────────────────

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

# 与 README 一致：从仓库根目录运行时加载 ./web/dist
server: web $(BIN_DIR)
	cd $(SERVER) && $(GO) build -trimpath -ldflags "-s -w" -o $(SERVER_BIN) .

server-only: $(BIN_DIR)
	cd $(SERVER) && $(GO) build -trimpath -ldflags "-s -w" -o $(SERVER_BIN) .

server-only-linux-amd64: $(BIN_DIR)
	cd $(SERVER) && GOOS=linux GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-linux-amd64 .

server-linux-amd64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=linux GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-linux-amd64 .

server-linux-arm64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=linux GOARCH=arm64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-linux-arm64 .

server-darwin-amd64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=darwin GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-darwin-amd64 .

server-darwin-arm64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=darwin GOARCH=arm64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-darwin-arm64 .

server-windows-amd64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=windows GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-windows-amd64.exe .

# ─── 本地 ADB Bridge ────────────────────────────────────────────────────────

bridge: $(BIN_DIR)
	cd $(BRIDGE) && $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/adb-bridge .

bridge-linux-amd64: $(BIN_DIR)
	cd $(BRIDGE) && GOOS=linux GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/adb-bridge-linux-amd64 .

bridge-linux-arm64: $(BIN_DIR)
	cd $(BRIDGE) && GOOS=linux GOARCH=arm64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/adb-bridge-linux-arm64 .

bridge-darwin-amd64: $(BIN_DIR)
	cd $(BRIDGE) && GOOS=darwin GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/adb-bridge-darwin-amd64 .

bridge-darwin-arm64: $(BIN_DIR)
	cd $(BRIDGE) && GOOS=darwin GOARCH=arm64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/adb-bridge-darwin-arm64 .

bridge-windows-amd64: $(BIN_DIR)
	cd $(BRIDGE) && GOOS=windows GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/adb-bridge-windows-amd64.exe .

bridge-all: bridge-linux-amd64 bridge-linux-arm64 bridge-darwin-amd64 bridge-darwin-arm64 bridge-windows-amd64

# ─── Android Agent ─────────────────────────────────────────────────────────

agent agent-debug:
	cd $(AGENT) && $(GRADLEW) :app:assembleDebug --no-daemon

# 仅构建 release APK（不自动 bump 版本，供调试用）
agent-release-build:
	cd $(AGENT) && $(GRADLEW) :app:assembleRelease --no-daemon

# 检查 git 提交，必要时升级 agent 版本号，再构建 release APK
agent-release:
	@$(ROOT)/scripts/bump-agent-version.sh; \
	  STATUS=$$?; \
	  if [ $$STATUS -ne 0 ] && [ $$STATUS -ne 2 ]; then exit $$STATUS; fi
	cd $(AGENT) && $(GRADLEW) :app:assembleRelease --no-daemon

# 独立目标：仅执行版本号检查与升级（不构建）
# 支持参数：make bump-agent-version AGENT_VERSION=2.1.0 AGENT_CODE=42
bump-agent-version:
	@$(ROOT)/scripts/bump-agent-version.sh \
	  $(if $(AGENT_VERSION),--version $(AGENT_VERSION)) \
	  $(if $(AGENT_CODE),--code $(AGENT_CODE)) \
	  $(if $(FORCE),--force)

install-agent:
	cd $(AGENT) && $(GRADLEW) :app:installDebug --no-daemon

# ─── 聚合 ─────────────────────────────────────────────────────────────────

all: web server

# ─── 发布目录与归档 ─────────────────────────────────────────────────────────

# 生成 Linux 发布包
release-linux: web server-linux-amd64 agent-release
	@rm -rf $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/web/dist
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/server
	cp $(BIN_DIR)/app-manager-linux-amd64 $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager
	cp -R $(WEB)/dist/. $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/web/dist/
	cp $(SERVER)/config.sqlite.yaml $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/server/ 2>/dev/null || true
	cp $(SERVER)/config.example.yaml $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/server/ 2>/dev/null || true
	cp $(AGENT)/app/build/outputs/apk/release/app-release.apk \
		$(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/agent-app.apk
	@echo '#!/bin/sh' > $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/start.sh
	@echo 'cd "$$(dirname "$$0")" && exec ./app-manager server/config.sqlite.yaml "$$@"' \
		>> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/start.sh
	chmod +x $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/start.sh
	@echo '[Unit]' > $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'Description=App Manager Service' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'After=network.target' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo '' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo '[Service]' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'Type=simple' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'WorkingDirectory=/opt/app-manager' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'ExecStart=/opt/app-manager/app-manager server/config.sqlite.yaml' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'Restart=always' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'User=root' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'StandardOutput=journal' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'StandardError=journal' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'SyslogIdentifier=app-manager' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo '' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo '[Install]' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo 'WantedBy=multi-user.target' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/app-manager.service
	@echo '#!/bin/sh' > $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	@echo 'cp app-manager.service /etc/systemd/system/' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	@echo 'systemctl daemon-reload' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	@echo 'systemctl enable app-manager' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	@echo 'systemctl start app-manager' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	@echo 'echo "Service installed and started. Following logs (Ctrl+C to exit):"' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	@echo 'journalctl -fu app-manager --lines=50' >> $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	chmod +x $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/install-service.sh
	@echo "已生成: $(RELEASE_DIR)/app-manager-$(VERSION)-linux-amd64/"

# 生成 macOS 发布包
release-darwin: web server-darwin-arm64 agent-release
	@rm -rf $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/web/dist
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/server
	cp $(BIN_DIR)/app-manager-darwin-arm64 $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/app-manager
	cp -R $(WEB)/dist/. $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/web/dist/
	cp $(SERVER)/config.sqlite.yaml $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/server/ 2>/dev/null || true
	cp $(SERVER)/config.example.yaml $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/server/ 2>/dev/null || true
	cp $(AGENT)/app/build/outputs/apk/release/app-release.apk \
		$(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/agent-app.apk
	@echo '#!/bin/sh' > $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/start.sh
	@echo 'cd "$$(dirname "$$0")" && exec ./app-manager server/config.sqlite.yaml "$$@"' \
		>> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/start.sh
	chmod +x $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/start.sh
	@echo '<?xml version="1.0" encoding="UTF-8"?>' > $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<plist version="1.0"><dict>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<key>Label</key><string>com.appmanager</string>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<key>ProgramArguments</key><array>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<string>/usr/local/app-manager/app-manager</string>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<string>server/config.sqlite.yaml</string>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '</array>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<key>WorkingDirectory</key><string>/usr/local/app-manager</string>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<key>RunAtLoad</key><true/>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '<key>KeepAlive</key><true/>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '</dict></plist>' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/com.appmanager.plist
	@echo '#!/bin/sh' > $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/install-service.sh
	@echo 'cp com.appmanager.plist ~/Library/LaunchAgents/' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/install-service.sh
	@echo 'launchctl load ~/Library/LaunchAgents/com.appmanager.plist' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/install-service.sh
	@echo 'echo "Service installed and started"' >> $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/install-service.sh
	chmod +x $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/install-service.sh
	@echo "已生成: $(RELEASE_DIR)/app-manager-$(VERSION)-darwin-arm64/"

# 生成 Windows 发布包
release-windows: web server-windows-amd64 agent-release
	@rm -rf $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/web/dist
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/server
	cp $(BIN_DIR)/app-manager-windows-amd64.exe $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/app-manager.exe
	cp -R $(WEB)/dist/. $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/web/dist/
	cp $(SERVER)/config.sqlite.yaml $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/server/ 2>/dev/null || true
	cp $(SERVER)/config.example.yaml $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/server/ 2>/dev/null || true
	cp $(AGENT)/app/build/outputs/apk/release/app-release.apk \
		$(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/agent-app.apk
	@echo '@echo off' > $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/start.bat
	@echo 'cd /d "%~dp0"' >> $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/start.bat
	@echo 'app-manager.exe server\config.sqlite.yaml' >> $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/start.bat
	@echo '@echo off' > $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/install-service.bat
	@echo 'sc create AppManager binPath= "%~dp0app-manager.exe server\config.sqlite.yaml" start= auto' >> $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/install-service.bat
	@echo 'sc start AppManager' >> $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/install-service.bat
	@echo 'echo Service installed and started' >> $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/install-service.bat
	@echo "已生成: $(RELEASE_DIR)/app-manager-$(VERSION)-windows-amd64/"

# 生成所有平台发布包
release-all: release-linux release-darwin release-windows
	@echo "所有平台发布包已生成"

# 默认 release 目标（Linux）
release: release-linux

release-zip: release
	cd $(RELEASE_DIR) && zip -r -q app-manager-$(VERSION).zip app-manager-$(VERSION)
	@echo "$(RELEASE_DIR)/app-manager-$(VERSION).zip"

release-tar: release
	cd $(RELEASE_DIR) && tar czvf app-manager-$(VERSION).tar.gz app-manager-$(VERSION)
	@echo "$(RELEASE_DIR)/app-manager-$(VERSION).tar.gz"

# ─── 部署到 pbc40（192.168.102.40:88）─────────────────────────────────────
#
# 前提：ssh pbc40 免密可用（~/.ssh/config 配置 Host pbc40 → 192.168.102.40）
#       pbc40 已创建 /opt/app-manager 目录且 app-manager.service 已安装
#
# 常用命令：
#   make deploy-pbc40          完整构建（server + web + agent）并部署，部署后自动重启服务
#   make deploy-pbc40-quick    跳过重新构建，直接同步已有产物（用于仅改了配置/前端）
#   make deploy-pbc40-server   仅重新编译 server 并同步（不重建前端）
#   make deploy-pbc40-web      仅重新构建前端并同步（不重新编译 server）
#   make deploy-pbc40-agent    仅构建并上传 APK
#   make deploy-pbc40-restart  仅在远程重启服务（不传文件）

# ─── pbc40 service 文件安装（内部目标）────────────────────────────────────────
# 生成 pbc40 专用 service 文件（日志输出到 /var/log/app-manager.log）并上传安装
PBC40_LOG := /var/log/app-manager.log

pbc40-install-service:
	printf '[Unit]\nDescription=App Manager Service\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=$(PBC40_DIR)\nExecStart=$(PBC40_DIR)/app-manager $(PBC40_DIR)/$(PBC40_CONFIG)\nRestart=always\nUser=root\nStandardOutput=append:$(PBC40_LOG)\nStandardError=append:$(PBC40_LOG)\n\n[Install]\nWantedBy=multi-user.target\n' > /tmp/app-manager-pbc40.service
	rsync -avz /tmp/app-manager-pbc40.service $(PBC40_HOST):/etc/systemd/system/$(PBC40_SERVICE).service
	ssh $(PBC40_HOST) "systemctl daemon-reload && systemctl enable $(PBC40_SERVICE)"

# 完整构建 + 部署（server + 全部前端 + APK）
deploy-pbc40: web server-linux-amd64 agent-release-build pbc40-install-service
	@echo ">>> 同步到 $(PBC40_HOST):$(PBC40_DIR) ..."
	ssh $(PBC40_HOST) "mkdir -p $(PBC40_DIR)/server $(PBC40_DIR)/data $(PBC40_DIR)/uploads"
	rsync -avz --progress $(BIN_DIR)/app-manager-linux-amd64 $(PBC40_HOST):$(PBC40_DIR)/app-manager
	rsync -avz --delete --progress $(WEB)/dist/ $(PBC40_HOST):$(PBC40_DIR)/web/dist/
	rsync -avz --progress \
		$(AGENT)/app/build/outputs/apk/release/app-release.apk \
		$(PBC40_HOST):$(PBC40_DIR)/agent-app.apk 2>/dev/null || \
		echo "[WARN] APK 未找到，跳过上传"
	ssh $(PBC40_HOST) "chmod +x $(PBC40_DIR)/app-manager && service $(PBC40_SERVICE) restart"
	@echo ">>> 部署完成，访问地址：http://192.168.102.40:88"
	@echo ">>> 跟踪后端日志（Ctrl+C 退出）..."
	ssh -t $(PBC40_HOST) "tail -f $(PBC40_LOG)"

# 跳过重建，直接同步已有产物（快速更新）
deploy-pbc40-quick: pbc40-install-service
	@echo ">>> 快速同步到 $(PBC40_HOST):$(PBC40_DIR) （不重新构建）..."
	ssh $(PBC40_HOST) "mkdir -p $(PBC40_DIR)/server $(PBC40_DIR)/data $(PBC40_DIR)/uploads"
	@[ -f $(BIN_DIR)/app-manager-linux-amd64 ] && \
		rsync -avz --progress $(BIN_DIR)/app-manager-linux-amd64 $(PBC40_HOST):$(PBC40_DIR)/app-manager || \
		echo "[SKIP] server 二进制不存在，跳过"
	@[ -d $(WEB)/dist ] && \
		rsync -avz --delete --progress $(WEB)/dist/ $(PBC40_HOST):$(PBC40_DIR)/web/dist/ || \
		echo "[SKIP] web/dist 不存在，跳过前端同步"
	ssh $(PBC40_HOST) "chmod +x $(PBC40_DIR)/app-manager 2>/dev/null; service $(PBC40_SERVICE) restart"
	@echo ">>> 快速部署完成，访问地址：http://192.168.102.40:88"
	@echo ">>> 跟踪后端日志（Ctrl+C 退出）..."
	ssh -t $(PBC40_HOST) "tail -f $(PBC40_LOG)"

# 仅重新编译 server 并部署（不重建前端）
deploy-pbc40-server: server-only-linux-amd64
	rsync -avz --progress $(BIN_DIR)/app-manager-linux-amd64 $(PBC40_HOST):$(PBC40_DIR)/app-manager
	ssh $(PBC40_HOST) "chmod +x $(PBC40_DIR)/app-manager && service $(PBC40_SERVICE) restart"
	@echo ">>> Server 部署完成，访问地址：http://192.168.102.40:88"
	@echo ">>> 跟踪后端日志（Ctrl+C 退出）..."
	ssh -t $(PBC40_HOST) "tail -f $(PBC40_LOG)"

# 仅重新构建前端并部署
deploy-pbc40-web: web
	rsync -avz --delete --progress $(WEB)/dist/ $(PBC40_HOST):$(PBC40_DIR)/web/dist/
	@echo ">>> 前端部署完成（web + scada-editor + form-app）"

# 仅构建并上传 APK
deploy-pbc40-agent: agent-release-build
	rsync -avz --progress \
		$(AGENT)/app/build/outputs/apk/release/app-release.apk \
		$(PBC40_HOST):$(PBC40_DIR)/agent-app.apk
	@echo ">>> APK 上传完成：$(PBC40_DIR)/agent-app.apk"

# 仅重启远程服务（不传文件）
deploy-pbc40-restart:
	ssh $(PBC40_HOST) "systemctl restart $(PBC40_SERVICE) && echo '服务已重启'"
	@echo ">>> 访问地址：http://192.168.102.40:88"
	@echo ">>> 跟踪后端日志（Ctrl+C 退出）..."
	ssh -t $(PBC40_HOST) "tail -f $(PBC40_LOG)"

# ─── Docker ─────────────────────────────────────────────────────────────────

docker-build:
	docker build -t app-manager:$(VERSION) .

docker-up:
	docker compose up -d --build

# ─── 清理与检查 ───────────────────────────────────────────────────────────

clean:
	rm -rf $(BIN_DIR) $(DIST_DIR)
	rm -rf $(WEB)/dist
	cd $(AGENT) && $(GRADLEW) clean --no-daemon || true

fmt:
	cd $(SERVER) && $(GO) fmt ./...

test:
	cd $(SERVER) && $(GO) test ./...

schema-check:
	cd $(SERVER) && $(GO) test ./tests -run TestSchemaReconcile -count=1 -p 1

check: fmt test schema-check
	cd $(SERVER) && $(GO) vet ./...
