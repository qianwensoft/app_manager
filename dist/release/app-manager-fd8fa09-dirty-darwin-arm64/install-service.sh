#!/bin/sh
cp com.appmanager.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.appmanager.plist
echo "Service installed and started"
