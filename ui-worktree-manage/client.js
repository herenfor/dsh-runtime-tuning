window.__ModuleLoader__.load({
  id: '@herenfor/dsh-tune-worktree-manage',
  factory: (require) => {
    const exports = {}
    const MODULE_ID = '@herenfor/dsh-tune-worktree-manage'
    const RPC_CHANNEL = '/dsh-tune-worktree-manage'
    const WORKTREE_KIND = 'worktree'
    const TOOL_NAME = 'create_worktree'
    const LOCALE_NS = 'tuneWorktreeManage'
    const STYLE_ID = '@herenfor/dsh-tune-worktree-manage/ui.css'

    const LOCALES = {
      zh: {
        btnCreate: '+ 新建',
        btnPrune: '清理失效',
        btnForkFrom: '从此分叉',
        btnDelete: '删除',
        btnPruneOne: '剪枝清理',
        menuCreateWorkspace: '新建 Worktree',
        menuForkSession: '分叉到新 Worktree',
        modalCreateTitle: '新建派生 Worktree',
        labelBranch: '分支名',
        placeholderBranch: '例如 feat/my-task',
        labelBaseRef: '基线引用（可选）',
        placeholderBaseRef: '留空使用当前主仓 HEAD，或填分支/SHA',
        labelPathPreview: '目标目录预览',
        labelCustomPath: '自定义目录（可选，留空按模板生成）',
        placeholderCustomPath: '如 ../repo-wt/custom',
        labelSessionMode: '创建后会话处理',
        modeBlank: '新建空白会话',
        modeFork: 'Fork 当前会话上下文',
        modeNone: '仅创建目录',
        btnConfirmCreate: '确认创建',
        creating: '正在创建…',
        modalRemoveTitle: '安全删除 Worktree',
        removeSafetyHint: '强制双重门禁校验（绝不使用 --force）',
        checkingGates: '正在校验安全门禁…',
        gateNotMain: '非主仓库根目录',
        gateNotLocked: '未被 Git Worktree 锁定',
        gateExists: '目录存在（非失效状态）',
        gateGitClean: 'Git 工作区与暂存区完全干净',
        gateGitDirty: '存在 {count} 处未提交/未跟踪变更（staged {staged} / unstaged {unstaged} / untracked {untracked} / conflicted {conflicted}）',
        gateNoSessions: 'DSH 无活跃运行中的会话活动',
        gateSessionsActive: '存在 {count} 个活跃 DSH 会话正在运行（{kinds}）',
        btnConfirmRemove: '确认删除',
        removing: '正在删除…',
        modalPruneTitle: '清理失效 Worktree 记录（git worktree prune）',
        checkingPrune: '正在预览可剪枝记录…',
        noPrunable: '当前没有需要清理的失效 Worktree 记录。',
        btnConfirmPrune: '确认剪枝',
        pruning: '正在清理…',
        cancel: '取消',
        close: '关闭',
        retryCheck: '重新校验',
        toolTitle: '创建 Worktree',
        toolPreparing: '正在创建 Worktree…',
        toolRunning: '正在创建',
        toolOk: '已创建',
        toolError: '失败',
        toolStopped: '已停止',
        toolOpenTarget: '进入 Worktree / 会话',
        toolInspect: '查看详情',
        noBaseSessionForFork: '当前未选定可 Fork 的源会话，将自动改建空白会话。',
        heroChipLocal: '当前目录',
        heroChipWorktree: 'Worktree · {branch}',
        heroAutoBranch: '自动命名',
        heroLocal: '当前目录 (Local)',
        heroLocalDesc: '直接在当前项目目录开始对话并修改文件。',
        heroWorktree: '新建 Worktree',
        heroWorktreeDesc: '发送首条消息时自动派生隔离工作树与分支。',
        heroBaseBranch: '基线分支',
        heroCurrentSuffix: '（当前）',
        heroBranchOptional: '新分支名（可选）',
        heroBranchPlaceholder: '留空自动生成 wt/... 分支',
        heroSendHint: '发送首条消息时自动创建并切入新 Worktree，不扰动当前工作区。',
        heroCreateNow: '立即创建并打开',
        heroCreatingNow: '创建中…',
        dockCreating: '正在创建 Worktree 并切入工作区（{branch}）…',
        dockErrorTitle: 'Worktree 创建失败',
        dockRetry: '重试创建',
        dockCancelLocal: '在当前目录继续',
      },
      en: {
        btnCreate: '+ New',
        btnPrune: 'Prune',
        btnForkFrom: 'Branch from here',
        btnDelete: 'Remove',
        btnPruneOne: 'Prune',
        menuCreateWorkspace: 'New Worktree',
        menuForkSession: 'Fork to New Worktree',
        modalCreateTitle: 'Create Derived Worktree',
        labelBranch: 'Branch Name',
        placeholderBranch: 'e.g. feat/my-task',
        labelBaseRef: 'Base Ref (optional)',
        placeholderBaseRef: 'Defaults to repo HEAD; or branch/tag/SHA',
        labelPathPreview: 'Target Directory Preview',
        labelCustomPath: 'Custom Path Override (optional)',
        placeholderCustomPath: 'e.g. ../repo-wt/custom',
        labelSessionMode: 'After Creation',
        modeBlank: 'Open Blank Session',
        modeFork: 'Fork Current Session',
        modeNone: 'Directory Only',
        btnConfirmCreate: 'Create Worktree',
        creating: 'Creating…',
        modalRemoveTitle: 'Safe Remove Worktree',
        removeSafetyHint: 'Dual safety gates enforced (never uses --force)',
        checkingGates: 'Checking safety gates…',
        gateNotMain: 'Not the primary repository worktree',
        gateNotLocked: 'Not locked by git worktree lock',
        gateExists: 'Directory exists on disk (not prunable)',
        gateGitClean: 'Git working tree & staging area clean',
        gateGitDirty: '{count} dirty entries (staged {staged} / unstaged {unstaged} / untracked {untracked} / conflicted {conflicted})',
        gateNoSessions: 'No active DSH sessions running',
        gateSessionsActive: '{count} active DSH session(s) running ({kinds})',
        btnConfirmRemove: 'Confirm Remove',
        removing: 'Removing…',
        modalPruneTitle: 'Prune Stale Worktrees (git worktree prune)',
        checkingPrune: 'Scanning prunable entries…',
        noPrunable: 'No prunable stale worktree entries found.',
        btnConfirmPrune: 'Confirm Prune',
        pruning: 'Pruning…',
        cancel: 'Cancel',
        close: 'Close',
        retryCheck: 'Recheck',
        toolTitle: 'Create Worktree',
        toolPreparing: 'Creating worktree…',
        toolRunning: 'Creating',
        toolOk: 'Created',
        toolError: 'Failed',
        toolStopped: 'Stopped',
        toolOpenTarget: 'Enter Worktree / Session',
        toolInspect: 'Inspect',
        noBaseSessionForFork: 'No source session available to fork; a blank workspace will be created.',
        heroChipLocal: 'Local',
        heroChipWorktree: 'Worktree · {branch}',
        heroAutoBranch: 'auto',
        heroLocal: 'Local Workspace',
        heroLocalDesc: 'Work directly in the current project checkout.',
        heroWorktree: 'New Worktree',
        heroWorktreeDesc: 'Create an isolated worktree & branch on first message.',
        heroBaseBranch: 'Base Branch',
        heroCurrentSuffix: ' (current)',
        heroBranchOptional: 'Branch Name (optional)',
        heroBranchPlaceholder: 'Leave blank to auto-name wt/...',
        heroSendHint: 'Creates and switches into the new worktree automatically on send.',
        heroCreateNow: 'Create & Open Now',
        heroCreatingNow: 'Creating…',
        dockCreating: 'Creating worktree & switching directory ({branch})…',
        dockErrorTitle: 'Worktree creation failed',
        dockRetry: 'Retry',
        dockCancelLocal: 'Continue in Local',
      },
    }

    const formatText = (dict, key, vars) => {
      let s = (dict && Object.hasOwn(dict, key) ? dict[key] : null) ?? LOCALES.en[key] ?? key
      if (vars && typeof vars === 'object') {
        for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v ?? ''))
      }
      return s
    }

    const ensureStyle = () => {
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = MODULE_ID
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = [
        '@keyframes twmBackdropIn{from{opacity:0}to{opacity:1}}',
        '@keyframes twmModalIn{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}',
        '@keyframes twmPopIn{from{opacity:0;transform:translateY(-4px) scale(.97)}to{opacity:1;transform:none}}',
        '@keyframes twmSpin{to{transform:rotate(360deg)}}',
        '.TWM_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:7px;padding:4px 9px;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;transition:background .14s,border-color .14s,color .14s,transform .12s}',
        '.TWM_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}',
        '.TWM_btn:active:not(:disabled){transform:scale(.98)}',
        '.TWM_btnWarn{color:#dc2626;border-color:rgba(220,38,38,.42)}',
        '.TWM_btnWarn:hover:not(:disabled){background:rgba(220,38,38,.08);border-color:rgba(220,38,38,.65);color:#dc2626}',
        '.TWM_btnPri{border:0;border-radius:7px;background:var(--dsw-alias-state-business-primary,var(--dsw-static-blue-600,#3b82f6));color:#fff;font:inherit;font-size:11px;font-weight:600;padding:5px 12px;cursor:pointer;white-space:nowrap;transition:filter .14s,transform .12s}',
        '.TWM_btnPri:hover:not(:disabled){filter:brightness(1.08)}',
        '.TWM_btnPri:active:not(:disabled){transform:scale(.98)}',
        '.TWM_btnSm{height:28px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center}',
        '.TWM_btnPri:disabled,.TWM_btnDanger:disabled,.TWM_btn:disabled{opacity:.45;cursor:not-allowed}',
        '.TWM_btnDanger{border:0;border-radius:7px;background:#dc2626;color:#fff;font:inherit;font-size:11px;font-weight:600;padding:5px 12px;cursor:pointer;white-space:nowrap;transition:filter .14s,transform .12s}',
        '.TWM_btnDanger:hover:not(:disabled){filter:brightness(1.08)}',
        '.TWM_backdrop{position:absolute;inset:0;background:rgba(0,0,0,.42);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:12px;z-index:20;animation:twmBackdropIn .15s ease-out}',
        '.TWM_modal{width:100%;max-width:410px;max-height:92%;overflow:auto;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l3);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 16px 36px rgba(0,0,0,.3);color:var(--dsw-alias-label-primary);font-size:12px;animation:twmModalIn .18s cubic-bezier(.2,.8,.2,1)}',
        '.TWM_mHead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:600;font-size:13px}',
        '.TWM_field{display:flex;flex-direction:column;gap:4px}',
        '.TWM_label{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:500}',
        '.TWM_input,.TWM_select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:6px 8px;font:inherit;font-size:12px;outline:none;transition:border-color .14s}',
        '.TWM_input:focus,.TWM_select:focus{border-color:var(--dsw-alias-state-business-primary,#3b82f6)}',
        '.TWM_preview{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;padding:6px 8px;border-radius:7px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
        '.TWM_seg{display:flex;gap:4px;flex-wrap:wrap}',
        '.TWM_segBtn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:7px;padding:4px 8px;font:inherit;font-size:11px;cursor:pointer;transition:background .14s,border-color .14s,color .14s}',
        '.TWM_segBtn[data-active="true"]{border-color:var(--dsw-alias-state-business-primary,#3b82f6);color:var(--dsw-alias-label-primary);font-weight:600;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-2))}',
        '.TWM_gate{display:flex;align-items:flex-start;gap:7px;padding:6px 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font-size:11px}',
        '.TWM_gateOk{color:#10b981;font-weight:700;flex-shrink:0}',
        '.TWM_gateNo{color:#dc2626;font-weight:700;flex-shrink:0}',
        '.TWM_mFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:4px}',
        '.TWM_err{color:#dc2626;font-size:11px;overflow-wrap:anywhere}',
        '.TWM_warn{color:#d97706;font-size:11px;overflow-wrap:anywhere}',
        '.TWM_rowSum{min-width:0;color:inherit;align-items:center;gap:8px;margin-left:8px;font-size:12px;display:flex}',
        '.TWM_rowTgt{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
        '.TWM_rowOut{border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;padding:10px;font-size:12px}',
        '.TWM_rowAct{display:flex;gap:12px;align-items:center}',
        '.TWM_link{color:var(--dsw-alias-link);font:inherit;cursor:pointer;background:0 0;border:0;padding:4px 0;font-size:12px}',
        '.TWM_heroWrap{position:relative;display:inline-flex;flex:none;align-items:center;min-width:0}',
        '.TWM_heroBtn{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:240px;height:28px;padding:0 9px;border:1px solid transparent;border-radius:var(--dsw-radius-sm,7px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer;transition:background .14s,border-color .14s,color .14s}',
        '.TWM_heroBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
        '.TWM_heroBtn[data-armed="true"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 11%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 45%,transparent);color:var(--dsw-alias-state-business-primary,#3b82f6)}',
        '.TWM_heroLbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.TWM_chev{flex:none;opacity:.75;transition:transform .16s ease}',
        '.TWM_chev[data-open="true"]{transform:rotate(180deg)}',
        '.TWM_heroPop{position:absolute;top:calc(100% + 6px);right:0;width:320px;max-width:92vw;z-index:40;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l3);border-radius:12px;padding:10px;box-shadow:0 14px 32px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:8px;color:var(--dsw-alias-label-primary);font-size:12px;text-align:left;transform-origin:top right;animation:twmPopIn .16s cubic-bezier(.2,.8,.2,1)}',
        '.TWM_radioCard{display:flex;align-items:flex-start;gap:8px;width:100%;text-align:left;padding:8px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;cursor:pointer;transition:border-color .14s,background .14s}',
        '.TWM_radioCard:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.TWM_radioCard[data-active="true"]{border-color:var(--dsw-alias-state-business-primary,#3b82f6);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 8%,var(--dsw-alias-bg-layer-1))}',
        '.TWM_radioDot{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l3);margin-top:2px;flex-shrink:0;display:flex;align-items:center;justify-content:center}',
        '.TWM_radioCard[data-active="true"] .TWM_radioDot{border-color:var(--dsw-alias-state-business-primary,#3b82f6)}',
        '.TWM_radioDotIn{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3b82f6)}',
        '.TWM_heroForm{display:flex;flex-direction:column;gap:7px;padding:8px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2)}',
        '.TWM_heroHint{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.45}',
        '.TWM_dock{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 40%,var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-size:12px;animation:twmPopIn .16s ease-out}',
        '.TWM_dockErr{border-color:rgba(220,38,38,.45);background:color-mix(in srgb,#dc2626 8%,var(--dsw-alias-bg-layer-1))}',
        '.TWM_spinner{width:14px;height:14px;border-radius:50%;border:2px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-state-business-primary,#3b82f6);flex-shrink:0;animation:twmSpin .85s linear infinite}',
        '@media (prefers-reduced-motion:reduce){.TWM_backdrop,.TWM_modal,.TWM_heroPop,.TWM_dock,.TWM_spinner,.TWM_btn,.TWM_btnPri,.TWM_btnDanger,.TWM_heroBtn,.TWM_chev{animation:none !important;transition:none !important;transform:none !important}}',
      ].join('')
      document.head.appendChild(tag)
    }

    const sanitizeSlugClient = (input) => {
      if (typeof input !== 'string') return ''
      let s = input.trim().replace(/[^A-Za-z0-9._-]+/g, '-')
      s = s.replace(/\.{2,}/g, '-').replace(/^[._-]+/, '').replace(/[.-]+$/, '')
      if (s.length > 80) s = s.slice(0, 80).replace(/[.-]+$/, '')
      return s === '.' || s === '..' ? '' : s
    }

    const normalizePosixPath = (p) => {
      const parts = []
      const abs = p.startsWith('/')
      for (const seg of p.split('/')) {
        if (!seg || seg === '.') continue
        if (seg === '..') {
          if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
          else if (!abs) parts.push('..')
        } else {
          parts.push(seg)
        }
      }
      return (abs ? '/' : '') + parts.join('/') || (abs ? '/' : '.')
    }

    const previewWorktreePath = ({ mainPath, repoName, branch, slug, pathTemplate = '../<repo>-wt/<slug>', customPath }) => {
      const base = String(mainPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
      if (typeof customPath === 'string' && customPath.trim()) {
        const c = customPath.trim().replace(/\\/g, '/')
        if (c.startsWith('/') || /^[A-Za-z]:\//.test(c)) return c
        return base ? normalizePosixPath(`${base}/${c}`) : c
      }
      const safeSlug = sanitizeSlugClient(slug || branch)
      if (!safeSlug) return ''
      const safeRepo = sanitizeSlugClient(repoName || base.split('/').pop() || 'repo') || 'repo'
      const expanded = (pathTemplate || '../<repo>-wt/<slug>').replaceAll('<repo>', safeRepo).replaceAll('<slug>', safeSlug)
      return base ? normalizePosixPath(`${base}/${expanded}`) : expanded
    }

    const canonicalComparePath = (p) => {
      if (typeof p !== 'string' || p.length === 0) return ''
      const unc = /^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/][^\\/]+(?:[\\/](.*))?$/i.exec(p)
      if (unc) {
        const rest = (unc[1] ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
        return rest ? `/${rest}` : '/'
      }
      const drive = /^([A-Za-z]):[\\/](.*)$/.exec(p)
      if (drive) {
        const rest = (drive[2] ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
        return rest ? `/mnt/${drive[1].toLowerCase()}/${rest}` : `/mnt/${drive[1].toLowerCase()}`
      }
      const fwd = p.replace(/\\/g, '/')
      return fwd.length > 1 ? fwd.replace(/\/+$/, '') : fwd
    }

    const formatPathForWorkspaceCreate = (posixPath, { referencePath, wslDistro } = {}) => {
      if (typeof posixPath !== 'string' || !posixPath.startsWith('/')) return posixPath
      const uncRef = typeof referencePath === 'string' ? /^[\\/]{2}(wsl\.localhost|wsl\$)[\\/]([^\\/]+)/i.exec(referencePath) : null
      const winDriveRef = typeof referencePath === 'string' && /^[A-Za-z]:[\\/]/.test(referencePath)
      if (!uncRef && !winDriveRef) return posixPath
      const mnt = /^\/mnt\/([a-z])(?:\/(.*))?$/i.exec(posixPath)
      if (mnt) return `${mnt[1].toUpperCase()}:\\${(mnt[2] ?? '').replace(/\//g, '\\')}`
      if (uncRef) return `\\\\${uncRef[1]}\\${uncRef[2]}${posixPath.replace(/\//g, '\\')}`
      if (wslDistro) return `\\\\wsl.localhost\\${wslDistro}${posixPath.replace(/\//g, '\\')}`
      return posixPath
    }

    const isGateAllowed = (preflight) => Boolean(
      preflight?.allowed === true &&
      preflight?.gates?.notMain &&
      preflight?.gates?.notLocked &&
      preflight?.gates?.exists &&
      preflight?.gates?.gitClean &&
      preflight?.gates?.noActiveSessions,
    )

    const callManageRpc = async (ctx, endpoint, payload, signal) => {
      const rpc = ctx?.connection?.rpc
      if (!rpc || typeof rpc.call !== 'function') throw new Error('Connection RPC unavailable')
      const res = await rpc.call(RPC_CHANNEL, endpoint, payload, signal)
      if (!res || res.ok !== true) {
        const err = new Error(res?.error?.message || res?.error?.code || 'Worktree manage RPC failed')
        err.code = res?.error?.code
        err.details = res?.error?.details
        throw err
      }
      return res.value
    }

    const postCreateNavigate = async ({ res, referencePath, wslDistro, workspaces, uiWorkspace }) => {
      if (!res || res.created !== true) return
      if (res.sessionId && typeof uiWorkspace?.openSession === 'function') {
        uiWorkspace.openSession(res.sessionId)
        return
      }
      if (res.sessionMode === 'blank' && uiWorkspace?.openWorkspace) {
        if (res.workspaceId) {
          await uiWorkspace.openWorkspace(res.workspaceId)
          return
        }
        const targetKey = canonicalComparePath(res.worktreePath)
        const items = workspaces?.list?.getSnapshot?.()?.items || []
        const existing = items.find((w) => canonicalComparePath(w.path) === targetKey)
        if (existing) {
          await uiWorkspace.openWorkspace(existing.workspaceId)
          return
        }
        if (typeof workspaces?.create === 'function') {
          const createPath = formatPathForWorkspaceCreate(res.worktreePath, { referencePath, wslDistro })
          const created = await workspaces.create({ path: createPath })
          await uiWorkspace.openWorkspace(created.workspaceId)
        }
      }
    }

    const openWorktreeTabWithIntent = async (ctx, getExtHost, params, intent) => {
      const extHost = typeof getExtHost === 'function' ? getExtHost() : null
      if (intent && extHost?.requestIntent) extHost.requestIntent(intent)
      const openOpts = params ? { params } : undefined
      try {
        ctx.sidebarRight?.openTab?.(WORKTREE_KIND, openOpts)
        return true
      } catch (err) {
        const msg = String(err?.message || err)
        if (!msg.includes('no session surface is mounted') || !params?.workspaceId || !ctx.uiWorkspace?.openWorkspace) {
          throw err
        }
        await ctx.uiWorkspace.openWorkspace(params.workspaceId)
        for (const ms of [0, 40, 120, 300]) {
          if (ms > 0) await new Promise((r) => setTimeout(r, ms))
          try {
            ctx.sidebarRight?.openTab?.(WORKTREE_KIND, openOpts)
            return true
          } catch {}
        }
        return false
      }
    }

    const createManageStore = () => {
      let modal = null
      const listeners = new Set()
      const emit = () => {
        for (const fn of [...listeners]) {
          try { fn() } catch {}
        }
      }
      const getSnapshot = () => modal
      const subscribe = (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      }
      const openCreate = (opts = {}) => {
        modal = { kind: 'create', ...opts }
        emit()
      }
      const openRemove = (opts = {}) => {
        modal = { kind: 'remove', ...opts }
        emit()
      }
      const openPrune = (opts = {}) => {
        modal = { kind: 'prune', ...opts }
        emit()
      }
      const close = () => {
        if (modal === null) return
        modal = null
        emit()
      }
      const dispose = () => {
        modal = null
        listeners.clear()
      }
      return { getSnapshot, subscribe, openCreate, openRemove, openPrune, close, dispose }
    }

    const createStageStore = () => {
      const bySid = new Map()
      const listeners = new Set()
      let version = 0
      const norm = (sid) => (typeof sid === 'string' ? sid.replace(/^wsl:/, '') : '')
      const emit = () => {
        version += 1
        for (const fn of [...listeners]) {
          try { fn() } catch {}
        }
      }
      return {
        get: (sid) => bySid.get(norm(sid)) || null,
        set: (sid, val) => {
          const key = norm(sid)
          if (!key) return
          if (val) bySid.set(key, val)
          else bySid.delete(key)
          emit()
        },
        getVersion: () => version,
        subscribe: (fn) => {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
        dispose: () => {
          bySid.clear()
          listeners.clear()
        },
      }
    }

    const resolveTranslator = (propsT, ctxLocale) => (key, vars) => {
      if (typeof propsT === 'function') {
        try {
          const res = propsT(key, vars)
          if (typeof res === 'string' && res !== key) return res
        } catch {}
      }
      const bound = ctxLocale?.bind?.(LOCALE_NS)
      if (typeof bound === 'function') {
        try {
          const res = bound(key, vars)
          if (typeof res === 'string' && res !== key) return res
        } catch {}
      }
      const lang = String(ctxLocale?.current?.getSnapshot?.() || ctxLocale?.language || 'zh').toLowerCase()
      return formatText(lang.startsWith('en') ? LOCALES.en : LOCALES.zh, key, vars)
    }

    const loadReactDeps = () => {
      let React = null
      let prim = null
      try { React = require('react') } catch {}
      try { prim = require('@deepseek-ai/dsh-client-ui-primitives') } catch {}
      return { React, prim }
    }

    const makeClientAutoBranch = () => `wt/task-${Math.random().toString(16).slice(2, 6).padEnd(4, '0')}`

    const createManageComponents = (ctx, store, stageStore = createStageStore()) => {
      const { React, prim } = loadReactDeps()
      if (!React || typeof React.createElement !== 'function') return null
      const h = React.createElement

      const BranchGlyph = ({ size = 13, className }) => h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          'aria-hidden': 'true',
        },
        h('circle', { cx: '4.5', cy: '3.5', r: '1.75' }),
        h('circle', { cx: '4.5', cy: '12.5', r: '1.75' }),
        h('circle', { cx: '11.5', cy: '6.5', r: '1.75' }),
        h('path', { d: 'M4.5 5.25v5.5M4.5 9.5c0-2 7-1 7-1.25' }),
      )

      const ChevronGlyph = ({ size = 12, className, open }) => h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.6',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          'data-open': open ? 'true' : 'false',
          'aria-hidden': 'true',
        },
        h('path', { d: 'm4 6 4 4 4-4' }),
      )

      const CreateModalBody = ({ modal, extApi, t }) => {
        const [branch, setBranch] = React.useState(modal.branch || '')
        const [baseRef, setBaseRef] = React.useState(modal.baseRef || '')
        const [customPath, setCustomPath] = React.useState('')
        const [sessionMode, setSessionMode] = React.useState(modal.sessionMode || 'blank')
        const [pathTemplate, setPathTemplate] = React.useState('../<repo>-wt/<slug>')
        const [submitting, setSubmitting] = React.useState(false)
        const [error, setError] = React.useState(null)
        const [warning, setWarning] = React.useState(null)

        React.useEffect(() => {
          let active = true
          callManageRpc(ctx, 'config', {}).then((cfg) => {
            if (active && cfg?.defaultPathTemplate) setPathTemplate(cfg.defaultPathTemplate)
          }).catch(() => {})
          return () => { active = false }
        }, [])

        const targetPath = modal.path || extApi.targetPath
        const mainPath = modal.mainPath || extApi.skel?.mainPath || targetPath
        const repoName = modal.repoName || extApi.skel?.repoName || ''
        const sourceSessionId = modal.sourceSessionId || extApi.sessionId || null
        const preview = previewWorktreePath({ mainPath, repoName, branch, pathTemplate, customPath })

        const onSubmit = async (e) => {
          e?.preventDefault?.()
          if (submitting || !branch.trim() || !targetPath) return
          setError(null)
          setWarning(null)
          setSubmitting(true)
          try {
            const effectiveMode = sessionMode === 'fork' && !sourceSessionId ? 'blank' : sessionMode
            const res = await callManageRpc(ctx, 'create', {
              path: targetPath,
              branch: branch.trim(),
              baseRef: baseRef.trim() || undefined,
              pathTemplate,
              customPath: customPath.trim() || undefined,
              sessionMode: effectiveMode,
              sourceSessionId: effectiveMode === 'fork' ? sourceSessionId : undefined,
            })
            if (res.forkWarning) setWarning(res.forkWarning)
            extApi.refresh?.()
            await postCreateNavigate({
              res,
              referencePath: targetPath,
              wslDistro: modal.wslDistro || extApi.wslDistro,
              workspaces: ctx.workspaces,
              uiWorkspace: ctx.uiWorkspace,
            })
            if (!res.forkWarning) store.close()
          } catch (err) {
            setError(err?.message || String(err))
          } finally {
            setSubmitting(false)
          }
        }

        return h(
          'form',
          { className: 'TWM_modal', 'data-worktree-manage-modal': 'create', onSubmit },
          h(
            'div',
            { className: 'TWM_mHead' },
            h('span', null, t('modalCreateTitle')),
            h('button', { type: 'button', className: 'TWM_btn', onClick: () => store.close() }, t('close')),
          ),
          h(
            'div',
            { className: 'TWM_field' },
            h('label', { className: 'TWM_label' }, t('labelBranch')),
            h('input', {
              type: 'text',
              className: 'TWM_input',
              'data-manage-branch': 'true',
              placeholder: t('placeholderBranch'),
              value: branch,
              onChange: (e) => setBranch(e.target.value),
            }),
          ),
          h(
            'div',
            { className: 'TWM_field' },
            h('label', { className: 'TWM_label' }, t('labelBaseRef')),
            h('input', {
              type: 'text',
              className: 'TWM_input',
              'data-manage-base': 'true',
              placeholder: t('placeholderBaseRef'),
              value: baseRef,
              onChange: (e) => setBaseRef(e.target.value),
            }),
          ),
          h(
            'div',
            { className: 'TWM_field' },
            h('label', { className: 'TWM_label' }, t('labelCustomPath')),
            h('input', {
              type: 'text',
              className: 'TWM_input',
              'data-manage-custom-path': 'true',
              placeholder: t('placeholderCustomPath'),
              value: customPath,
              onChange: (e) => setCustomPath(e.target.value),
            }),
          ),
          h(
            'div',
            { className: 'TWM_field' },
            h('span', { className: 'TWM_label' }, t('labelPathPreview')),
            h('div', { className: 'TWM_preview', 'data-manage-path-preview': 'true' }, preview || '—'),
          ),
          h(
            'div',
            { className: 'TWM_field' },
            h('span', { className: 'TWM_label' }, t('labelSessionMode')),
            h(
              'div',
              { className: 'TWM_seg' },
              ...[
                ['blank', 'modeBlank'],
                ['fork', 'modeFork'],
                ['none', 'modeNone'],
              ].map(([m, labelKey]) => h(
                'button',
                {
                  key: m,
                  type: 'button',
                  className: 'TWM_segBtn',
                  'data-active': sessionMode === m ? 'true' : 'false',
                  'data-manage-session-mode': m,
                  onClick: () => setSessionMode(m),
                },
                t(labelKey),
              )),
            ),
            sessionMode === 'fork' && !sourceSessionId
              ? h('div', { className: 'TWM_warn' }, t('noBaseSessionForFork'))
              : null,
          ),
          warning ? h('div', { className: 'TWM_warn' }, warning) : null,
          error ? h('div', { className: 'TWM_err' }, error) : null,
          h(
            'div',
            { className: 'TWM_mFoot' },
            h('button', { type: 'button', className: 'TWM_btn', onClick: () => store.close() }, t('cancel')),
            h(
              'button',
              {
                type: 'submit',
                className: 'TWM_btnPri',
                'data-manage-confirm-create': 'true',
                disabled: submitting || !branch.trim() || !targetPath,
                onClick: onSubmit,
              },
              submitting ? t('creating') : t('btnConfirmCreate'),
            ),
          ),
        )
      }

      const RemoveModalBody = ({ modal, extApi, t }) => {
        const [checkTick, setCheckTick] = React.useState(0)
        const [loading, setLoading] = React.useState(true)
        const [preflight, setPreflight] = React.useState(null)
        const [submitting, setSubmitting] = React.useState(false)
        const [error, setError] = React.useState(null)

        const targetPath = modal.path || extApi.targetPath
        const wtPath = modal.wt?.path
        React.useEffect(() => {
          if (!targetPath || !wtPath) return undefined
          const ac = typeof AbortController === 'function' ? new AbortController() : null
          let active = true
          setLoading(true)
          setError(null)
          callManageRpc(ctx, 'preflight-remove', { path: targetPath, worktreePath: wtPath }, ac?.signal)
            .then((val) => {
              if (active) { setPreflight(val); setLoading(false) }
            })
            .catch((err) => {
              if (active && err?.name !== 'AbortError') {
                setError(err?.message || String(err))
                setLoading(false)
              }
            })
          return () => { active = false; ac?.abort?.() }
        }, [targetPath, wtPath, checkTick])

        const allowed = isGateAllowed(preflight)
        const onRemove = async () => {
          if (!allowed || submitting) return
          setSubmitting(true)
          setError(null)
          try {
            await callManageRpc(ctx, 'remove', { path: targetPath, worktreePath: wtPath })
            extApi.refresh?.()
            store.close()
          } catch (err) {
            setError(err?.message || String(err))
          } finally {
            setSubmitting(false)
          }
        }

        const gateRow = (ok, text) => h(
          'div',
          { className: 'TWM_gate' },
          h('span', { className: ok ? 'TWM_gateOk' : 'TWM_gateNo' }, ok ? '✓' : '✕'),
          h('span', null, text),
        )

        const gs = preflight?.gitStatus
        const activeSess = preflight?.activeSessions || []
        const activeKinds = [...new Set(activeSess.flatMap((s) => (s.activities || []).map((a) => a.kind)))].join(', ')

        return h(
          'div',
          { className: 'TWM_modal', 'data-worktree-manage-modal': 'remove' },
          h(
            'div',
            { className: 'TWM_mHead' },
            h('span', null, t('modalRemoveTitle')),
            h('button', { type: 'button', className: 'TWM_btn', onClick: () => store.close() }, t('close')),
          ),
          h('div', { className: 'TWM_preview' }, wtPath || ''),
          h('div', { className: 'TWM_label' }, t('removeSafetyHint')),
          loading ? h('div', { className: 'TWM_label' }, t('checkingGates')) : null,
          preflight
            ? h(
                React.Fragment,
                null,
                gateRow(preflight.gates.notMain, t('gateNotMain')),
                gateRow(preflight.gates.notLocked, t('gateNotLocked')),
                gateRow(preflight.gates.exists, t('gateExists')),
                gateRow(
                  preflight.gates.gitClean,
                  preflight.gates.gitClean
                    ? t('gateGitClean')
                    : t('gateGitDirty', {
                        count: gs?.dirtyCount ?? 0,
                        staged: gs?.staged ?? 0,
                        unstaged: gs?.unstaged ?? 0,
                        untracked: gs?.untracked ?? 0,
                        conflicted: gs?.conflicted ?? 0,
                      }),
                ),
                gateRow(
                  preflight.gates.noActiveSessions,
                  preflight.gates.noActiveSessions
                    ? t('gateNoSessions')
                    : t('gateSessionsActive', { count: activeSess.length, kinds: activeKinds || 'active' }),
                ),
              )
            : null,
          error ? h('div', { className: 'TWM_err' }, error) : null,
          h(
            'div',
            { className: 'TWM_mFoot' },
            h('button', { type: 'button', className: 'TWM_btn', onClick: () => setCheckTick((n) => n + 1) }, t('retryCheck')),
            h('button', { type: 'button', className: 'TWM_btn', onClick: () => store.close() }, t('cancel')),
            h(
              'button',
              {
                type: 'button',
                className: 'TWM_btnDanger',
                'data-manage-confirm-remove': 'true',
                disabled: loading || !allowed || submitting,
                onClick: onRemove,
              },
              submitting ? t('removing') : t('btnConfirmRemove'),
            ),
          ),
        )
      }

      const PruneModalBody = ({ modal, extApi, t }) => {
        const [loading, setLoading] = React.useState(true)
        const [preview, setPreview] = React.useState(null)
        const [submitting, setSubmitting] = React.useState(false)
        const [error, setError] = React.useState(null)
        const targetPath = modal.path || extApi.targetPath

        React.useEffect(() => {
          if (!targetPath) return undefined
          const ac = typeof AbortController === 'function' ? new AbortController() : null
          let active = true
          setLoading(true)
          callManageRpc(ctx, 'prune', { path: targetPath, dryRun: true }, ac?.signal)
            .then((val) => {
              if (active) { setPreview(val); setLoading(false) }
            })
            .catch((err) => {
              if (active && err?.name !== 'AbortError') { setError(err?.message || String(err)); setLoading(false) }
            })
          return () => { active = false; ac?.abort?.() }
        }, [targetPath])

        const onPrune = async () => {
          if (submitting || !targetPath) return
          setSubmitting(true)
          setError(null)
          try {
            await callManageRpc(ctx, 'prune', { path: targetPath, dryRun: false })
            extApi.refresh?.()
            store.close()
          } catch (err) {
            setError(err?.message || String(err))
          } finally {
            setSubmitting(false)
          }
        }

        const entries = preview?.entries || []
        return h(
          'div',
          { className: 'TWM_modal', 'data-worktree-manage-modal': 'prune' },
          h(
            'div',
            { className: 'TWM_mHead' },
            h('span', null, t('modalPruneTitle')),
            h('button', { type: 'button', className: 'TWM_btn', onClick: () => store.close() }, t('close')),
          ),
          loading ? h('div', { className: 'TWM_label' }, t('checkingPrune')) : null,
          !loading && entries.length === 0 ? h('div', { className: 'TWM_label' }, t('noPrunable')) : null,
          ...entries.map((entry) => h(
            'div',
            { key: entry.path, className: 'TWM_preview' },
            `${entry.branch || 'detached'} — ${entry.path}${entry.reason ? ` (${entry.reason})` : ''}`,
          )),
          error ? h('div', { className: 'TWM_err' }, error) : null,
          h(
            'div',
            { className: 'TWM_mFoot' },
            h('button', { type: 'button', className: 'TWM_btn', onClick: () => store.close() }, t('cancel')),
            h(
              'button',
              {
                type: 'button',
                className: 'TWM_btnPri',
                'data-manage-confirm-prune': 'true',
                disabled: loading || submitting || entries.length === 0,
                onClick: onPrune,
              },
              submitting ? t('pruning') : t('btnConfirmPrune'),
            ),
          ),
        )
      }

      const WorktreeManageOverlay = ({ extApi }) => {
        const t = extApi?.t || resolveTranslator(null, ctx.locale)
        const modal = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

        React.useEffect(() => {
          const intent = extApi?.pendingIntent
          if (!intent || intent.kind !== 'create') return
          extApi.consumeIntent?.()
          store.openCreate({
            path: intent.path || extApi.targetPath,
            mainPath: extApi.skel?.mainPath || intent.path || extApi.targetPath,
            repoName: extApi.skel?.repoName,
            baseRef: intent.baseRef || '',
            sessionMode: intent.sessionMode || 'blank',
            sourceSessionId: intent.sourceSessionId || extApi.sessionId || null,
            wslDistro: extApi.wslDistro,
          })
        }, [extApi?.pendingIntent?.seq])

        if (!modal) return null
        return h(
          'div',
          {
            className: 'TWM_backdrop',
            'data-worktree-manage-backdrop': 'true',
            onClick: (e) => { if (e.target === e.currentTarget) store.close() },
          },
          modal.kind === 'create' ? h(CreateModalBody, { modal, extApi, t }) : null,
          modal.kind === 'remove' ? h(RemoveModalBody, { modal, extApi, t }) : null,
          modal.kind === 'prune' ? h(PruneModalBody, { modal, extApi, t }) : null,
        )
      }

      const CreateWorktreeToolRow = (props) => {
        const { block, inspect } = props
        const t = resolveTranslator(props?.t, ctx.locale)
        const [expanded, setExpanded] = React.useState(false)
        if (props?.phase === 'preparing') {
          if (prim?.DisclosureRow) {
            return h('div', { 'data-tool': TOOL_NAME, 'data-state': 'preparing', 'aria-label': t('toolPreparing') },
              h(prim.DisclosureRow, { title: t('toolTitle'), open: false, expandable: false, onToggle: () => {}, running: true }))
          }
          return h('div', { 'data-tool': TOOL_NAME, 'data-state': 'preparing' }, t('toolPreparing'))
        }

        const settled = block && 'kind' in block
        const state = !settled ? 'running' : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
        const meta = block?.meta
        const rawArgs = (settled ? block.call?.argsRaw : block?.argsRaw) ?? ''
        let summaryLabel = ''
        if (meta && meta.branch) {
          summaryLabel = `${meta.branch}${meta.worktreePath ? ` (${meta.worktreePath})` : ''}`
        } else {
          try { summaryLabel = JSON.parse(rawArgs || '{}').branch || '' } catch {}
        }
        const output = settled ? (block.content || []).map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n') : ''
        const details = output || (settled && block.error ? `${block.error.name}: ${block.error.code}` : '')

        const onOpenTarget = async () => {
          if (!meta || meta.tool !== TOOL_NAME) return
          if (meta.sessionId && ctx.uiWorkspace?.openSession) {
            ctx.uiWorkspace.openSession(meta.sessionId)
            return
          }
          if (meta.workspaceId && ctx.uiWorkspace?.openWorkspace) {
            await ctx.uiWorkspace.openWorkspace(meta.workspaceId)
            return
          }
          if (meta.worktreePath && ctx.workspaces?.create && ctx.uiWorkspace?.openWorkspace) {
            const items = ctx.workspaces?.list?.getSnapshot?.()?.items || []
            const key = canonicalComparePath(meta.worktreePath)
            const existing = items.find((w) => canonicalComparePath(w.path) === key)
            if (existing) {
              await ctx.uiWorkspace.openWorkspace(existing.workspaceId)
              return
            }
            const refPath = items.find((w) => typeof w.path === 'string' && (/^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/]/i.test(w.path) || /^[A-Za-z]:[\\/]/.test(w.path)))?.path
            const createPath = formatPathForWorkspaceCreate(meta.worktreePath, { referencePath: refPath })
            const ws = await ctx.workspaces.create({ path: createPath })
            await ctx.uiWorkspace.openWorkspace(ws.workspaceId)
          }
        }

        if (!prim?.DisclosureRow) {
          return h(
            'div',
            { 'data-tool': TOOL_NAME, 'data-state': state },
            h('span', null, `${t('toolTitle')}: ${t(`tool${state[0].toUpperCase()}${state.slice(1)}`)} ${summaryLabel}`),
            settled && state === 'ok' && meta?.worktreePath
              ? h('button', { type: 'button', className: 'TWM_link', onClick: () => { void onOpenTarget().catch(() => {}) } }, t('toolOpenTarget'))
              : null,
          )
        }

        return h(
          'div',
          { 'data-tool': TOOL_NAME, 'data-state': state },
          h(
            prim.DisclosureRow,
            {
              title: t('toolTitle'),
              open: expanded && details !== '',
              expandable: details !== '',
              expandOnRowClick: true,
              keepContentWhenOpen: true,
              onToggle: () => setExpanded((v) => !v),
              collapsedContent: h(
                'span',
                { className: 'TWM_rowSum' },
                h('span', null, t(`tool${state[0].toUpperCase()}${state.slice(1)}`)),
                h('span', { className: 'TWM_rowTgt' }, summaryLabel),
              ),
            },
            details ? h('pre', { className: 'TWM_rowOut' }, details) : null,
            h(
              'div',
              { className: 'TWM_rowAct' },
              settled && state === 'ok' && meta?.worktreePath
                ? h('button', { type: 'button', className: 'TWM_link', onClick: () => { void onOpenTarget().catch(() => {}) } }, t('toolOpenTarget'))
                : null,
              inspect ? h('button', { type: 'button', className: 'TWM_link', onClick: inspect }, t('toolInspect')) : null,
            ),
          ),
        )
      }

      const HeroWorktreeOption = (props) => {
        const t = resolveTranslator(props?.t, ctx.locale)
        const sessionId = props?.sessionId
        const liveCwd = typeof props?.useProjection === 'function' ? props.useProjection('workingDirectory') : undefined
        const sessCwd = typeof props?.useSessions === 'function'
          ? props.useSessions((s) => (sessionId ? s?.byId?.[sessionId]?.cwd : undefined))
          : ctx.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
        const cwd = liveCwd || sessCwd || null
        const isBlank = typeof props?.useSession === 'function'
          ? props.useSession((s) => (s === undefined ? true : Boolean(s.blank) && !s.removed))
          : true
        const _stageVer = React.useSyncExternalStore(stageStore.subscribe, stageStore.getVersion, stageStore.getVersion)
        const staged = sessionId ? stageStore.get(sessionId) : null

        const [branchInfo, setBranchInfo] = React.useState({ path: null, loaded: false, isGitRepo: false, branches: [] })
        const [popOpen, setPopOpen] = React.useState(false)
        const [selectedBase, setSelectedBase] = React.useState('')
        const [branchDraft, setBranchDraft] = React.useState('')
        const [popError, setPopError] = React.useState(null)
        const [saving, setSaving] = React.useState(false)
        const [creatingNow, setCreatingNow] = React.useState(false)
        const wrapRef = React.useRef(null)

        React.useEffect(() => {
          if (!sessionId || !cwd || !isBlank) return undefined
          const ac = typeof AbortController === 'function' ? new AbortController() : null
          let active = true
          Promise.all([
            callManageRpc(ctx, 'branches', { path: cwd }, ac?.signal).catch(() => ({ isGitRepo: false, branches: [] })),
            callManageRpc(ctx, 'session-stage', { sessionId }, ac?.signal).catch(() => null),
          ]).then(([info, existingStage]) => {
            if (!active) return
            setBranchInfo({ path: cwd, loaded: true, ...(info || { isGitRepo: false, branches: [] }) })
            if (stageStore && existingStage !== undefined) {
              stageStore.set(sessionId, existingStage)
            }
            setSelectedBase(existingStage?.baseRef || info?.currentBranch || '')
            setBranchDraft(existingStage?.branch || '')
          })
          return () => {
            active = false
            ac?.abort?.()
          }
        }, [sessionId, cwd, isBlank])

        React.useEffect(() => {
          if (!popOpen || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
          const onDocDown = (e) => {
            if (wrapRef.current && typeof wrapRef.current.contains === 'function' && !wrapRef.current.contains(e.target)) {
              setPopOpen(false)
            }
          }
          const onKey = (e) => {
            if (e?.key === 'Escape') setPopOpen(false)
          }
          document.addEventListener('mousedown', onDocDown)
          document.addEventListener('keydown', onKey)
          return () => {
            document.removeEventListener('mousedown', onDocDown)
            document.removeEventListener('keydown', onKey)
          }
        }, [popOpen])

        if (!sessionId || !cwd || !isBlank || !branchInfo.loaded || !branchInfo.isGitRepo) {
          return null
        }

        const armed = Boolean(staged && (staged.status === 'staged' || staged.status === 'creating' || staged.status === 'error'))
        const chipLabel = armed
          ? t('heroChipWorktree', { branch: staged.branch || branchDraft.trim() || t('heroAutoBranch') })
          : t('heroChipLocal')

        const applyStage = async ({ enabled, baseRef, branch }) => {
          if (saving) return
          setPopError(null)
          setSaving(true)
          try {
            const payload = enabled
              ? {
                  sessionId,
                  enabled: true,
                  path: cwd,
                  baseRef: baseRef || null,
                  branch: branch && branch.trim() ? branch.trim() : null,
                }
              : { sessionId, enabled: false }
            const res = await callManageRpc(ctx, 'stage-session', payload)
            stageStore.set(sessionId, enabled ? res : null)
          } catch (err) {
            setPopError(err?.message || String(err))
          } finally {
            setSaving(false)
          }
        }

        const handleCreateNow = async () => {
          if (creatingNow) return
          setPopError(null)
          setCreatingNow(true)
          try {
            if (armed) {
              await callManageRpc(ctx, 'stage-session', { sessionId, enabled: false }).catch(() => {})
              stageStore.set(sessionId, null)
            }
            const res = await callManageRpc(ctx, 'create', {
              path: cwd,
              branch: branchDraft.trim() || makeClientAutoBranch(),
              baseRef: selectedBase || undefined,
              pathTemplate: branchInfo.defaultPathTemplate || '../<repo>-wt/<slug>',
              sessionMode: 'blank',
            })
            setPopOpen(false)
            await postCreateNavigate({
              res,
              referencePath: cwd,
              wslDistro: null,
              workspaces: ctx.workspaces,
              uiWorkspace: ctx.uiWorkspace,
            })
          } catch (err) {
            setPopError(err?.message || String(err))
          } finally {
            setCreatingNow(false)
          }
        }

        const preview = armed
          ? previewWorktreePath({
              mainPath: branchInfo.mainPath || cwd,
              repoName: branchInfo.repoName,
              branch: branchDraft.trim() || 'wt-task-auto',
              pathTemplate: branchInfo.defaultPathTemplate || '../<repo>-wt/<slug>',
            })
          : ''

        return h(
          'div',
          { ref: wrapRef, className: 'TWM_heroWrap' },
          h(
            'button',
            {
              type: 'button',
              className: 'TWM_heroBtn',
              'data-worktree-hero-trigger': 'true',
              'data-armed': armed ? 'true' : 'false',
              'aria-expanded': popOpen ? 'true' : 'false',
              onClick: () => setPopOpen((v) => !v),
            },
            h(BranchGlyph, { size: 14 }),
            h('span', { className: 'TWM_heroLbl' }, chipLabel),
            h(ChevronGlyph, { size: 12, className: 'TWM_chev', open: popOpen }),
          ),
          popOpen
            ? h(
                'div',
                { className: 'TWM_heroPop', 'data-worktree-hero-popover': 'true', role: 'dialog' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'TWM_radioCard',
                    'data-active': !armed ? 'true' : 'false',
                    'data-worktree-hero-mode': 'local',
                    disabled: saving,
                    onClick: () => applyStage({ enabled: false }),
                  },
                  h('span', { className: 'TWM_radioDot' }, !armed ? h('span', { className: 'TWM_radioDotIn' }) : null),
                  h(
                    'div',
                    null,
                    h('div', { style: { fontWeight: 600 } }, t('heroLocal')),
                    h('div', { className: 'TWM_heroHint' }, t('heroLocalDesc')),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'TWM_radioCard',
                    'data-active': armed ? 'true' : 'false',
                    'data-worktree-hero-mode': 'worktree',
                    disabled: saving,
                    onClick: () => applyStage({ enabled: true, baseRef: selectedBase || branchInfo.currentBranch || '', branch: branchDraft }),
                  },
                  h('span', { className: 'TWM_radioDot' }, armed ? h('span', { className: 'TWM_radioDotIn' }) : null),
                  h(
                    'div',
                    null,
                    h('div', { style: { fontWeight: 600 } }, t('heroWorktree')),
                    h('div', { className: 'TWM_heroHint' }, t('heroWorktreeDesc')),
                  ),
                ),
                armed
                  ? h(
                      'div',
                      { className: 'TWM_heroForm' },
                      branchInfo.branches?.length > 0
                        ? h(
                            'label',
                            { className: 'TWM_field' },
                            h('span', { className: 'TWM_label' }, t('heroBaseBranch')),
                            h(
                              'select',
                              {
                                className: 'TWM_select',
                                'data-worktree-hero-base': 'true',
                                value: selectedBase,
                                onChange: (e) => {
                                  const nextBase = e.target.value
                                  setSelectedBase(nextBase)
                                  void applyStage({ enabled: true, baseRef: nextBase, branch: branchDraft })
                                },
                              },
                              ...(branchInfo.branches || []).map((b) => h(
                                'option',
                                { key: b.name, value: b.name },
                                b.isCurrent ? `${b.name}${t('heroCurrentSuffix')}` : b.name,
                              )),
                            ),
                          )
                        : null,
                      h(
                        'label',
                        { className: 'TWM_field' },
                        h('span', { className: 'TWM_label' }, t('heroBranchOptional')),
                        h('input', {
                          type: 'text',
                          className: 'TWM_input',
                          'data-worktree-hero-branch': 'true',
                          value: branchDraft,
                          placeholder: t('heroBranchPlaceholder'),
                          onChange: (e) => setBranchDraft(e.target.value),
                          onBlur: () => {
                            if (armed && (staged?.branch || '') !== branchDraft.trim()) {
                              void applyStage({ enabled: true, baseRef: selectedBase, branch: branchDraft })
                            }
                          },
                          onKeyDown: (e) => {
                            if (e?.key === 'Enter') {
                              e.preventDefault?.()
                              void applyStage({ enabled: true, baseRef: selectedBase, branch: branchDraft })
                            }
                          },
                        }),
                      ),
                      preview ? h('div', { className: 'TWM_preview' }, preview) : null,
                      h('div', { className: 'TWM_heroHint' }, t('heroSendHint')),
                      h(
                        'div',
                        { className: 'TWM_mFoot' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'TWM_btn',
                            'data-worktree-hero-create-now': 'true',
                            disabled: creatingNow,
                            onClick: handleCreateNow,
                          },
                          creatingNow ? t('heroCreatingNow') : t('heroCreateNow'),
                        ),
                      ),
                    )
                  : null,
                popError ? h('div', { className: 'TWM_err' }, popError) : null,
              )
            : null,
        )
      }

      const HeroWorktreeProgressDock = (props) => {
        const t = resolveTranslator(props?.t, ctx.locale)
        const sessionId = props?.sessionId
        const sessState = typeof props?.useSession === 'function'
          ? props.useSession((s) => (s ? { blank: Boolean(s.blank), running: Boolean(s.running) } : null))
          : null
        const _stageVer = React.useSyncExternalStore(stageStore.subscribe, stageStore.getVersion, stageStore.getVersion)
        const stage = sessionId ? stageStore.get(sessionId) : null
        const [acting, setActing] = React.useState(false)

        const submittedOrActive = Boolean(
          sessionId &&
          stage &&
          (stage.status === 'creating' || stage.status === 'error' || (stage.status === 'staged' && sessState && (!sessState.blank || sessState.running))),
        )

        React.useEffect(() => {
          if (!submittedOrActive) return undefined
          let active = true
          let timer = null
          const poll = () => {
            callManageRpc(ctx, 'session-stage', { sessionId })
              .then((res) => {
                if (active) stageStore.set(sessionId, res || null)
              })
              .catch(() => {})
              .finally(() => {
                if (active && typeof setTimeout === 'function') {
                  timer = setTimeout(poll, 350)
                }
              })
          }
          poll()
          return () => {
            active = false
            if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer)
          }
        }, [sessionId, submittedOrActive])

        if (!stage || stage.status === 'created') return null
        if (stage.status === 'staged' && (!sessState || (sessState.blank && !sessState.running))) {
          return null
        }

        if (stage.status === 'error') {
          const onRetry = async () => {
            if (acting) return
            setActing(true)
            try {
              const res = await callManageRpc(ctx, 'retry-stage', { sessionId })
              if (res?.stage) stageStore.set(sessionId, res.stage)
            } finally {
              setActing(false)
            }
          }
          const onCancelLocal = async () => {
            if (acting) return
            setActing(true)
            try {
              await callManageRpc(ctx, 'stage-session', { sessionId, enabled: false })
              stageStore.set(sessionId, null)
            } finally {
              setActing(false)
            }
          }
          return h(
            'div',
            { className: 'TWM_dock TWM_dockErr', 'data-worktree-progress-dock': 'error' },
            h(
              'div',
              { style: { minWidth: 0, flex: '1 1 200px' } },
              h('div', { style: { fontWeight: 600, color: '#dc2626' } }, t('dockErrorTitle')),
              stage.error ? h('div', { className: 'TWM_err' }, stage.error) : null,
            ),
            h(
              'div',
              { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              h('button', { type: 'button', className: 'TWM_btnPri', 'data-worktree-dock-retry': 'true', disabled: acting, onClick: onRetry }, t('dockRetry')),
              h('button', { type: 'button', className: 'TWM_btn', 'data-worktree-dock-cancel': 'true', disabled: acting, onClick: onCancelLocal }, t('dockCancelLocal')),
            ),
          )
        }

        const branchLabel = stage.resolvedBranch || stage.branch || t('heroAutoBranch')
        return h(
          'div',
          { className: 'TWM_dock', 'data-worktree-progress-dock': 'creating' },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { className: 'TWM_spinner', 'aria-hidden': 'true' }),
            h('span', null, t('dockCreating', { branch: branchLabel })),
          ),
        )
      }

      return { WorktreeManageOverlay, CreateWorktreeToolRow, HeroWorktreeOption, HeroWorktreeProgressDock }
    }

    exports.inject = ['connection', 'workspaces', 'uiWorkspace', 'sessions', 'sidebarRight', 'slots', 'locale', 'contextMenus']
    exports.apply = (ctx) => {
      ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALES), 'tune-worktree-manage: locale')
      ctx.effect(() => ensureStyle(), 'tune-worktree-manage: css')
      const store = createManageStore()
      const stageStore = createStageStore()
      const ui = createManageComponents(ctx, store, stageStore)
      const t = resolveTranslator(null, ctx.locale)
      let currentExtHost = null

      if (typeof ctx.inject === 'function') {
        ctx.inject(['tuneWorktreeUi'], (wtCtx) => {
          currentExtHost = wtCtx.tuneWorktreeUi
          wtCtx.effect(() => () => {
            if (currentExtHost === wtCtx.tuneWorktreeUi) currentExtHost = null
          }, 'tune-worktree-manage: clear-host')
          wtCtx.effect(() => wtCtx.tuneWorktreeUi.registerExtension({
            id: MODULE_ID,
            renderToolbarActions: (extApi) => {
              if (!extApi?.skel || extApi.skel.status !== 'ok') return null
              const { React } = loadReactDeps()
              if (!React) return null
              const h = React.createElement
              return h(
                'button',
                {
                  key: 'manage-create',
                  type: 'button',
                  className: 'TWM_btnPri TWM_btnSm',
                  'data-worktree-manage-create-btn': 'true',
                  onClick: () => store.openCreate({
                    path: extApi.targetPath,
                    mainPath: extApi.skel?.mainPath || extApi.targetPath,
                    repoName: extApi.skel?.repoName,
                    sessionMode: 'blank',
                    sourceSessionId: extApi.sessionId || null,
                    wslDistro: extApi.wslDistro,
                  }),
                },
                t('btnCreate'),
              )
            },
            renderSecondaryToolbarActions: (extApi) => {
              if (!extApi?.skel || extApi.skel.status !== 'ok') return null
              const hasPrunable = Array.isArray(extApi.skel.worktrees) && extApi.skel.worktrees.some((w) => w.prunable)
              if (!hasPrunable) return null
              const { React } = loadReactDeps()
              if (!React) return null
              return React.createElement(
                'button',
                {
                  key: 'manage-prune',
                  type: 'button',
                  className: 'TWM_btn TWM_btnWarn',
                  'data-worktree-manage-prune-btn': 'true',
                  onClick: () => store.openPrune({ path: extApi.targetPath }),
                },
                t('btnPrune'),
              )
            },
            renderDetailActions: (extApi) => {
              const wt = extApi?.selectedWt
              if (!wt || extApi?.skel?.status !== 'ok') return null
              const { React } = loadReactDeps()
              if (!React) return null
              const canForkFrom = !wt.bare && !wt.prunable && wt.exists !== false
              if (!canForkFrom) return null
              return React.createElement(
                'button',
                {
                  key: 'manage-fork',
                  type: 'button',
                  className: 'TWM_btn',
                  'data-worktree-manage-fork-btn': wt.path,
                  onClick: () => store.openCreate({
                    path: extApi.targetPath,
                    mainPath: extApi.skel?.mainPath || extApi.targetPath,
                    repoName: extApi.skel?.repoName,
                    baseRef: wt.branch || wt.head || '',
                    sessionMode: 'blank',
                    sourceSessionId: extApi.sessionId || null,
                    wslDistro: extApi.wslDistro,
                  }),
                },
                t('btnForkFrom'),
              )
            },
            renderDetailDangerActions: (extApi) => {
              const wt = extApi?.selectedWt
              if (!wt || extApi?.skel?.status !== 'ok') return null
              const { React } = loadReactDeps()
              if (!React) return null
              const h = React.createElement
              const isPrunable = !wt.isMain && !wt.bare && (wt.prunable || wt.exists === false)
              const canRemove = !wt.isMain && !wt.bare && !isPrunable
              if (!isPrunable && !canRemove) return null
              return h(
                React.Fragment,
                { key: 'manage-danger' },
                isPrunable
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'TWM_btn TWM_btnWarn',
                        'data-worktree-manage-prune-one-btn': wt.path,
                        onClick: () => store.openPrune({ path: extApi.targetPath }),
                      },
                      t('btnPruneOne'),
                    )
                  : null,
                canRemove
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'TWM_btn TWM_btnWarn',
                        'data-worktree-manage-remove-btn': wt.path,
                        onClick: () => store.openRemove({
                          path: extApi.targetPath,
                          wt,
                          wslDistro: extApi.wslDistro,
                        }),
                      },
                      t('btnDelete'),
                    )
                  : null,
              )
            },
            renderOverlay: (extApi) => {
              const { React } = loadReactDeps()
              if (!React || !ui?.WorktreeManageOverlay) return null
              return React.createElement(ui.WorktreeManageOverlay, { key: 'manage-overlay', extApi })
            },
          }), 'tune-worktree-manage: ui-extension')
        })
      }

      if (ui && ctx.slots) {
        ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview',
          key: TOOL_NAME,
          locale: LOCALE_NS,
        }, ui.CreateWorktreeToolRow)), 'tune-worktree-manage: tool-row')

        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options',
          id: 'tune.worktree.hero',
          order: 20,
          locale: LOCALE_NS,
        }, ui.HeroWorktreeOption)), 'tune-worktree-manage: hero-option')

        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'tune.worktree.progress',
          order: 5,
          locale: LOCALE_NS,
        }, ui.HeroWorktreeProgressDock)), 'tune-worktree-manage: progress-dock')
      }

      ctx.effect(() => ctx.contextMenus.register({
        id: 'worktree.manage.create',
        target: 'workspace',
        order: 355,
        observe: () => [ctx.locale],
        resolve: ({ path, workspaceId }) => [{
          id: 'worktree.manage.create',
          label: t('menuCreateWorkspace'),
          icon: { key: currentExtHost ? 'tune.worktree' : 'workspace.fork' },
          run: () => openWorktreeTabWithIntent(
            ctx,
            () => currentExtHost,
            { path, workspaceId },
            { kind: 'create', path, workspaceId, sessionMode: 'blank' },
          ),
        }],
      }), 'tune-worktree-manage: workspace-menu')

      ctx.effect(() => ctx.contextMenus.register({
        id: 'worktree.manage.forkToWorktree',
        target: 'session',
        order: 305,
        observe: () => [ctx.locale, ctx.sessions.list, ctx.workspaces.list],
        resolve: ({ sessionId }) => {
          const summary = ctx.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]
          const wsItems = ctx.workspaces?.list?.getSnapshot?.()?.items || []
          const ws = wsItems.find((w) => Array.isArray(w.sessionIds) && w.sessionIds.includes(sessionId))
          const path = summary?.cwd || ws?.path
          if (!path) return []
          return [{
            id: 'worktree.manage.forkToWorktree',
            label: t('menuForkSession'),
            icon: { key: 'workspace.fork' },
            run: () => openWorktreeTabWithIntent(
              ctx,
              () => currentExtHost,
              { path, workspaceId: ws?.workspaceId },
              { kind: 'create', path, workspaceId: ws?.workspaceId, sessionMode: 'fork', sourceSessionId: sessionId },
            ),
          }]
        },
      }), 'tune-worktree-manage: session-menu')

      ctx.effect(() => () => { store.dispose(); stageStore.dispose() }, 'tune-worktree-manage: cleanup')
    }

    exports.__internals = {
      MODULE_ID,
      RPC_CHANNEL,
      WORKTREE_KIND,
      TOOL_NAME,
      LOCALE_NS,
      LOCALES,
      formatText,
      sanitizeSlugClient,
      normalizePosixPath,
      previewWorktreePath,
      canonicalComparePath,
      formatPathForWorkspaceCreate,
      isGateAllowed,
      callManageRpc,
      postCreateNavigate,
      openWorktreeTabWithIntent,
      createManageStore,
      createStageStore,
      createManageComponents,
    }

    return exports
  },
})
