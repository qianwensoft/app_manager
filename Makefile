# App Manager — 构建与发布
# 在仓库根目录执行：make help

ROOT       := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
WEB        := $(ROOT)/web
SERVER     := $(ROOT)/server
AGENT      := $(ROOT)/agent
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

.PHONY: help all clean \
	deps-web web web-build \
	server server-only server-linux-amd64 server-linux-arm64 server-darwin-amd64 server-darwin-arm64 \
	agent agent-debug agent-release install-agent \
	release release-zip release-tar \
	check test fmt

help:
	@echo "App Manager — 常用目标"
	@echo ""
	@echo "  make all              构建 Web + Server 二进制（默认输出 $(SERVER_BIN)）"
	@echo "  make web              安装依赖并构建前端 → web/dist"
	@echo "  make server           先 web 再编译 Go 服务（需 web/dist 已存在）"
	@echo "  make server-only      仅编译 Go（不检查 web）"
	@echo "  make agent / agent-debug  编译 Agent 调试 APK"
	@echo "  make agent-release    编译 Agent release APK（需配置签名）"
	@echo "  make install-agent    assembleDebug 并 adb installDebug"
	@echo "  make release          组装发布目录（二进制 + web/dist + 配置示例 + debug APK）"
	@echo "  make release-zip      release 再打 zip"
	@echo "  make release-tar      release 再打 tar.gz"
	@echo "  make clean            清理 bin、dist、web/dist、agent build"
	@echo ""
	@echo "交叉编译（输出到 $(BIN_DIR)/）："
	@echo "  make server-linux-amd64 | server-linux-arm64 | server-darwin-amd64 | server-darwin-arm64"
	@echo ""
	@echo "变量: VERSION=$(VERSION)  SERVER_BIN=$(SERVER_BIN)"

# ─── 依赖与前端 ───────────────────────────────────────────────────────────

deps-web:
	cd $(WEB) && $(NPM) ci

# 无 lockfile 环境可改用: cd web && npm install
web-build: deps-web
	cd $(WEB) && $(NPM) run build

web: web-build

# ─── Go 服务端 ─────────────────────────────────────────────────────────────

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

# 与 README 一致：从仓库根目录运行时加载 ./web/dist
server: web $(BIN_DIR)
	cd $(SERVER) && $(GO) build -trimpath -ldflags "-s -w" -o $(SERVER_BIN) .

server-only: $(BIN_DIR)
	cd $(SERVER) && $(GO) build -trimpath -ldflags "-s -w" -o $(SERVER_BIN) .

server-linux-amd64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=linux GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-linux-amd64 .

server-linux-arm64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=linux GOARCH=arm64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-linux-arm64 .

server-darwin-amd64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=darwin GOARCH=amd64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-darwin-amd64 .

server-darwin-arm64: web $(BIN_DIR)
	cd $(SERVER) && GOOS=darwin GOARCH=arm64 $(GO) build -trimpath -ldflags "-s -w" -o $(BIN_DIR)/app-manager-darwin-arm64 .

# ─── Android Agent ─────────────────────────────────────────────────────────

agent agent-debug:
	cd $(AGENT) && $(GRADLEW) :app:assembleDebug --no-daemon

agent-release:
	cd $(AGENT) && $(GRADLEW) :app:assembleRelease --no-daemon

install-agent:
	cd $(AGENT) && $(GRADLEW) :app:installDebug --no-daemon

# ─── 聚合 ─────────────────────────────────────────────────────────────────

all: web server

# ─── 发布目录与归档 ─────────────────────────────────────────────────────────

# 生成 dist/release/app-manager-$(VERSION)/，便于整包拷贝到服务器
release: web server agent-debug
	@rm -rf $(RELEASE_DIR)/app-manager-$(VERSION)
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)/web/dist
	mkdir -p $(RELEASE_DIR)/app-manager-$(VERSION)/server
	cp $(SERVER_BIN) $(RELEASE_DIR)/app-manager-$(VERSION)/app-manager
	cp -R $(WEB)/dist/. $(RELEASE_DIR)/app-manager-$(VERSION)/web/dist/
	cp $(SERVER)/config.sqlite.yaml $(RELEASE_DIR)/app-manager-$(VERSION)/server/ 2>/dev/null || true
	cp $(SERVER)/config.example.yaml $(RELEASE_DIR)/app-manager-$(VERSION)/server/ 2>/dev/null || true
	cp $(AGENT)/app/build/outputs/apk/debug/app-debug.apk \
		$(RELEASE_DIR)/app-manager-$(VERSION)/agent-app-debug.apk
	@echo '#!/bin/sh' > $(RELEASE_DIR)/app-manager-$(VERSION)/start.sh
	@echo 'cd "$$(dirname "$$0")" && exec ./app-manager server/config.sqlite.yaml "$$@"' \
		>> $(RELEASE_DIR)/app-manager-$(VERSION)/start.sh
	chmod +x $(RELEASE_DIR)/app-manager-$(VERSION)/start.sh
	@echo "已生成: $(RELEASE_DIR)/app-manager-$(VERSION)/"
	@echo "部署: 将该目录上传到服务器，执行 ./start.sh（或 ./app-manager server/config.sqlite.yaml）"

release-zip: release
	cd $(RELEASE_DIR) && zip -r -q app-manager-$(VERSION).zip app-manager-$(VERSION)
	@echo "$(RELEASE_DIR)/app-manager-$(VERSION).zip"

release-tar: release
	cd $(RELEASE_DIR) && tar czvf app-manager-$(VERSION).tar.gz app-manager-$(VERSION)
	@echo "$(RELEASE_DIR)/app-manager-$(VERSION).tar.gz"

# ─── 清理与检查 ───────────────────────────────────────────────────────────

clean:
	rm -rf $(BIN_DIR) $(DIST_DIR)
	rm -rf $(WEB)/dist
	cd $(AGENT) && $(GRADLEW) clean --no-daemon || true

fmt:
	cd $(SERVER) && $(GO) fmt ./...

test:
	cd $(SERVER) && $(GO) test ./...

check: fmt test
	cd $(SERVER) && $(GO) vet ./...
