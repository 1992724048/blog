---
title: Core Ultra 9 285K 的 iGPU 能打过 CPU 吗？——SYCL 五内存模式实测
date: 2026-09-23
tags: [C++, SYCL, 性能测试, GPU]
categories: [性能测试]
---

## 结论先行

同一套算法（两侧逐语句一致的实现），在 Intel Core Ultra 9 285K 的 CPU（串行 + 24 线程 TBB）与核显（SYCL 五种内存分配模式）上各跑一遍，结果**胜负分化非常明显**，不存在"谁全面碾压谁"：

| 测试项 | CPU tbb_24 | GPU 最佳值 | 胜者 | 倍率 |
| --- | --- | --- | --- | --- |
| GEMM 算力 | 355.4 GFLOP/s | 160.9 GFLOP/s | CPU | 2.2× |
| 压缩吞吐 | 11169.4 MB/s | 448.8 MB/s | CPU | 24.9× |
| 读带宽 | 66.6 GB/s | 61.0 GB/s | CPU | 1.1× |
| FFT 吞吐 | 43.1 MSamples/s | 145.4 MSamples/s | GPU | 3.4× |
| 查询吞吐 | 122.7 Mqueries/s | 444.8 Mqueries/s | GPU | 3.6× |
| 写带宽 | 54.0 GB/s | 87.6 GB/s | GPU | 1.6× |
| 拷贝带宽 | 78.1 GB/s | 77.8 GB/s | 平手 | ≈1.0× |

一句话规律：**规则的数据并行（FFT、批量查找、流式写入）GPU 赢；分支密集 / 串行依赖重（压缩哈希表）与高并行算力密集（分块 GEMM）CPU 赢**。另外 iGPU 没有独立显存、与 CPU 共享 DDR5，主机↔设备传输是绕不开的额外开销（256 MiB 上传约 16.5 ms）。

## 测试平台与方法

| 项目 | 配置 |
| --- | --- |
| CPU | Intel Core Ultra 9 285K，D2D / NGU 3200 MHz |
| 内存 | DDR5-6400 CL32 48 GB × 2 |
| iGPU | Arrow Lake-S 核显（Xe 架构，oneAPI 设备名 `Intel(R) Graphics`），共享系统内存 |
| 编程模型 | SYCL 2020（Intel oneAPI DPC++ Compiler 2026.1） |
| CPU 侧并行 | oneTBB 2023.1，24 线程（`tbb_24`）；另含串行基线（`serial`） |
| 构建 | Visual Studio 2026，两侧均 Release |

**测试设计的几个关键点：**

- **两侧算法同源**：zip / FFT 为逐语句镜像实现，数据生成确定性同源，每项内置 PASS/FAIL 校验（zip 解压回读逐字节比对、FFT/GEMM 与 CPU 参考对照、lookup 校验和跨程序一致），保证结果可跨程序对照。
- **GPU 五种内存模式**：`malloc_device` / `malloc_host` / `malloc_shared` / `usm_allocator`（`sycl::usm_allocator` + `std::vector`）/ `buffer`（纯 buffer + accessor），每种模式独立实现、独立计时。
- **计时口径**：两侧统一 `std::chrono::steady_clock` 主机端计时（提交 → 等待完成取时间差），队列不开 profiling；每项 warmup 1 次 + 重复 3 次**取最优值**。
- **全量规模**（非 quick 冒烟档）：zip 128 MiB / 2048 块、FFT n = 4,194,304（2²²）复数点、GEMM n = 4096、lookup 1,048,576 次查询、带宽数组 256 MiB、指针追逐 4,194,304 步。

## 五项核心对比

### 1. 内存带宽：写入 GPU 强，读取 CPU 略胜，拷贝平手

**Workload**：256 MiB 数组的 read / write / copy 顺序访问，`GB/s = 字节数 / 时间`（copy 为 2×字节数）。

| 来源 | 读取 (GB/s) | 写入 (GB/s) | 拷贝 (GB/s) |
| --- | --- | --- | --- |
| CPU serial | 7.6 | 18.1 | 47.3 |
| CPU tbb_24 | **66.6** | 54.0 | **78.1** |
| GPU malloc_device | 61.0 | **87.6** | 76.1 |
| GPU malloc_host | 56.2 | 64.1 | 75.8 |
| GPU malloc_shared | 55.7 | 64.0 | 75.3 |
| GPU usm_allocator | 53.9 | 61.5 | 71.1 |
| GPU buffer | 56.5 | 64.0 | 77.8 |

解读：拷贝带宽双方挤在 71–78 GB/s——**iGPU 与 CPU 共享同一条 DDR5**，物理上限本来就是同一个。GPU 写入 87.6 GB/s 明显高于 CPU 的 54.0（GPU 对顺序填充的并发度更高），读取则 tbb_24 以 66.6 略胜 GPU 最佳的 61.0。串行 CPU 的读取（7.6）与写入（18.1）远低于并行版，说明这类带宽测试对线程数极为敏感。

