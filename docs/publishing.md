# 发布到 npm

当前为审批卡与表格候选版本，尚未通过 Windows Desktop 和远端生产验收；先安装候选实测。确认后由所有者在 WSL 中执行（预发布进入 next 标签）。先提交并推送代码，让 main 工作区干净且与 origin/main 一致，再运行：

```bash
scripts/release.sh 0.2.15-dev.6 --dry-run
npm login                        # 登录过期时执行
scripts/release.sh 0.2.15-dev.6 --local
```

脚本先跑单元测试和实际打包安装检查，再发布到 npm；确认 registry 可查后才打标签并推送。不自动更新已安装插件。预发布版本使用 next 标签，正式版本使用 latest。发布失败时保留源码，可修复后重跑；如果 npm 已有同版本，脚本会核对已发布包的完整性，再补标签。版本号在 package.json 中维护，每个版本只能发布一次。

仓库名仍为 `herenfor/dsh-runtime-tuning`，npm 包名为 `@herenfor/dsh-tune`。发布命令在仓库根目录执行，npm 认证由所有者完成。测试包、验证日志及交接材料放在仓库外。

更新回归：在完整 Git 历史的仓库和已安装的 Linux/WSL DSH 环境中执行 `npm run check:preset-upgrade -- /path/to/dsh [另一版本入口]`。脚本使用仓库外的隔离 HOME/profile 复现旧版到 dev.5 的故障，并验证当前候选升级后旧会话可继续、新会话可运行；结束后删除临时安装，不访问实际会话。
