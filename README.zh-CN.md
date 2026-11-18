# dsh-jianying-plugin

`dsh-jianying-plugin` 是一个可安装到 DeepSeek Harness（DSH）插件模块中的剪映专业版插件。它通过剪映已经授权的 Custom Agent host 操作剪映，不直接修改加密的 `draft_content.json`。

当前版本：`0.2.0`

[English README](README.md)

## 已实现能力

- 发现剪映专业版安装目录、版本、草稿注册表和官方 CLI。
- 按草稿 ID、名称或路径列出和检查草稿。
- 连接剪映本机授权 host，并自动发现当前 Agent 实例和会话。
- 通过官方 `jianying-agent-cli.exe` 只读回读草稿。
- 创建受控编辑计划，并在确认后执行。
- 写入前把草稿 JSON 备份到 F 盘配置目录。
- 写入后采集草稿哈希、回读 canonical 状态并生成 JSON/Markdown 回执。
- 高级字幕操作：添加、更新、删除。
- 高级音频操作：音量、裁切、淡入淡出。
- 高级转场操作：添加、更新、删除。
- 草稿导出，并在目标文件已存在时默认拒绝覆盖。
- 在 DSH 插件模块中显示图标、标题、描述和中英文元数据。

## 工作方式

插件使用以下链路：

```text
DSH Tool
  -> 本机剪映 Custom Agent host
  -> Director / Editing Agent
  -> DraftQuery + DraftEditing
  -> canonical 草稿回读
  -> JSON/Markdown 编辑回执
```

host token 只由本机桥接脚本从剪映进程环境中读取，不会返回给模型、写入日志、写入回执或提交到仓库。

## 安装

### 从 GitHub Release 安装

1. 从仓库 Releases 下载 `dsh-jianying-plugin-0.2.0.tgz`。
2. 在 **DSH → 插件** 中选择本地安装。
3. 也可以使用命令行：

```powershell
dsh plugin --profile desktop add file:F:/Downloads/dsh-jianying-plugin-0.2.0.tgz
```

如果插件卡片没有立即出现，请重启 DSH。Web 或 TUI profile 请把 `desktop` 替换为实际 profile 名。

### 从 GitHub 仓库安装

```powershell
dsh plugin --profile desktop add github:<owner>/dsh-jianying-plugin
```

### 本地开发

建议把源码放在 F 盘：

```powershell
dsh plugin --profile desktop add 'link:F:/Projects/dsh-jianying-plugin'
```

## 使用前提

- Windows 10/11 x64。
- DSH Desktop。
- 剪映专业版已安装并至少启动或登录过一次。
- 剪映中的 Custom Agent host 可运行。
- 本机存在 `jianying-agent-cli.exe`。
- 建议至少打开一次剪映 Agent 面板，让插件能够发现实例和会话。

插件默认使用 `powershell.exe` 调用本机桥接脚本。macOS 和 Linux 不支持剪映 PC host。

## 工具

| 工具 | 用途 |
|---|---|
| `jianying_status` | 检查安装目录、版本、草稿注册表、CLI 和运行进程。 |
| `jianying_drafts` | `list`、`inspect`、`launch`。 |
| `jianying_cli` | 调用官方 Agent CLI 的 query、plan、validate 和安全 apply 流程。 |
| `jianying_host` | 检查授权 host、会话、草稿回读、run 状态和取消任务。 |
| `jianying_edit` | 通用高级操作：计划或应用。 |
| `jianying_subtitle` | 字幕添加、更新、删除。 |
| `jianying_audio` | 音量、裁切、淡入淡出。 |
| `jianying_transition` | 转场添加、更新、删除。 |
| `jianying_export` | 导出草稿。 |
| `jianying_receipt` | 列出或读取编辑回执。 |

## 两阶段写入

写入严格分为两个阶段：

1. `mode=plan`：校验参数，在剪映 host 中创建计划，不写入草稿。
2. `mode=apply`：必须同时设置 `confirm=true`，插件才确认计划、执行、回读并生成回执。

`allowHostApply` 默认为 `true`，但每一次写入仍然必须有 `confirm=true`。如果希望完全禁用写入，可把它改成 `false`。

如果剪映 host 在执行中请求新的运行期权限，插件默认不会自动批准。确认过整体写入后，可以传 `approve_permissions=true`，让插件批准本次 run 的权限请求。

## 高级操作

### 字幕

添加：

```json
{
  "kind": "subtitle.add",
  "text": "欢迎观看",
  "start_ms": 0,
  "duration_ms": 2000
}
```

更新：

```json
{
  "kind": "subtitle.update",
  "segment_id": "subtitle-segment-id",
  "text": "更新后的字幕"
}
```

删除：

```json
{
  "kind": "subtitle.remove",
  "segment_id": "subtitle-segment-id"
}
```

如果暂时不知道 `segment_id`，可以用 `start_ms`、`end_ms` 或 `match_text` 辅助定位。目标必须唯一，插件不会猜测。

### 音频

设置音量：

```json
{
  "kind": "audio.set_volume",
  "segment_id": "audio-segment-id",
  "volume": 65
}
```

