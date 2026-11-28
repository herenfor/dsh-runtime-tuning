# 测试版与正式版发布

当前发布版本为 **`0.2.22`**。GitHub Release 分发源码与安装包，npm 分发包；两者分别发布。实测版本与范围集中见 [README](../README.md#已测版本)。

## 版本与通道

| 阶段 | 版本示例 | GitHub | npm 标签 |
| --- | --- | --- | --- |
| 试用验证 | `0.2.20-beta.1`、`0.2.20-beta.2` | Pre-release | `beta` |
| 持续开发快照 | `0.2.20-dev.1` | Pre-release | `next` |
| 正式发布 | `0.2.19`、`0.2.20` | Release | `latest` |

本项目的新功能完成实现与回归后，先发 Beta；试用反馈有修改就递增 Beta 序号，确认后去掉后缀发布正式版。不填写版本或标签时通常安装 `latest`，测试者需要明确选择 `beta` 或准确版本。

## 发布当前版本

由所有者在 WSL 仓库根目录执行。先提交并推送代码，让 main 工作区干净且与 origin/main 一致：

```bash
scripts/release.sh 0.2.22 --dry-run
npm login                        # 登录过期时执行
scripts/release.sh 0.2.22 --local
```

脚本先跑单元测试和实际打包安装检查，将当前 Beta 发布到 `beta`，保留 `latest`。确认 registry 可查后才创建并推送版本标签；如果 GitHub 发布已创建同一提交的标签，会直接复用。

npm 发布之后，测试者可以安装：

```bash
dsh plugin --profile web add @herenfor/dsh-tune@beta
```

`web` 用于 CLI / WSL Web profile；Desktop 和桥接端在各自插件页填写相同包名。等任务结束再更新，重启 DSH 并刷新页面，在新会话选择「协作」。GitHub 安装包的直接安装命令见对应 Release，无需等待 npm。

## 下一轮与正式版

每次源码变化使用新版本，例如 `0.2.19-beta.2`。正式发布时将 package.json 版本改为 `0.2.19`，同步 README 和更新记录，完成检查、提交和推送，然后执行相应版本的 `scripts/release.sh ... --local`，脚本会使用 `latest`。

脚本不会自动更新已安装插件。发布失败可修复后重跑；如果 npm 已有同版本，会先核对包的完整性，不覆盖已有包。版本号每次发布只能使用一次。

## 维护约定

仓库为 `herenfor/dsh-runtime-tuning`，npm 包为 `@herenfor/dsh-tune`。npm 认证由所有者完成，测试包、验证日志和交接材料放在仓库外。

更新回归：在完整 Git 历史和已安装的 Linux/WSL DSH 环境中执行 `npm run check:preset-upgrade -- /path/to/dsh [另一版本入口]`。脚本使用仓库外隔离 HOME/profile 验证旧包升级、旧会话继续和新会话运行，结束后删除临时安装。协作预设的独立回归见 [验证与维护](collaborative-preset.md#验证与维护)。

发布规则依据：[npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/)、[GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。