### 2. GEMM 矩阵乘：CPU 大胜

**Workload**：分块矩阵乘，n = 4096，算力口径 `2·n³ / t`；TBB 按行块并行。

| 来源 | GEMM 算力 (GFLOP/s) |
| --- | --- |
| CPU serial | 23.3 |
| CPU tbb_24 | **355.4** |
| GPU malloc_device | 160.9 |
| GPU malloc_shared | 157.1 |
| GPU usm_allocator | 157.0 |
| GPU buffer | 156.9 |
| GPU malloc_host | 156.2 |

tbb_24 打出 355.4 GFLOP/s，是 GPU 最佳值（160.9）的 **2.2 倍**。24 个高频核心 + AVX2 分块内核的效率，明显高于这块核显的 SYCL 实现。GPU 五种内存模式彼此差距不到 3%——**算力瓶颈不在分配方式上**。

### 3. FFT：GPU 完胜

**Workload**：radix-2 就地 FFT，n = 4,194,304 复数点，算力口径 `5·n·log2(n)`；GPU 侧 22 个蝶形 pass + 1 个 bit-reversal 共 23 次内核提交。

| 来源 | FFT 吞吐 (MSamples/s) | FFT 算力 (GFLOP/s) |
| --- | --- | --- |
| CPU serial | 19.0 | 2.1 |
| CPU tbb_24 | 43.1 | 4.7 |
| GPU malloc_device | **145.4** | **16.0** |
| GPU malloc_shared | 140.1 | 15.4 |
| GPU usm_allocator | 139.8 | 15.4 |
| GPU malloc_host | 139.7 | 15.4 |
| GPU buffer | 125.3 | 13.8 |

GPU 最佳是 tbb_24 的 **3.4 倍**。FFT 每个蝶形运算独立、访存模式规则，正是 GPU 的教科书场景。`buffer` 模式在这里掉了约 14%（125.3 vs 145.4），是五模式中差距最大的一项。

### 4. 批量二分查找：GPU 完胜

**Workload**：1,048,576 个查询在有序数组上二分查找（命中 524,862 次），每工作项一个查询；两侧校验和一致。

| 来源 | 查询吞吐 (Mqueries/s) |
| --- | --- |
| CPU serial | 8.8 |
| CPU tbb_24 | 122.7 |
| GPU malloc_device | **444.8** |
| GPU malloc_host | 433.7 |
| GPU malloc_shared | 433.7 |
| GPU usm_allocator | 433.1 |
| GPU buffer | 427.5 |

GPU 最佳是 tbb_24 的 **3.6 倍**、是串行的 50 倍。百万级查询彼此独立，GPU 用海量线程把分支预测失败与串行开销完全摊掉。这也是五模式差距最小的一项（最差与最佳仅差 4%）。

### 5. 块压缩（zip）：CPU 碾压

**Workload**：128 MiB 输入 / 2048 块的块压缩（哈希表匹配），仅压缩计时（含哈希表清零），解压回读逐字节校验；两侧压缩比同为 1.30。

| 来源 | 压缩吞吐 (MB/s) |
| --- | --- |
| CPU serial | 533.8 |
| CPU tbb_24 | **11169.4** |
| GPU buffer | 448.8 |
| GPU malloc_device | 446.9 |
| GPU malloc_host | 443.8 |
| GPU malloc_shared | 443.3 |
| GPU usm_allocator | 442.0 |

这是全场最悬殊的一项：tbb_24 是 GPU 的 **24.9 倍**，甚至**串行 CPU（533.8）都快过所有 GPU 模式（≈447）**。哈希表构建充满随机写与分支，块间虽可并行但块内访存极不规则——iGPU 的 Xe 核在这种 workload 上完全发挥不出来，而 24 个 CPU 核心处理分支密集代码的效率高得多。

## 深挖细节

### GPU 五种内存模式差异很小，`malloc_device` 全面最佳

把五模式在各测试项的排名拉通看：**`malloc_device` 几乎全面第一**——读/写带宽、FFT、GEMM、lookup、延迟均为五模式最佳。仅两项例外：拷贝带宽与 zip 压缩由 `buffer` 以不到 3% 的微弱优势领先（77.8 vs 76.1 GB/s、448.8 vs 446.9 MB/s），而 `buffer` 在 FFT、lookup、延迟上又均居末位。总体差距普遍在 3–14% 以内——**选型上可以放心用 `malloc_device`（USM device 指针），不必为模式选择过度纠结**；真正决定性能的是 workload 本身。

### 延迟：CPU 单线程延迟低得多，GPU 靠聚合吞吐翻盘

指针追逐（4,194,304 步依赖访问，每次访问必须等上一次完成）：

| 视角 | CPU | GPU（malloc_device 最佳） |
| --- | --- | --- |
| 单追逐者延迟 | **91.5 ns/access**（serial） | 330.4 ns/access |
| 并行聚合吞吐 | 144.2 Maccess/s（24 追逐者） | **417.6 Maccess/s**（256 追逐者） |
| 并行摊薄每访问 | 6.9 ns | 2.4 ns |

