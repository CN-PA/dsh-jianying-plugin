# dsh-jianying-plugin

这是一个用于 DeepSeek Harness 的剪映专业版插件，可以读取本机剪映工程、检查加密草稿，并通过剪映自带的官方 Agent CLI 规划和校验时间线补丁。

> 当前状态：`0.1.0` 已可用于安装、草稿发现、查询、规划和补丁校验。真正应用补丁仍需要剪映授权的 DraftEditing 宿主会话，因此默认关闭写入。

## 功能

- 识别剪映专业版的安装目录、版本、草稿注册表、Agent CLI、`lyra-cli` 和运行状态。
- 按名称、ID 或路径列出剪映草稿。
- 检查草稿目录、时间线、媒体文件数量和加密状态，不修改草稿。
- 调用剪映官方的 `jianying-agent-cli.exe`。
- 创建并校验 `draft_patch` 补丁。
- 应用补丁时，同时检查宿主 token、`lyra-cli`、插件权限和用户确认。
- 按需启动剪映专业版。
- 在 DSH 插件模块中显示图标、标题、描述以及中英文元数据。

## 从 GitHub Release 安装

1. 从 GitHub Releases 下载 `dsh-jianying-plugin-<版本>.tgz`。
2. 在 **DSH → 插件** 中安装该压缩包，或者运行：

   ```powershell
   dsh plugin --profile desktop add file:C:/Users/<用户名>/Downloads/dsh-jianying-plugin-0.1.0.tgz
   ```

3. 如果插件卡片或工具没有立即出现，请重启 DSH。
4. 在插件模块中确认 **dsh-jianying-plugin** 已显示并启用。
5. 让 DSH 调用 `jianying_status` 进行环境检查。

如果使用的是 Web 或 TUI profile，请把命令中的 `desktop` 替换为实际使用的 profile 名称。

## 安装 GitHub 仓库版本

```powershell
dsh plugin --profile desktop add github:<owner>/dsh-jianying-plugin
```

本地开发时可以直接链接仓库：

```powershell
dsh plugin --profile desktop add 'link:F:/Projects/dsh-jianying-plugin'
```

安装后，DSH profile 中会出现名为 `dsh-jianying-plugin` 的 bundle。使用 `link:` 安装时，DSH 会创建目录联接，源码仍保存在 F 盘。

## 工具

| 工具 | 操作 | 用途 |
|---|---|---|
| `jianying_status` | `status` | 检查安装目录、草稿注册表、剪映进程、官方 CLI 和可用能力。 |
| `jianying_drafts` | `list`、`inspect`、`launch` | 浏览和检查草稿，或启动剪映。 |
| `jianying_cli` | `query-content`、`plan-patch`、`validate-patch`、`apply-patch`、`fetch-feishu-doc` | 调用剪映官方 Agent CLI。 |

支持的补丁操作：

`add_clip`、`update_clip`、`move_clip`、`trim_clip`、`remove_clip`、`split_clip`、`add_track`、`update_track`、`remove_track`、`add_effect`、`update_effect`、`remove_effect`、`add_transition`、`update_transition`、`remove_transition`、`set_timeline_property`。

## 安全机制

剪映 11.7 会加密保存 `draft_content.json`。直接修改该文件属于未公开格式操作，容易损坏工程，因此插件不会绕过剪映的草稿保护。

- 草稿列表和检查操作均为只读。
- 查询、规划和校验使用本机安装的剪映官方 CLI。
- `apply-patch` 默认关闭。
- 应用补丁必须同时满足以下条件：
  - 插件配置中启用 `allowApply: true`；
  - 剪映宿主提供 `JIANYING_AGENT_RUNTIME_TOKEN`；
  - 本机存在可用的 `lyra-cli.exe`；
  - 用户显式传入 `confirm: true`。
- 当前独立运行 `lyra-cli.exe` 时，剪映可能返回 `unauthorized host process`。此时最终写入需要接入剪映授权的 DraftEditing 宿主，插件会如实返回错误，不会直接修改草稿。

## 配置

默认 bundle 配置如下：

```yaml
installDirs:
  - E:/JianyingPro
  - F:/JianyingPro
tempRoot: F:/Codex/.dsh-jianying-plugin
allowApply: false
```

插件还会检查 `JIANYING_HOME` 和常见的剪映安装位置。运行时 token 只能从宿主环境或插件配置读取，模型无法通过工具参数自行提供 token。

## 本机测试环境

- DSH Desktop `26.1111.2228.0`
- 剪映专业版 `11.7.0.14652`
- Windows 11 x64

已完成的测试：

- 13 项自动化测试全部通过。
- 成功发现剪映安装目录和两个官方 CLI。
- 成功读取本地草稿注册表中的 20 个草稿。
- 成功检查加密草稿。
- 使用真实 `jianying-agent-cli.exe` 校验了一个 `draft_patch`。
- 使用模拟 CLI 测试了查询、校验以及受保护的补丁应用流程。
- 在全新 DSH profile 中从 tgz 安装 bundle。
- `--dump-config` 成功展开插件配置。
- `--dump-config-schema` 成功导入插件模块。

完整结果见 [功能测试矩阵](docs/FEATURE_MATRIX.md)、[测试说明](docs/TESTING.md) 和 [发布说明](docs/PUBLISHING.md)。

## 开发

```powershell
npm test
npm run check
npm run validate:manifest
npm run smoke
npm run pack:release
```

CI 不要求安装剪映，可以在 Linux 和 Windows 上运行固定数据及模拟 CLI 测试。只有在检测到本机剪映安装时，真实集成测试才会运行。

## 后续计划

- 接入剪映授权的 DraftEditing 宿主桥。
- 增加字幕、语音、音频、转场和导出的高层操作。
- 在补丁应用后回读草稿，并生成可读的编辑回执。

## 许可证

MIT
