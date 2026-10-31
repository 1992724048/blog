---
title: ReSharper 破解教程及 JetBrains 全家桶激活教程
date: 2026-10-27
tags: [工具, 开发, 教程]
categories: [环境搭建]
description: 使用Patch工具与Docker对JetBrains全家桶和ReSharper进行无限期使用破解
---

[#]>AI|
[state]| NOAI

## 补丁工具

仓库一:
<https://github.com/1992724048/JetBrainsShellPatch>
仓库二:
<https://github.com/opklnm004/jetbrains-license-server>

1. 将两个仓库下载并解压，第一个仓库还需要单独下载 `Release` 中的 `JetBrainsShellPatch.exe`
2. 将第一个仓库中下载的 `product.json` 放入第二个仓库的 `src\main\resources\external\data` 目录并替换里面的文件
3. 安装Docker，在第二个仓库目录中使用 `docker-compose up -d` 启动容器（可能需要科学上网）
4. 打开默认网址 `http://localhost:10768/#home`(端口号按实际端口填写) 后输入自己想要的名称（建议两个都填一样）
5. 管理员运行 `JetBrainsShellPatch.exe` 等待工具完成补丁操作直至出现 `Summary` 输出且 `FAILED` 无计数
6. 将第一个仓库中的 `append_vmoptions.py` 放入第二个仓库目录， 并以管理员权限运行终端，使用python执行 `append_vmoptions.py` 脚本

## 激活方式

### 使用激活码

> [!WARNING]
> 该方法会和 Rider、dotCover 等其他IDE冲突且无法激活 ReSharperSQL，如果你在使用 ReSharper 之外的其他 JetBrains 产品，请不要使用该方法!!!

1. 点击上方产品按钮后选择 `All Jetbrains's Product Or Plugin` 产品，点击 `生成激活码`
2. 到期时间填写为 `9999/12/31` 并发用户数填为 `1000`，然后点击生成激活码并复制
3. 打开装有 ReSharper 的 Visual Studio
4. 点击 `扩展` -> `ReSharper` -> `帮助` -> `许可证信息`，只保留 `使用许可证密钥` 勾选
5. 点击 `使用许可证密钥` 旁边的🔧按钮，在弹出对话框中输入刚刚生成的激活码，然后点击 `添加` 按钮
6. 关闭弹出对话框后即可完成激活
7. 其他 JetBrains 产品在许可证管理页面选择 `激活码` 并输入刚刚生成的激活码，点击 `激活` 即可完成激活

### 使用许可证服务器 (推荐)

1. 打开装有 ReSharper 的 Visual Studio
2. 点击 `扩展` -> `ReSharper` -> `帮助` -> `许可证信息`，只保留 `使用许可证服务器` 勾选
3. 点击 `使用许可证服务器` 旁边的🔧按钮，在弹出对话框中输入 `http://localhost:10768` (端口号按实际端口填写)，勾选下放所有产品后点击 `添加` 按钮
4. 关闭弹出对话框后即可完成激活
5. 其他 JetBrains 产品在许可证管理页面选择 `许可证服务器` 并输入 `http://localhost:10768` (端口号按实际端口填写)，点击 `激活` 即可完成激活
