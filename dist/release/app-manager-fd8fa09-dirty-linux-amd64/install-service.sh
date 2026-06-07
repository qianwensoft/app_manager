#!/bin/sh
cp app-manager.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable app-manager
systemctl start app-manager
echo "Service installed and started"
