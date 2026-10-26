---
title: ReSharper 破解教程
date: 2026-10-27
tags: [工具, 开发, 教程]
categories: [环境搭建]
description: 使用Patch工具与Docker对JetBrains ReSharper进行无限期使用破解
---

[#]>AI|
[state]| NOAI

## 补丁工具

<https://github.com/1992724048/JetBrainsShellPatch>

1. 在第一个仓库的Release中下载编译好的补丁工具，双击运行 `JetBrainsShellPatch.exe` 等待工具完成补丁操作直至出现 `Summary` 输出且 `FAILED` 无计数
2. 下载仓库中的 `product.json` 供后续使用

## 生成激活码

<https://github.com/opklnm004/jetbrains-license-server>

1. 下载第二个仓库，并将第一个仓库中下载的 `product.json` 放入第二个仓库的 `src\main\resources\external\data` 目录并替换里面的文件
2. 安装Docker，并使用 `docker-compose up -d` 启动容器（可能需要科学上网）
3. 打开默认网址 `http://localhost:10768/#home` 后输入自己想要的名称（建议两个都填一样）
4. 点击上方产品按钮后选择 `All Jetbrains's Product Or Plugin` 产品，点击 `生成激活码`
5. 到期时间填写为 `9999/12/31` 并发用户数填为 `1000`，然后点击生成激活码并复制

## 使用激活码

1. 打开装有 ReSharper 的 Visual Studio
2. 点击 `扩展` -> `ReSharper` -> `帮助` -> `许可证信息`，只保留 `使用许可证密钥` 勾选
3. 点击 `使用许可证密钥` 旁边的🔧按钮，在弹出对话框中输入刚刚生成的激活码，然后点击 `添加` 按钮
4. 关闭弹出对话框后即可完成激活
