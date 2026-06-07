#!/bin/sh
cd "$(dirname "$0")" && exec ./app-manager server/config.sqlite.yaml "$@"
