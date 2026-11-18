# 推广素材包

本文件用于统一不同渠道的文案，避免把推广写成夸大承诺。

## 一句话定位

**让 DeepSeek Harness 通过剪映官方授权链路，真正编辑剪映草稿。**

## GitHub 仓库简介

建议描述：

> DSH plugin for safe Jianying Pro editing: subtitles, audio, transitions, export, readback receipts, and one-command diagnostics.

建议 Topics：

```text
dsh
dsh-plugin
deepseek-harness
deepseek
jianying
jianying-pro
capcut
draftediting
video-editing
ai-video-editing
windows
```

## 30 秒演示脚本

1. 打开剪映，确认 Agent 面板已启动。
2. 在 DSH 中运行 `jianying_doctor`，展示 7 项检查。
3. 说：“读取最新草稿，先规划给 0-2 秒添加字幕，不要写入。”
4. 展示计划内容和目标草稿。
5. 说：“确认，执行，并在完成后回读和生成回执。”
6. 打开 JSON/Markdown 回执，展示前后哈希和操作列表。
7. 结尾：不直接改加密草稿，不暴露 token，失败不会伪装成成功。

## V2EX / 技术社区标题

- 做了个 DSH 剪映插件：让 Agent 安全编辑真实草稿
- 不是生成式剪辑：我让 DSH 通过剪映授权 DraftEditing host 编辑草稿
- 给 DSH 接上剪映：字幕、音频、转场和导出都能回读验证

## V2EX / 技术社区正文

```text
最近做了一个开源 DSH 插件 dsh-jianying-plugin。

它不是直接改 draft_content.json，也不是模拟预览，而是连接正在运行的剪映 Custom Agent host，通过 DraftEditing 执行真实操作。

目前支持：
- 字幕添加、更新、删除
- 音量、裁切、淡入淡出
- 转场添加、更新、删除
- 草稿导出
- 一键环境诊断
- 写入前备份、写入后回读、JSON/Markdown 回执

安全上采用两阶段写入：先 plan，再在用户确认后 apply。host token 不会返回给模型或写入日志。

项目：https://github.com/CN-PA/dsh-jianying-plugin
主页：https://cn-pa.github.io/dsh-jianying-plugin/

欢迎提交剪映版本兼容报告和真实编辑场景。如果它节省了你的时间，求一个 Star。
```

## 小红书 / 即刻短文案

```text
让 AI 真正操作剪映，而不是只给一段剪辑建议。

dsh-jianying-plugin 把 DSH 接进剪映授权 DraftEditing host：
字幕 / 音量 / 裁切 / 淡入淡出 / 转场 / 导出
写入前自动备份，写入后回读，并生成编辑回执。

两阶段确认，不直接碰加密草稿，不泄露 host token。
Windows + DSH Desktop 可用，MIT 开源。

GitHub 搜：dsh-jianying-plugin
```

## B 站视频简介

```text
这期演示我做的开源 DSH 剪映插件。

目标是让 Agent 编辑用户真实的剪映草稿，同时保留官方授权边界：先读取、再规划、用户确认、通过 DraftEditing 应用、最后回读并生成回执。

演示内容包括一键诊断、字幕计划、确认写入、回读和回执检查。

源码：https://github.com/CN-PA/dsh-jianying-plugin
```

## 英文 Launch post

Title:

```text
Show HN / Show DSH: editing Jianying Pro drafts through its authorized host
```

Body:

```text
I built dsh-jianying-plugin, an open-source Windows plugin for DeepSeek Harness.

It connects to Jianying Pro's local authorized Custom Agent host and uses the official DraftEditing path to perform bounded subtitle, audio, transition, and export operations.

The part I care about most is the safety model: plan first, require explicit confirmation, back up draft JSON, apply, canonical readback, then generate JSON/Markdown receipts. It never directly edits the encrypted draft file and never returns the host token.

Repo: https://github.com/CN-PA/dsh-jianying-plugin
Landing page: https://cn-pa.github.io/dsh-jianying-plugin/

Feedback on Jianying version compatibility and real editing workflows is welcome.
```

## 发布原则

- 不承诺“全自动完成任何剪辑”。
- 不把规划成功说成草稿已经写入。
- 不展示未经用户授权的草稿内容。
- 不公开 host token、账号信息或完整私人路径。
- 不向无关群组批量私信或刷屏。
- 每个渠道先回答安装、兼容性和安全边界，再引导到 GitHub。