两个要点：

1. **依赖链延迟上 CPU 单线程就是快 3.6 倍**（91.5 vs 330.4 ns）——核显核心的依赖访问代价远高于 CPU 核。
2. GPU 用 256 个并行追逐者把聚合吞吐做到 417.6 Maccess/s，是 CPU 24 线程的 2.9 倍。表中"2.4 ns"是**吞吐摊薄值（1/吞吐）不是真实延迟**——并行度把等待藏起来了，单条依赖链的代价依然在那里。这解释了为什么 GPU 赢 FFT/lookup（吞吐型）却输 zip（依赖+分支型）。

### 主机↔设备传输：256 MiB 约 16.5 ms

| 方向 | 耗时 | 等效带宽 |
| --- | --- | --- |
| H2D 上传 256 MiB | 16.54 ms | 16.2 GB/s |
| D2H 回读 256 MiB | 16.39 ms | 16.4 GB/s |

虽然 iGPU 共享 DDR5、拷贝带宽账面上与 CPU 持平，但 SYCL 的 `malloc_device` 路径下**数据进出"设备"仍要走这笔显式拷贝**（read/write 指标不含它）。对一次性小任务，这 16 ms 级固定开销足以吃掉 GPU 的算力优势；`malloc_shared` / `usm_allocator` 免显式拷贝，代价是各项带宽略低（差距同样在 5% 内）。

### CPU 拷贝阶梯：小尺寸靠缓存，大尺寸回落 DRAM

CPU 侧四档拷贝带宽（`copy = 2×字节数 / 时间`）：

| 档位 | serial (GB/s) | tbb_24 (GB/s) |
| --- | --- | --- |
| 32 KiB | 218.5 | 131.1 |
| 512 KiB | 163.8 | 59.6 |
| 8192 KiB | 31.1 | 224.0 |
| 262144 KiB | 47.1 | 79.1 |

小尺寸完全命中缓存时能冲到 200+ GB/s；256 MiB 落回 DRAM 后就是 47–79 GB/s，与前面的全尺寸带宽一致。tbb 在 32 KiB/512 KiB 反而不如串行（线程分发开销 > 并行收益），8 MiB 档并行收益最大（224.0）。**带宽数字不标注尺寸就是耍流氓**——同一程序不同档位能差 7 倍。

## 结论与选型建议

**在这台 285K 上，iGPU 不是"小显卡"，而是一个"另一套脾气的协处理器"：**

1. **吞吐型规则并行优先丢给 GPU**——FFT（3.4×）、批量查找（3.6×）、顺序大块写入（1.6×）是它的主场；聚合访存吞吐也能到 CPU 24 线程的近 3 倍。
2. **分支密集 / 依赖链重的活留在 CPU**——压缩（24.9×，串行都赢）、依赖型延迟（快 3.6 倍）是它的绝对领域；分块 GEMM 这类 SIMD 友好算力也以 2.2× 领先核显。
3. **五种 SYCL 内存模式不是性能旋钮**——差异 3–14%，`malloc_device` 几乎全面最佳（仅拷贝带宽与 zip 由 `buffer` 微弱领先）；按编程便利性选即可。
4. **算上传输再做决定**——H2D/D2H 每 256 MiB 约 16.5 ms（≈16.3 GB/s），数据已在设备侧的长驻任务才划得来；频繁与主机来回倒数据的短任务，CPU 更省心。
5. **共享内存是 iGPU 的结构现实**——拷贝带宽与 CPU 打平（≈78 GB/s）说明"显存带宽"这个独立维度在这里不存在，GPU 赢的从来不是带宽，是**并发结构**。

## 测试局限

- 单机、单次运行，数值为 warmup 后 3 次重复**取最优值**，非多次统计均值，绝对值有波动空间；结论看相对量级。
- CPU 侧 FFT 计时含 2n 个 float 输入拷贝，GPU 侧为就地 23 次提交不含同等拷贝——该项 CPU 处于轻微不利口径（量级结论不受影响）。
- `buffer` 模式的隐式 H2D/D2H 由运行时管理、不计入指标；`malloc_device` 的 H2D/D2H 单列（上文传输小节）。
- 仅测本机 Intel 核显：工具不支持 dGPU 与 AMD iGPU，结论不可外推到独显或其他厂商核显。
- CPU 并行固定 24 线程（`tbb_24`）；不同线程数、不同 BIOS 功耗墙下数值会变化。

## 附：复现方式

```text
./run_bench.cmd dpcpp                    # iGPU（SYCL）侧
./run_bench.cmd cpu --threads 24         # CPU 侧
python ./tools/bench_to_labplot.py       # 汇总为宽表 CSV + LabPlot 工程
```

测试工程要求：Intel 6 代及以后带核显的酷睿 CPU、支持 AVX2；不含 dGPU / AMD iGPU 支持。
