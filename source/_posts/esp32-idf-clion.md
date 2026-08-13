---
title: ESP32 IDF6.0 CLion环境配置
date: 2026-03-04
tags: [C, C++, 工具, 开发, 教程]
categories: [环境搭建]
---

## 一、环境准备

### 1.1 下载清单

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| CLion (自行安装) | 2025.3+ | [官网下载](https://www.jetbrains.com/clion/download/) |
| ESP-IDF | v6.0-beta2 | [官方GitHub](https://github.com/espressif/idf-im-ui/releases) |

### 1.2 安装 IDF6.0

1. 管理员运行下载好的文件
    
    ![2026-03-04_01-09-33.bmp](/images/esp32-idf-clion/2026-03-04_01-09-33.jpg)
    
    选择简易安装或者自定义安装等待安装完成
    

---

## 二、环境配置脚本

### 2.1 一键配置脚本

1. 创建 `espidf_source.bat` 在 `安装目录\v6.0-beta2\esp-idf` 中, 并填入以下内容:
    
    ```
    @echo off
    set "IDF_PATH=安装目录\v6.0-beta2\esp-idf"
    set "IDF_PYTHON_ENV_PATH=安装目录\tools\python\v6.0-beta2\venv"
    set "PATH=安装目录\tools\xtensa-esp-elf\esp-15.2.0_20251204\xtensa-esp-elf\bin;%PATH%"
    set "PATH=安装目录\tools\python\v6.0-beta2\venv\Scripts;%PATH%"
    @call 安装目录\tools\python\v6.0-beta2\venv\Scripts\activate.bat
    python tools\idf_tools.py install-python-env
    @call 安装目录\v6.0-beta2\esp-idf\export.bat
    ```
    

### 2.2 初始化环境

1. 在目录下执行 `espidf_source.bat`
2. 过程需要联网下载需要等待一段时间

---

## 三、CLion配置

### 3.1 配置工具链

1. 创建新的工具链并添加以下内容
    
    ![2026-03-04_01-13-43.bmp](/images/esp32-idf-clion/2026-03-04_01-13-43.jpg)
    

### 3.2 配置CMAKE

1. 设置工具链
    
    ![2026-03-04_01-17-25.bmp](/images/esp32-idf-clion/2026-03-04_01-17-25.jpg)
    
2. 设置环境变量
    
    ![2026-03-04_01-31-26.bmp](/images/esp32-idf-clion/2026-03-04_01-31-26.jpg)
    
3. 重新加载项目
    
    ![2026-03-04_01-20-24.bmp](/images/esp32-idf-clion/2026-03-04_01-20-24.jpg)
    
4. 等待完成后
    
    ![2026-03-04_01-21-37.bmp](/images/esp32-idf-clion/2026-03-04_01-21-37.jpg)