`volume` 范围是 `0..1000`：

- `0`：静音。
- `100`：保持原始幅度。
- `1000`：两倍幅度。

裁切：

```json
{
  "kind": "audio.trim",
  "segment_id": "audio-segment-id",
  "start_ms": 1500,
  "duration_ms": 4000,
  "material_start_ms": 500,
  "speed": 1
}
```

淡入淡出：

```json
{
  "kind": "audio.fade",
  "segment_id": "audio-segment-id",
  "in_ms": 500,
  "out_ms": 1000
}
```

### 转场

添加：

```json
{
  "kind": "transition.add",
  "segment_id": "video-segment-id",
  "transition_name": "叠化",
  "duration_ms": 500
}
```

如果你已经从剪映授权资源链路取得真实引用，可以传 `transition_ref`。插件不会伪造资源引用，也不会把普通文件名当成资源引用。

更新或删除时，同样使用 `transition.update` 和 `transition.remove`，并通过片段 ID、时间或文本唯一定位。

### 导出

```json
{
  "kind": "export",
  "output_path": "F:/Exports/成片.mp4",
  "format": "mp4",
  "resolution": "1080p",
  "fps": 30,
  "overwrite": false
}
```

`output_path` 必须是绝对路径。目标文件已存在且 `overwrite=false` 时，插件会在创建 host 任务前拒绝。

## 计划与应用示例

先创建计划：

```json
{
  "draft_id": "DRAFT-ID",
  "mode": "plan",
  "operations": [
    {
      "kind": "subtitle.add",
      "text": "测试字幕",
      "start_ms": 0,
      "duration_ms": 1500
    }
  ]
}
```

确认计划内容后应用：

```json
{
  "draft_id": "DRAFT-ID",
  "mode": "apply",
  "confirm": true,
  "approve_permissions": false,
  "operations": [
    {
      "kind": "subtitle.add",
      "text": "测试字幕",
      "start_ms": 0,
      "duration_ms": 1500
    }
  ]
}
```

## 编辑回执

默认目录：

```text
F:/Codex/.dsh-jianying-plugin/receipts/
```

每次 apply 会生成：

- `<receipt-id>.json`
- `<receipt-id>.md`
- 修改前草稿 JSON 快照
- 修改后草稿 JSON 快照
- canonical 回读结果
- host run 与 plan 状态
- 实际应用的操作、片段 ID 和时间范围
- 警告与失败

回执不会包含 host token。

写入前备份默认位于：

```text
F:/Codex/.dsh-jianying-plugin/backups/
```

备份和回执都在 F 盘，不使用 C 盘保存插件源码或编辑产物。

## 安全机制

- 不直接写加密的 `draft_content.json`。
- 先校验高级操作，再创建 host 任务。
- `apply` 必须显式设置 `confirm=true`。
- 运行期额外权限默认不自动批准。
- 写入前备份草稿 JSON。
- 写入后对比文件哈希并回读。
- 未检测到变化时，回执标记 warning，不会宣称应用成功。
- 导出默认不覆盖已有文件。
- 不返回、记录或提交 host token。

## 配置

默认 bundle 配置：

```yaml
installDirs:
  - E:/JianyingPro
  - F:/JianyingPro
tempRoot: F:/Codex/.dsh-jianying-plugin
allowApply: false
allowHostApply: true
createBackup: true
hostPollIntervalMs: 2000
hostWorkflowTimeoutMs: 300000
```

说明：

- `allowApply` 只控制旧版 `jianying_cli apply-patch` 流程。
- `allowHostApply` 控制新版高级编辑与导出流程。
- `createBackup` 控制 apply 前备份。
- `hostWorkflowTimeoutMs` 是最长等待时间；大草稿或导出可单独传 `timeout_ms`。

也可以指定：

```yaml
instanceId: instance-...
sessionId: session-...
```

通常不需要手动指定，插件会选择最近的可用 Agent 会话。

## 本地开发与测试

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run validate:manifest
npm.cmd run smoke
npm.cmd run smoke:host
npm.cmd run pack:release
```

`smoke:host` 只执行 host 健康检查、会话发现和官方 CLI 草稿回读，不修改草稿。

固定数据测试可在没有剪映的机器上运行。真实剪映测试只有在发现本机安装时才启用，真实 host 写入测试不会在 CI 中自动执行。

## 已知限制

- 剪映 PC 加密草稿只能通过剪映授权链路编辑。
- 独立启动 `lyra-cli.exe` 会返回 `unauthorized host process`，这是上游安全限制。
- host 编辑仍然依赖剪映 Agent 的规划与执行链路，复杂任务可能较慢。
- 资源类转场最好传真实 `transition_ref`；只给名称时由剪映 Agent 解析。
- 某些剪映版本或账号可能没有启用 Custom Agent host。

## 发布

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run validate:manifest
npm.cmd run pack:release
```

生成文件：

```text
dist/dsh-jianying-plugin-0.2.0.tgz
```

将 `.tgz` 上传到 GitHub Release。用于 GitHub Actions 的 tag 应当与版本一致，例如 `v0.2.0`。

## 许可证

MIT
