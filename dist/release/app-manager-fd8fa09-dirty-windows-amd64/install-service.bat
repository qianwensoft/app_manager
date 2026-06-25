@echo off
sc create AppManager binPath= "%~dp0app-manager.exe serversc start AppManager
echo Service installed and started
