---
title: 修复 ImDisk 内存盘ACL权限问题以及作为 Temp 目录导致应用开机启动失效
date: 2026-11-2
tags: [工具, 教程]
categories: [环境搭建]
description: 每次启动设备都会发现随机几个应用和服务没有开机自启动，本文介绍了使用ImDisk场景下该问题的修复方法
---

[#]>AI|
[state]| NOAI

## 事件起因

起因是笔者每次启动设备都会发现随机几个应用和服务没有开机自启动，经过排查是将 `Temp` 目录设置到内存盘中则会触发该问题，以及ICX编译器报错：无法创建临时文件

## 解决方法

因 ImDisk 导致的启动项失效的解决方法非常简单，使用 <kbd>Win</kbd>+<kbd>X</kbd> 选择 `终端(管理员)` 后运行以下命令:

``` bat
sc.exe config ImDiskRD group= "PlugPlay"
```

ACL 权限问题可以使用子目录解决，如设置Temp目录为 `盘符:/Tmep/tmp/`，或者设置计划任务定时执行（推荐设置为每整点运行一次）以下命令:

``` bat
@echo off
if not exist 盘符:\ exit /b 0
if not exist "盘符:\Temp" mkdir "盘符:\Temp"
if not exist "盘符:\Temp\tmp" mkdir "盘符:\Temp\tmp"
icacls "盘符:\Temp" /setowner "%USERNAME%" >nul 2>&1
icacls "盘符:\Temp\tmp" /setowner "%USERNAME%" >nul 2>&1
exit /b 0
```

如果需要不弹出 cmd 窗口则需要创建一个 vbs 文件，复制以下内容:

``` vb
Set ws = CreateObject("WScript.Shell")
ws.Run """批处理文件路径""", 0, True
```

如果你还需要附带清理功能可以创建带有以下内容的 `bat` 文件

``` bat
@echo off
if not exist 盘符:\ exit /b
attrib -r -h -s 盘符:\* /s /d >nul 2>&1
del /f /s /q 盘符:\* >nul 2>&1
for /d %%d in (盘符:\*) do rd /s /q "%%d" >nul 2>&1
exit /b 0
```
