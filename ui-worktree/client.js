window.__ModuleLoader__.load({
  id: '@herenfor/dsh-tune-worktree',
  factory: (require) => {
    const exports = {}
    const MODULE_ID = '@herenfor/dsh-tune-worktree'
    const WORKTREE_KIND = 'worktree'
    const WORKTREE_ID = '@herenfor/dsh-tune-worktree'
    const RPC_CHANNEL = '/dsh-tune-worktree'
    const LOCALE_NS = 'tuneWorktree'
    const VIEW_MODE_STORAGE_KEY = 'dsh.tune.worktree.viewMode.v1'
    const RECENT_DIRS_STORAGE_KEY = 'dsh.tune.worktree.recentDirs.v1'
    const MAX_RECENT_DIRS = 8
    const STYLE_ID = '@herenfor/dsh-tune-worktree/ui.css'
    const NARROW_BREAKPOINT = 540
    const DEFAULT_COMMIT_LIMIT = 20
    const COMMIT_LIMIT_OPTIONS = [20, 35, 50]

    const LOCALES = {
      zh: {
        tabTitle: 'Worktree',
        guideTitle: 'Worktree 树',
        guideDesc: '查看 Git Worktree 派生关系、提交分叉与关联会话，一键切换工作区。',
        contextMenuViewTree: '查看 Worktree 树',
        headerBadgeTitle: '打开 Worktree 树视图（{branch}）',
        modeTree: 'Worktree 树',
        modeCommits: 'Commit 分叉图',
        refresh: '刷新',
        fitCenter: '居中',
        zoomIn: '放大',
        zoomOut: '缩小',
        loadingSkeleton: '正在扫描 Worktree 结构…',
        loadingDetails: '正在补充状态与派生关系…',
        loadingCommits: '正在按需加载近期提交分叉…',
        noWorkspace: '尚未选择目录，点击下方按钮选择任意本地或 WSL 文件夹。',
        missingDir: '目录不存在或已被移除：{path}',
        notGit: '当前目录不是 Git 仓库：{path}',
        bareOnly: '当前目录为 Git Bare 仓库（无检出工作区）。',
        submoduleBanner: '当前处于 Git Submodule 中（主仓：{root}）',
        rpcError: '加载 Worktree 状态失败',
        retry: '重试',
        badgeCurrent: '当前',
        badgeMain: '主干',
        badgeBare: 'Bare',
        badgeDetached: '游离 HEAD',
        badgeLocked: '已锁定',
        badgePrunable: '已缺失',
        badgeClean: '干净',
        cleanWorkingTree: '工作区干净',
        badgeDirty: '{count} 变更',
        sessionsCount: '{count} 会话',
        act_turn: '运行中',
        act_subagent: '子代理',
        act_job: '后台任务',
        act_schedule: '定时任务',
        enterWorktree: '进入 Worktree',
        enteringWorktree: '正在切换…',
        prunableBlocked: '该 Worktree 目录已不存在（可剪枝），无法切换。',
        bareBlocked: 'Bare 仓库没有工作区，无法直接切换。',
        switchFailed: '切换 Worktree 失败',
        detailStatus: '工作区状态',
        detailStaged: '暂存 {n}',
        detailUnstaged: '未暂存 {n}',
        detailUntracked: '未跟踪 {n}',
        detailConflicted: '冲突 {n}',
        detailCommits: '近期提交',
        detailSessions: '关联 DSH 会话',
        noCommits: '暂无提交记录',
        noSessions: '该 Worktree 暂无关联会话',
        openSessionHint: '点击切换到此会话',
        emptyCommits: '暂无可展示的提交分叉记录',
        commitLimitLabel: '近期 {n} 条',
        forkTag: '分叉点',
        mergeTag: '合并',
        detailCloseHint: '双击卡片或点击按钮切换',
        chooseDirectory: '选择目录',
        followSession: '跟随当前会话',
        pinnedDirHint: '已手动选择目录（点击切换或恢复跟随会话）',
        browseFolder: '浏览文件夹…',
        nativePicker: '系统弹窗',
        enterPathPlaceholder: '输入本地或 WSL 路径（支持 ~/...）',
        goPath: '打开',
        workspacesSection: 'DSH 工作区',
        recentSection: '最近目录',
        showHidden: '显示隐藏文件夹',
        selectCurrentDir: '选择此目录',
        parentDir: '上级',
        homeDir: '主目录',
        gitRepoTag: 'Git',
        openThisDir: '选中',
        noSubdirs: '此目录下没有子文件夹',
        truncatedHint: '仅显示前 {n} 个子目录',
        cancel: '取消',
        close: '关闭',
        pickAnotherDir: '选择其他目录…',
        loadingBrowser: '正在读取目录…',
      },
      en: {
        tabTitle: 'Worktree',
        guideTitle: 'Worktree Tree',
        guideDesc: 'Inspect Git worktree derivation, commit forks, and DSH sessions, then switch in one click.',
        contextMenuViewTree: 'View Worktree Tree',
        headerBadgeTitle: 'Open Worktree tree ({branch})',
        modeTree: 'Worktree Tree',
        modeCommits: 'Commit Fork Graph',
        refresh: 'Refresh',
        fitCenter: 'Center',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        loadingSkeleton: 'Scanning worktrees…',
        loadingDetails: 'Enriching status & derivation…',
        loadingCommits: 'Loading recent commit fork DAG…',
        noWorkspace: 'No directory selected yet. Choose any local or WSL folder below.',
        missingDir: 'Directory missing or removed: {path}',
        notGit: 'Not a Git repository: {path}',
        bareOnly: 'Bare Git repository with no checked-out worktrees.',
        submoduleBanner: 'Inside a Git submodule (superproject: {root})',
        rpcError: 'Failed to load worktree status',
        retry: 'Retry',
        badgeCurrent: 'Current',
        badgeMain: 'Main',
        badgeBare: 'Bare',
        badgeDetached: 'Detached',
        badgeLocked: 'Locked',
        badgePrunable: 'Missing',
        badgeClean: 'Clean',
        cleanWorkingTree: 'Working tree clean',
        badgeDirty: '{count} dirty',
        sessionsCount: '{count} sessions',
        act_turn: 'Running',
        act_subagent: 'Subagent',
        act_job: 'Job',
        act_schedule: 'Schedule',
        enterWorktree: 'Enter Worktree',
        enteringWorktree: 'Switching…',
        prunableBlocked: 'Worktree directory is missing (prunable) and cannot be opened.',
        bareBlocked: 'Bare repository has no working tree to open.',
        switchFailed: 'Failed to switch worktree',
        detailStatus: 'Working Tree',
        detailStaged: 'Staged {n}',
        detailUnstaged: 'Unstaged {n}',
        detailUntracked: 'Untracked {n}',
        detailConflicted: 'Conflicts {n}',
        detailCommits: 'Recent Commits',
        detailSessions: 'Associated DSH Sessions',
        noCommits: 'No commits yet',
        noSessions: 'No DSH sessions on this worktree',
        openSessionHint: 'Click to open session',
        emptyCommits: 'No commit history to plot',
        commitLimitLabel: 'Last {n}',
        forkTag: 'Fork',
        mergeTag: 'Merge',
        detailCloseHint: 'Double-click card or press button to enter',
        chooseDirectory: 'Choose directory',
        followSession: 'Follow session',
        pinnedDirHint: 'Manual directory active (click to change or follow session)',
        browseFolder: 'Browse folders…',
        nativePicker: 'OS picker',
        enterPathPlaceholder: 'Enter local or WSL path (~/...)',
        goPath: 'Open',
        workspacesSection: 'DSH Workspaces',
        recentSection: 'Recent Directories',
        showHidden: 'Show hidden',
        selectCurrentDir: 'Select Directory',
        parentDir: 'Up',
        homeDir: 'Home',
        gitRepoTag: 'Git',
        openThisDir: 'Select',
        noSubdirs: 'No subdirectories here',
        truncatedHint: 'Showing first {n} folders',
        cancel: 'Cancel',
        close: 'Close',
        pickAnotherDir: 'Choose directory…',
        loadingBrowser: 'Loading directory…',
      },
    }

    const readSavedViewMode = () => {
      try {
        if (typeof localStorage === 'undefined') return 'tree'
        const v = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
        return v === 'commits' ? 'commits' : 'tree'
      } catch {
        return 'tree'
      }
    }

    const writeSavedViewMode = (mode) => {
      const normalized = mode === 'commits' ? 'commits' : 'tree'
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(VIEW_MODE_STORAGE_KEY, normalized)
      } catch {}
      return normalized
    }

    const readRecentDirs = () => {
      try {
        if (typeof localStorage === 'undefined') return []
        const raw = localStorage.getItem(RECENT_DIRS_STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string' && x.trim().length > 0).slice(0, MAX_RECENT_DIRS) : []
      } catch {
        return []
      }
    }

    const pushRecentDir = (dirPath) => {
      if (typeof dirPath !== 'string' || !dirPath.trim()) return readRecentDirs()
      const trimmed = dirPath.trim()
      const key = canonicalComparePath(trimmed)
      const prev = readRecentDirs()
      const next = [trimmed, ...prev.filter((p) => canonicalComparePath(p) !== key)].slice(0, MAX_RECENT_DIRS)
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(RECENT_DIRS_STORAGE_KEY, JSON.stringify(next))
      } catch {}
      return next
    }

    const formatShortDirLabel = (p) => {
      if (typeof p !== 'string' || !p) return ''
      const clean = p.replace(/[\\/]+$/, '')
      if (!clean) return '/'
      const parts = clean.split(/[\\/]/)
      return parts[parts.length - 1] || clean
    }

    const ensureStyle = () => {
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = MODULE_ID
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = [
        '@keyframes twtFadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}',
        '@keyframes twtPopoverIn{from{opacity:0;transform:translateY(-4px) scale(.97)}to{opacity:1;transform:none}}',
        '@keyframes twtModalIn{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}',
        '@keyframes twtBackdropIn{from{opacity:0}to{opacity:1}}',
        '@keyframes twtSpin{to{transform:rotate(360deg)}}',
        '@keyframes twtPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.6}}',
        '@keyframes twtShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
        '.TWT_root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-size:12px}',
        '.TWT_header{position:relative;display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex-shrink:0}',
        '.TWT_barTop{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}',
        '.TWT_barSub{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}',
        '.TWT_barGrp{display:flex;align-items:center;gap:5px;min-width:0}',
        '.TWT_dirBtn{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;flex:1 1 auto;height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:600;cursor:pointer;text-align:left;transition:border-color .15s,background .15s,box-shadow .15s}',
        '.TWT_dirBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}',
        '.TWT_dirBtn[data-pinned="true"]{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 55%,var(--dsw-alias-border-l2))}',
        '.TWT_dirName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;min-width:0}',
        '.TWT_countChip{font-size:10px;font-weight:600;padding:0 5px;line-height:16px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);flex-shrink:0}',
        '.TWT_pinDot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#3b82f6);flex-shrink:0}',
        '.TWT_chev{flex-shrink:0;margin-left:auto;color:var(--dsw-alias-label-tertiary);transition:transform .16s ease}',
        '.TWT_chev[data-open="true"]{transform:rotate(180deg)}',
        '.TWT_seg{display:inline-flex;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:2px;gap:2px}',
        '.TWT_segBtn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,box-shadow .15s}',
        '.TWT_segBtn[data-active="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.1)}',
        '.TWT_iconBtn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:7px;height:26px;padding:0 8px;font:inherit;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;transition:background .14s,border-color .14s,color .14s}',
        '.TWT_iconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}',
        '.TWT_iconBtn:disabled{opacity:.45;cursor:not-allowed}',
        '.TWT_refreshBtn{width:28px;height:28px;padding:0;justify-content:center;flex-shrink:0}',
        '.TWT_spinning svg{animation:twtSpin .9s linear infinite}',
        '.TWT_priBtn{border:0;border-radius:7px;height:28px;padding:0 11px;background:var(--dsw-alias-state-business-primary,var(--dsw-static-blue-600,#3b82f6));color:#fff;font:inherit;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;transition:filter .14s,transform .12s}',
        '.TWT_priBtn:hover:not(:disabled){filter:brightness(1.08)}',
        '.TWT_priBtn:active:not(:disabled){transform:scale(.98)}',
        '.TWT_priBtn:disabled{opacity:.45;cursor:not-allowed}',
        '.TWT_popover{position:absolute;top:40px;left:10px;right:10px;max-height:380px;overflow:auto;z-index:25;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l3);border-radius:11px;padding:10px;box-shadow:0 12px 28px rgba(0,0,0,.26);display:flex;flex-direction:column;gap:8px;transform-origin:top left;animation:twtPopoverIn .16s cubic-bezier(.2,.8,.2,1)}',
        '.TWT_popForm{display:flex;align-items:center;gap:6px}',
        '.TWT_input{flex:1 1 auto;min-width:0;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:5px 8px;font:inherit;font-size:11px;outline:none;transition:border-color .14s}',
        '.TWT_input:focus{border-color:var(--dsw-alias-state-business-primary,#3b82f6)}',
        '.TWT_popActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
        '.TWT_popSec{display:flex;flex-direction:column;gap:3px}',
        '.TWT_popLabel{font-size:10px;font-weight:600;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.03em;padding:2px 4px}',
        '.TWT_popRow{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:5px 7px;font:inherit;font-size:11px;cursor:pointer;transition:background .12s,border-color .12s}',
        '.TWT_popRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.TWT_popRow[data-active="true"]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);font-weight:600}',
        '.TWT_popRowTxt{min-width:0;flex:1 1 auto;display:flex;flex-direction:column;gap:1px}',
        '.TWT_popRowTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.TWT_popRowSub{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.TWT_banner{padding:5px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}',
        '.TWT_main{flex:1 1 auto;min-height:0;overflow:auto;position:relative}',
        '.TWT_treeList{padding:10px;display:flex;flex-direction:column;gap:7px}',
        '.TWT_treeRow{display:flex;align-items:stretch;min-width:0}',
        '.TWT_gutter{flex:0 0 auto;display:block}',
        '.TWT_cardWrap{flex:1 1 auto;min-width:0}',
        '.TWT_card{position:relative;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:9px 11px 9px 13px;cursor:pointer;transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease;display:flex;flex-direction:column;gap:4px;text-align:left;width:100%;box-sizing:border-box;color:inherit;font:inherit}',
        '.TWT_card::before{content:"";position:absolute;left:0;top:7px;bottom:7px;width:3px;border-radius:0 3px 3px 0;background:transparent;transition:background .15s ease}',
        '.TWT_card:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);transform:translateY(-1px);box-shadow:0 3px 10px rgba(0,0,0,.08)}',
        '.TWT_card[data-current="true"]{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}',
        '.TWT_card[data-current="true"]::before{background:#10b981}',
        '.TWT_card[data-selected="true"]{border-color:var(--dsw-alias-state-business-primary,var(--dsw-static-blue-600,#3b82f6));box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary,var(--dsw-static-blue-600,#3b82f6))}',
        '.TWT_card[data-selected="true"]::before{background:var(--dsw-alias-state-business-primary,var(--dsw-static-blue-600,#3b82f6))}',
        '.TWT_card[data-prunable="true"]{opacity:.72;border-style:dashed}',
        '.TWT_cardTop{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}',
        '.TWT_branchWrap{display:flex;align-items:center;gap:5px;min-width:0;font-weight:600;font-size:13px;letter-spacing:-0.01em}',
        '.TWT_branch{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.TWT_pills{display:flex;align-items:center;gap:4px;flex-wrap:wrap}',
        '.TWT_pill{font-size:10px;line-height:1.45;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);white-space:nowrap}',
        '.TWT_quietTag{font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
        '.TWT_pillCur{color:var(--dsw-alias-state-business-primary,#3b82f6);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 55%,transparent);font-weight:600}',
        '.TWT_pillWarn{color:#d97706;border-color:rgba(217,119,6,.45)}',
        '.TWT_pillErr{color:#dc2626;border-color:rgba(220,38,38,.45)}',
        '.TWT_pillLive{color:#059669;border-color:rgba(5,150,105,.45);display:inline-flex;align-items:center;gap:4px;font-weight:600}',
        '.TWT_gitTag{font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;background:rgba(16,185,129,.12);color:#059669;border:1px solid rgba(16,185,129,.35);flex-shrink:0}',
        '.TWT_dot{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0}',
        '.TWT_dotDirty{background:#f59e0b}',
        '.TWT_dotLive{background:#10b981;animation:twtPulse 1.8s ease-in-out infinite}',
        '.TWT_path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.TWT_metaRow{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary);min-height:16px}',
        '.TWT_canvas{position:relative;width:100%;height:100%;min-height:220px;overflow:hidden;cursor:grab;user-select:none;touch-action:none}',
        '.TWT_canvas[data-panning="true"]{cursor:grabbing}',
        '.TWT_stage{position:absolute;left:0;top:0;transform-origin:0 0}',
        '.TWT_stageSvg{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}',
        '.TWT_stageNode{position:absolute}',
        '.TWT_detail{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);padding:10px 12px;max-height:46%;overflow:auto;flex-shrink:0;display:flex;flex-direction:column;gap:8px;animation:twtFadeUp .18s ease-out}',
        '.TWT_detailHead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}',
        '.TWT_enterBtn{border:0;border-radius:7px;background:var(--dsw-alias-state-business-primary,var(--dsw-static-blue-600,#3b82f6));color:#fff;font:inherit;font-size:11px;font-weight:600;padding:6px 12px;cursor:pointer;white-space:nowrap;transition:filter .14s,transform .12s}',
        '.TWT_enterBtn:hover:not(:disabled){filter:brightness(1.08)}',
        '.TWT_enterBtn:active:not(:disabled){transform:scale(.98)}',
        '.TWT_enterBtn:disabled{opacity:.45;cursor:not-allowed}',
        '.TWT_detailGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}',
        '.TWT_detailFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:7px;border-top:1px solid var(--dsw-alias-border-l2)}',
        '.TWT_secTitle{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:4px}',
        '.TWT_list{display:flex;flex-direction:column;gap:4px}',
        '.TWT_commitRow{display:flex;align-items:baseline;gap:6px;font-size:11px;min-width:0}',
        '.TWT_sha{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);flex-shrink:0}',
        '.TWT_subj{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}',
        '.TWT_sessBtn{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;text-align:left;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:7px;padding:5px 8px;font:inherit;font-size:11px;cursor:pointer;transition:background .12s,border-color .12s}',
        '.TWT_sessBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}',
        '.TWT_dag{padding:10px;min-width:340px;animation:twtFadeUp .18s ease-out}',
        '.TWT_dagRow{display:flex;align-items:center;gap:8px;height:46px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
        '.TWT_state{padding:28px 16px;text-align:center;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;align-items:center;gap:10px;animation:twtFadeUp .18s ease-out}',
        '.TWT_skeletonList{padding:12px;display:flex;flex-direction:column;gap:8px}',
        '.TWT_skeletonCard{height:58px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:linear-gradient(90deg,var(--dsw-alias-bg-layer-1) 25%,var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover)) 50%,var(--dsw-alias-bg-layer-1) 75%);background-size:200% 100%;animation:twtShimmer 1.3s ease-in-out infinite}',
        '.TWT_modalBackdrop{position:absolute;inset:0;background:rgba(0,0,0,.42);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:12px;z-index:30;animation:twtBackdropIn .15s ease-out}',
        '.TWT_browserModal{width:100%;max-width:440px;max-height:92%;display:flex;flex-direction:column;gap:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l3);border-radius:12px;padding:12px;box-shadow:0 16px 36px rgba(0,0,0,.3);animation:twtModalIn .18s cubic-bezier(.2,.8,.2,1);color:var(--dsw-alias-label-primary)}',
        '.TWT_browserList{flex:1 1 auto;min-height:140px;max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:3px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px;background:var(--dsw-alias-bg-layer-1)}',
        '.TWT_dirEntry{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;border-radius:6px;transition:background .12s}',
        '.TWT_dirEntry:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.TWT_dirEntryBtn{display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer;padding:2px 0}',
        '.TWT_hdrBadge{display:inline-flex;align-items:center;gap:5px;max-width:170px;height:24px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;transition:background .14s,color .14s,border-color .14s}',
        '.TWT_hdrBadge:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}',
        '.TWT_hdrBranch{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.TWT_errText{color:#dc2626;font-size:11px}',
        '@media (prefers-reduced-motion:reduce){.TWT_card,.TWT_popover,.TWT_modalBackdrop,.TWT_browserModal,.TWT_detail,.TWT_dag,.TWT_state,.TWT_chev,.TWT_dotLive,.TWT_spinning svg,.TWT_skeletonCard,.TWT_priBtn,.TWT_enterBtn{animation:none !important;transition:none !important;transform:none !important}}',
      ].join('')
      document.head.appendChild(tag)
    }

    const formatLocaleText = (dict, key, vars) => {
      let str = (dict && Object.hasOwn(dict, key) ? dict[key] : null) ?? LOCALES.en[key] ?? key
      if (vars && typeof vars === 'object') {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, String(v ?? ''))
        }
      }
      return str
    }

    const buildTreeStructure = (worktrees, parentByPath = {}) => {
      const list = Array.isArray(worktrees) ? worktrees : []
      if (list.length === 0) return { roots: [], childrenMap: new Map(), byPath: new Map() }
      const byPath = new Map(list.map((w) => [w.path, w]))
      const childrenMap = new Map(list.map((w) => [w.path, []]))
      const roots = []
      for (const wt of list) {
        const p = parentByPath[wt.path] ?? wt.parentPath ?? null
        if (p && p !== wt.path && byPath.has(p)) {
          childrenMap.get(p).push(wt)
        } else {
          roots.push(wt)
        }
      }
      roots.sort((a, b) => (a.isMain === b.isMain ? (a.path < b.path ? -1 : 1) : (a.isMain ? -1 : 1)))
      for (const kids of childrenMap.values()) {
        kids.sort((a, b) => {
          if (Boolean(a.isCurrent) !== Boolean(b.isCurrent)) return a.isCurrent ? -1 : 1
          const la = a.branch || a.relativePath || a.path
          const lb = b.branch || b.relativePath || b.path
          return la < lb ? -1 : la > lb ? 1 : 0
        })
      }
      return { roots, childrenMap, byPath }
    }

    const computeCompactTreeLayout = (worktrees, parentByPath = {}) => {
      const { roots, childrenMap } = buildTreeStructure(worktrees, parentByPath)
      const rows = []
      const visited = new Set()
      const walk = (node, depth, isLastSibling, ancestorHasNext) => {
        if (visited.has(node.path)) return
        visited.add(node.path)
        rows.push({ wt: node, depth, parentPath: parentByPath[node.path] ?? node.parentPath ?? null, isLastSibling, ancestorHasNext })
        const kids = childrenMap.get(node.path) || []
        kids.forEach((child, idx) => {
          const nextAnc = depth === 0 ? ancestorHasNext : [...ancestorHasNext, !isLastSibling]
          walk(child, depth + 1, idx === kids.length - 1, nextAnc)
        })
      }
      roots.forEach((root, idx) => walk(root, 0, idx === roots.length - 1, []))
      return rows
    }

    const computeCanvas2DLayout = (worktrees, parentByPath = {}) => {
      const CARD_W = 248
      const CARD_H = 104
      const COL_GAP = 56
      const ROW_GAP = 20
      const PAD = 24
      const { roots, childrenMap } = buildTreeStructure(worktrees, parentByPath)
      if (roots.length === 0) return { nodes: [], edges: [], bounds: { width: 320, height: 220 } }

      const visited = new Set()
      const subtreeSpan = new Map()
      const measureSpan = (node) => {
        if (visited.has(node.path)) return 1
        visited.add(node.path)
        const kids = (childrenMap.get(node.path) || []).filter((k) => !visited.has(k.path))
        if (kids.length === 0) {
          subtreeSpan.set(node.path, 1)
          return 1
        }
        let sum = 0
        for (const k of kids) sum += measureSpan(k)
        const span = Math.max(1, sum)
        subtreeSpan.set(node.path, span)
        return span
      }
      for (const r of roots) measureSpan(r)

      const nodes = []
      const nodeByPath = new Map()
      const placed = new Set()
      const place = (node, depth, slotStart) => {
        if (placed.has(node.path)) return
        placed.add(node.path)
        const span = subtreeSpan.get(node.path) || 1
        const centerSlot = slotStart + (span - 1) / 2
        const x = PAD + depth * (CARD_W + COL_GAP)
        const y = PAD + centerSlot * (CARD_H + ROW_GAP)
        const entry = {
          wt: node,
          x,
          y,
          width: CARD_W,
          height: CARD_H,
          depth,
          parentPath: parentByPath[node.path] ?? node.parentPath ?? null,
        }
        nodes.push(entry)
        nodeByPath.set(node.path, entry)
        let cursor = slotStart
        for (const k of childrenMap.get(node.path) || []) {
          if (placed.has(k.path)) continue
          const kSpan = subtreeSpan.get(k.path) || 1
          place(k, depth + 1, cursor)
          cursor += kSpan
        }
      }

      let rootSlot = 0
      for (const r of roots) {
        place(r, 0, rootSlot)
        rootSlot += subtreeSpan.get(r.path) || 1
      }

      const edges = []
      for (const item of nodes) {
        if (!item.parentPath || !nodeByPath.has(item.parentPath)) continue
        const p = nodeByPath.get(item.parentPath)
        const x1 = p.x + p.width
        const y1 = p.y + p.height / 2
        const x2 = item.x
        const y2 = item.y + item.height / 2
        const dx = Math.max(24, (x2 - x1) * 0.5)
        edges.push({
          from: p.wt.path,
          to: item.wt.path,
          x1,
          y1,
          x2,
          y2,
          pathD: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        })
      }

      const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + PAD
      const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + PAD
      return { nodes, edges, bounds: { width: maxX, height: maxY } }
    }

    const DAG_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']

    const computeCommitDagLayout = (dag) => {
      const ROW_H = 46
      const LANE_W = 18
      const PAD_X = 16
      const PAD_Y = 23
      const nodes = Array.isArray(dag?.nodes) ? dag.nodes : []
      const edges = Array.isArray(dag?.edges) ? dag.edges : []
      const laneCount = Math.max(1, dag?.laneCount || 1)
      const rowByHash = new Map()
      const placedNodes = nodes.map((node, index) => {
        const cx = PAD_X + (node.lane || 0) * LANE_W
        const cy = PAD_Y + index * ROW_H
        const row = { ...node, index, cx, cy, color: DAG_COLORS[(node.lane || 0) % DAG_COLORS.length] }
        rowByHash.set(node.hash, row)
        return row
      })

      const placedEdges = []
      for (const edge of edges) {
        const fromNode = rowByHash.get(edge.from)
        const toNode = rowByHash.get(edge.to)
        if (!fromNode || !toNode) continue
        const x1 = fromNode.cx
        const y1 = fromNode.cy
        const x2 = toNode.cx
        const y2 = toNode.cy
        const midY = (y1 + y2) / 2
        const pathD = x1 === x2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
        placedEdges.push({
          ...edge,
          x1,
          y1,
          x2,
          y2,
          pathD,
          color: DAG_COLORS[(edge.fromLane === edge.toLane ? edge.fromLane : Math.max(edge.fromLane, edge.toLane)) % DAG_COLORS.length],
        })
      }

      const graphWidth = PAD_X * 2 + Math.max(0, laneCount - 1) * LANE_W
      const graphHeight = Math.max(ROW_H, nodes.length * ROW_H)
      return { nodes: placedNodes, edges: placedEdges, graphWidth, graphHeight, rowHeight: ROW_H }
    }

    const normClientPath = (p) => (typeof p === 'string' && p.length > 1 ? p.replace(/\/+$/, '') : p)

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
      const uncRef = typeof referencePath === 'string'
        ? /^[\\/]{2}(wsl\.localhost|wsl\$)[\\/]([^\\/]+)/i.exec(referencePath)
        : null
      const winDriveRef = typeof referencePath === 'string' && /^[A-Za-z]:[\\/]/.test(referencePath)
      if (!uncRef && !winDriveRef) return posixPath

      const mnt = /^\/mnt\/([a-z])(?:\/(.*))?$/i.exec(posixPath)
      if (mnt) {
        const tail = (mnt[2] ?? '').replace(/\//g, '\\')
        return `${mnt[1].toUpperCase()}:\\${tail}`
      }
      if (uncRef) {
        return `\\\\${uncRef[1]}\\${uncRef[2]}${posixPath.replace(/\//g, '\\')}`
      }
      if (wslDistro) {
        return `\\\\wsl.localhost\\${wslDistro}${posixPath.replace(/\//g, '\\')}`
      }
      return posixPath
    }

    const mergeWorktreeSessions = (wt, workspaceSnap, sessionSnap, hostActivities = {}, claimedElsewhere = null) => {
      const wsItems = Array.isArray(workspaceSnap?.items) ? workspaceSnap.items : []
      const archived = new Set(Array.isArray(workspaceSnap?.archivedSessionIds) ? workspaceSnap.archivedSessionIds : [])
      const pinned = new Set(Array.isArray(workspaceSnap?.pinnedSessionIds) ? workspaceSnap.pinnedSessionIds : [])
      const byId = sessionSnap?.byId || {}

      const wtPaths = new Set([canonicalComparePath(wt?.path), canonicalComparePath(wt?.realPath)].filter(Boolean))
      const matchedWs =
        wsItems.find((w) => wt?.workspaceId && w.workspaceId === wt.workspaceId) ||
        wsItems.find((w) => wtPaths.has(canonicalComparePath(w.path))) ||
        null

      const explicitIds = new Set(wt?.sessionIds || [])
      const candidateIds = new Set(explicitIds)
      for (const sid of matchedWs?.sessionIds || []) {
        if (!claimedElsewhere || !claimedElsewhere.has(sid) || explicitIds.has(sid)) {
          candidateIds.add(sid)
        }
      }
      for (const s of Object.values(byId)) {
        if (!s || !s.id) continue
        if (claimedElsewhere && claimedElsewhere.has(s.id) && !explicitIds.has(s.id)) continue
        if (s.cwd && wtPaths.has(canonicalComparePath(s.cwd))) candidateIds.add(s.id)
      }

      const sessions = []
      const activityCounts = { turn: 0, subagent: 0, job: 0, schedule: 0 }
      for (const sid of candidateIds) {
        if (archived.has(sid)) continue
        const summary = byId[sid]
        const isMainView = Boolean((summary?.retainedBy?.mainView ?? 0) > 0)
        if (summary?.blank && !isMainView) continue
        const rawActs = Array.isArray(hostActivities?.[sid]) ? hostActivities[sid] : []
        const kinds = new Set(rawActs.map((a) => a.kind).filter(Boolean))
        if (summary?.running && !kinds.has('turn')) kinds.add('turn')
        for (const k of kinds) {
          if (Object.hasOwn(activityCounts, k)) activityCounts[k] += 1
        }
        const running = Boolean(summary?.running || kinds.size > 0)
        sessions.push({
          id: sid,
          title: summary?.displayTitle || summary?.title || sid,
          running,
          isMainView,
          pinned: pinned.has(sid),
          updatedAt: summary?.updatedAt || 0,
          activities: [...kinds],
        })
      }

      sessions.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (a.running !== b.running) return a.running ? -1 : 1
        if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
        return a.id < b.id ? -1 : 1
      })

      return {
        workspaceId: matchedWs?.workspaceId ?? wt?.workspaceId ?? null,
        sessions,
        runningCount: sessions.filter((s) => s.running).length,
        activityCounts,
      }
    }

    const openWorktreeTarget = async ({ wt, workspaces, uiWorkspace, referencePath, wslDistro }) => {
      if (!wt || wt.prunable || wt.exists === false) return { ok: false, reason: 'prunable' }
      if (wt.bare) return { ok: false, reason: 'bare' }
      const targetPath = wt.realPath || wt.path
      const targetKey = canonicalComparePath(targetPath)
      const rawKey = canonicalComparePath(wt.path)
      const items = workspaces?.list?.getSnapshot?.()?.items || []
      const existing =
        items.find((w) => wt.workspaceId && w.workspaceId === wt.workspaceId) ||
        items.find((w) => {
          const wk = canonicalComparePath(w.path)
          return wk === targetKey || wk === rawKey
        })

      if (existing) {
        await uiWorkspace.openWorkspace(existing.workspaceId)
        return { ok: true, workspaceId: existing.workspaceId, created: false }
      }
      const createPath = formatPathForWorkspaceCreate(targetPath, { referencePath, wslDistro })
      const created = await workspaces.create({ path: createPath })
      await uiWorkspace.openWorkspace(created.workspaceId)
      return { ok: true, workspaceId: created.workspaceId, created: true }
    }

    const openWorktreeTab = async (ctx, params) => {
      const openOpts = params ? { params } : undefined
      try {
        ctx.sidebarRight.openTab(WORKTREE_KIND, openOpts)
        return true
      } catch (err) {
        const msg = String(err?.message || err)
        if (!msg.includes('no session surface is mounted') || !params?.workspaceId || !ctx.uiWorkspace?.openWorkspace) {
          throw err
        }
        await ctx.uiWorkspace.openWorkspace(params.workspaceId)
        const delays = [0, 40, 120, 300]
        for (const ms of delays) {
          if (ms > 0) await new Promise((r) => setTimeout(r, ms))
          try {
            ctx.sidebarRight.openTab(WORKTREE_KIND, openOpts)
            return true
          } catch {}
        }
        return false
      }
    }

    const callWorktreeRpc = async (ctx, endpoint, payload, signal) => {
      const rpc = ctx?.connection?.rpc
      if (!rpc || typeof rpc.call !== 'function') throw new Error('Connection RPC unavailable')
      const res = await rpc.call(RPC_CHANNEL, endpoint, payload, signal)
      if (!res || res.ok !== true) {
        throw new Error(res?.error?.message || res?.error?.code || 'Worktree RPC failed')
      }
      return res.value
    }

    const createWorktreeController = (ctx) => {
      const summaryCache = new Map()
      const listeners = new Set()
      let refreshSeq = 0

      const emit = () => {
        for (const fn of [...listeners]) {
          try { fn() } catch {}
        }
      }

      const fetchSummary = async (path, signal) => {
        if (!path) return null
        const value = await callWorktreeRpc(ctx, 'summary', { path }, signal)
        summaryCache.set(path, value)
        emit()
        return value
      }

      const notifyRefreshed = (path) => {
        refreshSeq += 1
        if (path) summaryCache.delete(path)
        emit()
      }

      return {
        getSummary: (path) => summaryCache.get(path) || null,
        getRefreshSeq: () => refreshSeq,
        fetchSummary,
        notifyRefreshed,
        subscribe: (fn) => {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
        dispose: () => {
          summaryCache.clear()
          listeners.clear()
        },
      }
    }

    const createWorktreeExtensionHost = () => {
      const extensions = new Map()
      const listeners = new Set()
      let pendingIntent = null
      let intentSeq = 0
      let snapshot = { extensions: [], pendingIntent: null }

      const publish = () => {
        snapshot = { extensions: [...extensions.values()], pendingIntent }
        for (const fn of [...listeners]) {
          try { fn() } catch {}
        }
      }

      const registerExtension = (ext) => {
        if (!ext || typeof ext.id !== 'string' || !ext.id) {
          throw new Error('tuneWorktreeUi extension requires an id')
        }
        extensions.set(ext.id, ext)
        publish()
        return () => {
          if (extensions.get(ext.id) === ext) {
            extensions.delete(ext.id)
            publish()
          }
        }
      }

      const requestIntent = (intent) => {
        intentSeq += 1
        pendingIntent = intent ? { ...intent, seq: intentSeq } : null
        publish()
      }

      const consumeIntent = () => {
        const cur = pendingIntent
        if (cur !== null) {
          pendingIntent = null
          publish()
        }
        return cur
      }

      const getSnapshot = () => snapshot
      const subscribe = (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      }
      const dispose = () => {
        extensions.clear()
        pendingIntent = null
        listeners.clear()
        snapshot = { extensions: [], pendingIntent: null }
      }

      return { registerExtension, requestIntent, consumeIntent, getSnapshot, subscribe, dispose }
    }

    const loadReactDeps = () => {
      let React = null
      let prim = null
      try { React = require('react') } catch {}
      try { prim = require('@deepseek-ai/dsh-client-ui-primitives') } catch {}
      return { React, prim }
    }

    const resolveTranslator = (propsT, ctxLocale) => {
      return (key, vars) => {
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
        const dict = lang.startsWith('en') ? LOCALES.en : LOCALES.zh
        return formatLocaleText(dict, key, vars)
      }
    }

    const createWorktreeComponents = (ctx, ctrl, extHost) => {
      const { React, prim } = loadReactDeps()
      if (!React || typeof React.createElement !== 'function') return null
      const h = React.createElement
      const workspaceSource = ctx.workspaces.list
      const sessionSource = ctx.sessions.list
      const subscribeWorkspaces = workspaceSource.subscribe.bind(workspaceSource)
      const getWorkspaces = workspaceSource.getSnapshot.bind(workspaceSource)
      const subscribeSessions = sessionSource.subscribe.bind(sessionSource)
      const getSessions = sessionSource.getSnapshot.bind(sessionSource)

      const BranchGlyph = ({ size = 14, className }) => h(
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

      const FolderGlyph = ({ size = 14, className }) => h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.45', strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': 'true' },
        h('path', { d: 'M2 4.2A1.2 1.2 0 0 1 3.2 3h2.9l1.3 1.5h5.4A1.2 1.2 0 0 1 14 5.7v6.1a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 11.8V4.2Z' }),
      )

      const RefreshGlyph = ({ size = 13, className }) => h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': 'true' },
        h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.35-3.6' }),
        h('path', { d: 'M13.5 2.5v2.9h-2.9' }),
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

      const HomeGlyph = ({ size = 12 }) => h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M2.5 7.5 8 2.8l5.5 4.7' }),
        h('path', { d: 'M4.5 6.8v6.2h7V6.8' }),
      )

      const UpGlyph = ({ size = 12 }) => h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M8 12.5V4M4.5 7.2 8 3.7l3.5 3.5' }),
      )

      const WorktreeGuideIcon = ({ size = 22, className }) => h(BranchGlyph, { size, className })
      const ContextMenuWorktreeIcon = () => h(BranchGlyph, { size: 14 })

      const WorktreeTabTitle = (props) => {
        const t = resolveTranslator(props?.t, ctx.locale)
        const info = typeof props?.useTabInfo === 'function' ? props.useTabInfo() : null
        return h(
          React.Fragment,
          null,
          h(BranchGlyph, { size: 14, className: undefined }),
          h('span', { style: { marginLeft: '5px' } }, info?.tab?.title || t('tabTitle')),
        )
      }

      const WorktreeHeaderBadge = (props) => {
        const t = resolveTranslator(props?.t, ctx.locale)
        const sessionId = props?.sessionId
        const liveCwd = typeof props?.useProjection === 'function' ? props.useProjection('workingDirectory') : undefined
        const sessionCwd = typeof props?.useSessions === 'function'
          ? props.useSessions((s) => (sessionId ? s?.byId?.[sessionId]?.cwd : undefined))
          : ctx.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
        const cwd = liveCwd || sessionCwd
        const hidden = typeof props?.useSession === 'function'
          ? props.useSession((s) => !s || Boolean(s.removed) || Boolean(s.blank))
          : false

        const [summary, setSummary] = React.useState(() => (cwd ? ctrl.getSummary(cwd) : null))
        const refreshSeq = React.useSyncExternalStore(ctrl.subscribe, ctrl.getRefreshSeq, ctrl.getRefreshSeq)

        React.useEffect(() => {
          if (hidden || !cwd) {
            setSummary(null)
            return undefined
          }
          const ac = typeof AbortController === 'function' ? new AbortController() : null
          let active = true
          ctrl.fetchSummary(cwd, ac?.signal).then((val) => {
            if (active) setSummary(val)
          }).catch(() => {
            if (active) setSummary(null)
          })
          return () => {
            active = false
            ac?.abort?.()
          }
        }, [sessionId, cwd, hidden, refreshSeq])

        if (hidden || !cwd || !summary || !summary.isGitRepo) return null
        const branchText = summary.branch || summary.shortHead || t('badgeDetached')
        const title = t('headerBadgeTitle', { branch: branchText })
        const onClick = () => {
          const wsItems = ctx.workspaces?.list?.getSnapshot?.()?.items || []
          const cwdKey = canonicalComparePath(cwd)
          const matched = wsItems.find((w) => canonicalComparePath(w.path) === cwdKey)
          void openWorktreeTab(ctx, { path: cwd, workspaceId: matched?.workspaceId }).catch(() => {})
        }

        const btn = h(
          'button',
          {
            type: 'button',
            className: 'TWT_hdrBadge',
            'data-tune-worktree-badge': 'true',
            'aria-label': title,
            title,
            onClick,
          },
          h(BranchGlyph, { size: 12 }),
          h('span', { className: 'TWT_hdrBranch' }, branchText),
          summary.dirtyCount > 0 ? h('span', { className: 'TWT_dot TWT_dotDirty', 'aria-hidden': 'true' }) : null,
        )
        return prim?.Tooltip ? h(prim.Tooltip, { label: title, side: 'bottom', delayMs: 500 }, btn) : btn
      }

      const DirectoryPickerPopover = ({
        open,
        targetPath,
        skel,
        worktreeCount,
        isPinnedManual,
        effectiveSessionCwd,
        workspaces,
        recentDirs,
        pathDraft,
        onToggleOpen,
        onPathDraftChange,
        onSubmitPath,
        onFollowSession,
        onOpenBrowser,
        onSelectDirectory,
        t,
      }) => {
        const displayName = skel?.repoName || formatShortDirLabel(targetPath) || t('chooseDirectory')
        const activeKey = canonicalComparePath(targetPath || '')
        const wsItems = Array.isArray(workspaces) ? workspaces.filter((w) => w && typeof w.path === 'string' && w.path) : []
        const wsKeys = new Set(wsItems.map((w) => canonicalComparePath(w.path)))
        const dedupRecent = (Array.isArray(recentDirs) ? recentDirs : []).filter((p) => p && !wsKeys.has(canonicalComparePath(p)))
        const showFollow = Boolean(isPinnedManual && effectiveSessionCwd)

        return h(
          React.Fragment,
          null,
          h(
            'button',
            {
              type: 'button',
              className: 'TWT_dirBtn',
              'data-worktree-dir-trigger': 'true',
              'data-pinned': isPinnedManual ? 'true' : 'false',
              'aria-expanded': open ? 'true' : 'false',
              title: isPinnedManual ? `${t('pinnedDirHint')}: ${targetPath || ''}` : (skel?.mainPath || targetPath || t('chooseDirectory')),
              onClick: onToggleOpen,
            },
            h(FolderGlyph, { size: 14 }),
            isPinnedManual ? h('span', { className: 'TWT_pinDot', 'aria-hidden': 'true' }) : null,
            h('span', { className: 'TWT_dirName' }, displayName),
            worktreeCount > 0 ? h('span', { className: 'TWT_countChip' }, String(worktreeCount)) : null,
            h(ChevronGlyph, { size: 12, className: 'TWT_chev', open }),
          ),
          open
            ? h(
                'div',
                { className: 'TWT_popover', 'data-worktree-dir-popover': 'true', role: 'dialog' },
                h(
                  'form',
                  {
                    className: 'TWT_popForm',
                    onSubmit: (e) => {
                      e.preventDefault()
                      onSubmitPath(pathDraft)
                    },
                  },
                  h('input', {
                    type: 'text',
                    className: 'TWT_input',
                    'data-worktree-dir-input': 'true',
                    value: pathDraft,
                    placeholder: t('enterPathPlaceholder'),
                    onChange: (e) => onPathDraftChange(e.target.value),
                  }),
                  h('button', { type: 'submit', className: 'TWT_iconBtn', 'data-worktree-dir-go': 'true' }, t('goPath')),
                ),
                h(
                  'div',
                  { className: 'TWT_popActions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'TWT_priBtn',
                      style: { height: '25px', padding: '0 9px' },
                      'data-worktree-dir-browse': 'true',
                      onClick: onOpenBrowser,
                    },
                    h(FolderGlyph, { size: 12 }),
                    t('browseFolder'),
                  ),
                  showFollow
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'TWT_iconBtn',
                          'data-worktree-dir-follow': 'true',
                          onClick: onFollowSession,
                        },
                        t('followSession'),
                      )
                    : null,
                ),
                wsItems.length > 0
                  ? h(
                      'div',
                      { className: 'TWT_popSec' },
                      h('div', { className: 'TWT_popLabel' }, t('workspacesSection')),
                      ...wsItems.map((ws) => {
                        const isActive = canonicalComparePath(ws.path) === activeKey
                        return h(
                          'button',
                          {
                            key: ws.workspaceId || ws.path,
                            type: 'button',
                            className: 'TWT_popRow',
                            'data-active': isActive ? 'true' : 'false',
                            'data-worktree-dir-option': ws.path,
                            onClick: () => onSelectDirectory(ws.path),
                          },
                          h(
                            'div',
                            { className: 'TWT_popRowTxt' },
                            h('div', { className: 'TWT_popRowTitle' }, ws.title || formatShortDirLabel(ws.path)),
                            h('div', { className: 'TWT_popRowSub' }, ws.path),
                          ),
                          isActive ? h('span', { className: 'TWT_pill TWT_pillCur' }, t('badgeCurrent')) : null,
                        )
                      }),
                    )
                  : null,
                dedupRecent.length > 0
                  ? h(
                      'div',
                      { className: 'TWT_popSec' },
                      h('div', { className: 'TWT_popLabel' }, t('recentSection')),
                      ...dedupRecent.map((rp) => {
                        const isActive = canonicalComparePath(rp) === activeKey
                        return h(
                          'button',
                          {
                            key: rp,
                            type: 'button',
                            className: 'TWT_popRow',
                            'data-active': isActive ? 'true' : 'false',
                            'data-worktree-dir-option': rp,
                            onClick: () => onSelectDirectory(rp),
                          },
                          h(
                            'div',
                            { className: 'TWT_popRowTxt' },
                            h('div', { className: 'TWT_popRowTitle' }, formatShortDirLabel(rp)),
                            h('div', { className: 'TWT_popRowSub' }, rp),
                          ),
                          isActive ? h('span', { className: 'TWT_pill TWT_pillCur' }, t('badgeCurrent')) : null,
                        )
                      }),
                    )
                  : null,
              )
            : null,
        )
      }

      const FolderBrowserModal = ({
        state,
        hasNativePicker,
        onNavigate,
        onToggleHidden,
        onNativePick,
        onConfirmPath,
        onClose,
        t,
      }) => {
        if (!state?.open) return null
        const data = state.data
        const currentPath = data?.path || state.browsePath || ''
        return h(
          'div',
          {
            className: 'TWT_modalBackdrop',
            'data-worktree-browser-modal': 'true',
            onClick: (e) => { if (e.target === e.currentTarget) onClose() },
          },
          h(
            'div',
            { className: 'TWT_browserModal', role: 'dialog', 'aria-modal': 'true' },
            h(
              'div',
              { className: 'TWT_barTop' },
              h('div', { style: { fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' } }, h(FolderGlyph, { size: 15 }), t('browseFolder')),
              h(
                'div',
                { className: 'TWT_barGrp' },
                hasNativePicker
                  ? h('button', { type: 'button', className: 'TWT_iconBtn', 'data-worktree-native-pick': 'true', onClick: onNativePick }, t('nativePicker'))
                  : null,
                h('button', { type: 'button', className: 'TWT_iconBtn', onClick: onClose }, t('close')),
              ),
            ),
            h(
              'div',
              { className: 'TWT_barTop', style: { gap: '5px' } },
              h(
                'button',
                {
                  type: 'button',
                  className: 'TWT_iconBtn',
                  disabled: state.loading || !data?.parentPath,
                  onClick: () => data?.parentPath && onNavigate(data.parentPath),
                },
                h(UpGlyph, { size: 12 }),
                t('parentDir'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'TWT_iconBtn',
                  disabled: state.loading || !data?.homePath,
                  onClick: () => data?.homePath && onNavigate(data.homePath),
                },
                h(HomeGlyph, { size: 12 }),
                t('homeDir'),
              ),
              h('div', { className: 'TWT_path', style: { flex: '1 1 auto' }, title: currentPath }, currentPath || '~'),
              data?.isGitRepo ? h('span', { className: 'TWT_gitTag' }, t('gitRepoTag')) : null,
            ),
            h(
              'label',
              { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' } },
              h('input', { type: 'checkbox', checked: Boolean(state.showHidden), onChange: (e) => onToggleHidden(Boolean(e.target.checked)) }),
              t('showHidden'),
            ),
            state.error ? h('div', { className: 'TWT_errText' }, state.error) : null,
            h(
              'div',
              { className: 'TWT_browserList' },
              state.loading && !data
                ? h('div', { className: 'TWT_state', style: { padding: '20px 10px' } }, t('loadingBrowser'))
                : data?.status === 'missing-dir'
                  ? h('div', { className: 'TWT_state', style: { padding: '20px 10px' } }, t('missingDir', { path: currentPath }))
                  : (data?.entries || []).length === 0
                    ? h('div', { className: 'TWT_state', style: { padding: '20px 10px' } }, t('noSubdirs'))
                    : data.entries.map((entry) => h(
                        'div',
                        { key: entry.path, className: 'TWT_dirEntry', 'data-worktree-browser-entry': entry.path },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'TWT_dirEntryBtn',
                            title: entry.path,
                            onClick: () => onNavigate(entry.path),
                          },
                          h(FolderGlyph, { size: 13 }),
                          h('span', { className: 'TWT_subj' }, entry.name),
                        ),
                        entry.isGitRepo ? h('span', { className: 'TWT_gitTag' }, t('gitRepoTag')) : null,
                        entry.isGitRepo
                          ? h(
                              'button',
                              {
                                type: 'button',
                                className: 'TWT_iconBtn',
                                style: { height: '22px', padding: '0 6px' },
                                onClick: () => onConfirmPath(entry.path),
                              },
                              t('openThisDir'),
                            )
                          : null,
                      )),
            ),
            data?.truncated
              ? h('div', { className: 'TWT_quietTag' }, t('truncatedHint', { n: data.entries.length }))
              : null,
            h(
              'div',
              { className: 'TWT_barTop', style: { justifyContent: 'flex-end', paddingTop: '2px' } },
              h('button', { type: 'button', className: 'TWT_iconBtn', onClick: onClose }, t('cancel')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'TWT_priBtn',
                  'data-worktree-browser-select': 'true',
                  disabled: !currentPath || data?.status === 'missing-dir',
                  onClick: () => currentPath && onConfirmPath(currentPath),
                },
                t('selectCurrentDir'),
              ),
            ),
          ),
        )
      }

      const WorktreeCard = ({ wt, merged, detail, selected, onSelect, onEnter, t }) => {
        const status = detail?.gitStatus
        const ahead = status?.ahead ?? 0
        const behind = status?.behind ?? 0
        const dirty = status?.dirtyCount ?? 0
        const branchLabel = wt.branch || (wt.bare ? t('badgeBare') : wt.detached ? t('badgeDetached') : (wt.head?.slice(0, 7) || 'HEAD'))
        const actKeys = ['turn', 'subagent', 'job', 'schedule'].filter((k) => (merged.activityCounts[k] || 0) > 0)

        return h(
          'button',
          {
            type: 'button',
            className: 'TWT_card',
            'data-worktree-card': wt.path,
            'data-selected': selected ? 'true' : 'false',
            'data-current': wt.isCurrent ? 'true' : 'false',
            'data-prunable': wt.prunable ? 'true' : 'false',
            onClick: () => onSelect(wt.path),
            onDoubleClick: () => onEnter(wt),
          },
          h(
            'div',
            { className: 'TWT_cardTop' },
            h(
              'span',
              { className: 'TWT_branchWrap' },
              h(BranchGlyph, { size: 13 }),
              h('span', { className: 'TWT_branch', title: branchLabel }, branchLabel),
              wt.isMain && !wt.bare ? h('span', { className: 'TWT_quietTag' }, `· ${t('badgeMain')}`) : null,
            ),
            h(
              'span',
              { className: 'TWT_pills' },
              wt.isCurrent ? h('span', { className: 'TWT_pill TWT_pillCur' }, t('badgeCurrent')) : null,
              wt.bare ? h('span', { className: 'TWT_pill' }, t('badgeBare')) : null,
              wt.detached ? h('span', { className: 'TWT_pill TWT_pillWarn' }, t('badgeDetached')) : null,
              wt.locked ? h('span', { className: 'TWT_pill TWT_pillWarn', title: wt.lockedReason || undefined }, t('badgeLocked')) : null,
              wt.prunable ? h('span', { className: 'TWT_pill TWT_pillErr', title: wt.prunableReason || undefined }, t('badgePrunable')) : null,
            ),
          ),
          h('div', { className: 'TWT_path', title: wt.path }, wt.relativePath === '.' ? wt.path : (wt.relativePath || wt.path)),
          h(
            'div',
            { className: 'TWT_metaRow' },
            h(
              'span',
              { className: 'TWT_pills' },
              ahead > 0 ? h('span', { className: 'TWT_quietTag' }, `↑${ahead}`) : null,
              behind > 0 ? h('span', { className: 'TWT_quietTag' }, `↓${behind}`) : null,
              detail && !wt.bare && !wt.prunable && dirty > 0
                ? h('span', { className: 'TWT_pill TWT_pillWarn' }, h('span', { className: 'TWT_dot TWT_dotDirty', style: { marginRight: '4px' } }), t('badgeDirty', { count: dirty }))
                : null,
            ),
            h(
              'span',
              { className: 'TWT_pills' },
              merged.sessions.length > 0 ? h('span', { className: 'TWT_quietTag' }, t('sessionsCount', { count: merged.sessions.length })) : null,
              merged.runningCount > 0
                ? h(
                    'span',
                    { className: 'TWT_pill TWT_pillLive' },
                    h('span', { className: 'TWT_dot TWT_dotLive' }),
                    actKeys.length > 0 ? actKeys.map((k) => t(`act_${k}`)).join('·') : t('act_turn'),
                  )
                : null,
            ),
          ),
        )
      }

      const WorktreeDetailPanel = ({ wt, detail, merged, switching, switchError, onEnter, onOpenSession, extraActions, dangerActions, t }) => {
        if (!wt) return null
        const status = detail?.gitStatus
        const commits = detail?.recentCommits || []
        const canEnter = !wt.prunable && wt.exists !== false && !wt.bare && !switching
        const disabledReason = wt.prunable || wt.exists === false ? t('prunableBlocked') : wt.bare ? t('bareBlocked') : undefined
        const hasLeftExt = Array.isArray(extraActions) && extraActions.length > 0
        const hasRightExt = Array.isArray(dangerActions) && dangerActions.length > 0

        return h(
          'div',
          { className: 'TWT_detail', 'data-worktree-detail': wt.path },
          h(
            'div',
            { className: 'TWT_detailHead' },
            h(
              'div',
              { style: { minWidth: 0, flex: '1 1 auto' } },
              h('div', { style: { fontWeight: 600, fontSize: '13px' } }, wt.branch || (wt.bare ? t('badgeBare') : t('badgeDetached'))),
              h('div', { className: 'TWT_path', title: wt.path }, wt.path),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'TWT_enterBtn',
                'data-worktree-enter': wt.path,
                disabled: !canEnter,
                title: disabledReason || t('detailCloseHint'),
                onClick: () => onEnter(wt),
              },
              switching ? t('enteringWorktree') : t('enterWorktree'),
            ),
          ),
          switchError ? h('div', { className: 'TWT_errText' }, `${t('switchFailed')}: ${switchError}`) : null,
          disabledReason ? h('div', { className: 'TWT_errText' }, disabledReason) : null,
          status
            ? status.clean
              ? h('div', { className: 'TWT_quietTag' }, `✓ ${t('cleanWorkingTree')}`)
              : h(
                  'div',
                  { className: 'TWT_pills' },
                  h('span', { className: 'TWT_pill TWT_pillWarn' }, `${t('detailStatus')}: ${t('badgeDirty', { count: status.dirtyCount })}`),
                  status.staged > 0 ? h('span', { className: 'TWT_pill' }, t('detailStaged', { n: status.staged })) : null,
                  status.unstaged > 0 ? h('span', { className: 'TWT_pill TWT_pillWarn' }, t('detailUnstaged', { n: status.unstaged })) : null,
                  status.untracked > 0 ? h('span', { className: 'TWT_pill' }, t('detailUntracked', { n: status.untracked })) : null,
                  status.conflicted > 0 ? h('span', { className: 'TWT_pill TWT_pillErr' }, t('detailConflicted', { n: status.conflicted })) : null,
                )
            : null,
          h(
            'div',
            { className: 'TWT_detailGrid' },
            h(
              'div',
              null,
              h('div', { className: 'TWT_secTitle' }, t('detailCommits')),
              commits.length === 0
                ? h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' } }, t('noCommits'))
                : h(
                    'div',
                    { className: 'TWT_list' },
                    ...commits.map((c) => h(
                      'div',
                      { key: c.hash, className: 'TWT_commitRow', title: `${c.shortHash} ${c.subject}` },
                      h('span', { className: 'TWT_sha' }, c.shortHash),
                      h('span', { className: 'TWT_subj' }, c.subject),
                    )),
                  ),
            ),
            h(
              'div',
              null,
              h('div', { className: 'TWT_secTitle' }, t('detailSessions')),
              merged.sessions.length === 0
                ? h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' } }, t('noSessions'))
                : h(
                    'div',
                    { className: 'TWT_list' },
                    ...merged.sessions.map((s) => h(
                      'button',
                      {
                        key: s.id,
                        type: 'button',
                        className: 'TWT_sessBtn',
                        'data-worktree-session': s.id,
                        title: t('openSessionHint'),
                        onClick: () => onOpenSession(s.id),
                      },
                      h('span', { className: 'TWT_subj' }, s.title),
                      h(
                        'span',
                        { className: 'TWT_pills' },
                        s.isMainView ? h('span', { className: 'TWT_pill TWT_pillCur' }, t('badgeCurrent')) : null,
                        s.running
                          ? h(
                              'span',
                              { className: 'TWT_pill TWT_pillLive' },
                              h('span', { className: 'TWT_dot TWT_dotLive' }),
                              s.activities.map((a) => t(`act_${a}`)).join('·') || t('act_turn'),
                            )
                          : null,
                      ),
                    )),
                  ),
            ),
          ),
          hasLeftExt || hasRightExt
            ? h(
                'div',
                { className: 'TWT_detailFoot' },
                h('div', { className: 'TWT_pills' }, ...(extraActions || [])),
                h('div', { className: 'TWT_pills' }, ...(dangerActions || [])),
              )
            : null,
        )
      }

      const CommitDagView = ({ dagLayout, commitLimit, onLimitChange, loading, error, onRetry, t }) => {
        if (loading && (!dagLayout || dagLayout.nodes.length === 0)) {
          return h('div', { className: 'TWT_state' }, t('loadingCommits'))
        }
        if (error) {
          return h(
            'div',
            { className: 'TWT_state' },
            h('div', { className: 'TWT_errText' }, `${t('rpcError')}: ${error}`),
            h('button', { type: 'button', className: 'TWT_iconBtn', onClick: onRetry }, t('retry')),
          )
        }
        if (!dagLayout || dagLayout.nodes.length === 0) {
          return h('div', { className: 'TWT_state' }, t('emptyCommits'))
        }
        return h(
          'div',
          { className: 'TWT_dag', 'data-worktree-commits': 'true' },
          h(
            'div',
            { className: 'TWT_pills', style: { marginBottom: '8px' } },
            ...COMMIT_LIMIT_OPTIONS.map((n) => h(
              'button',
              {
                key: n,
                type: 'button',
                className: 'TWT_segBtn',
                'data-active': commitLimit === n ? 'true' : 'false',
                'data-worktree-commit-limit': String(n),
                onClick: () => onLimitChange(n),
              },
              t('commitLimitLabel', { n }),
            )),
          ),
          h(
            'div',
            { style: { position: 'relative', paddingLeft: `${dagLayout.graphWidth}px`, minHeight: `${dagLayout.graphHeight}px` } },
            h(
              'svg',
              {
                width: dagLayout.graphWidth,
                height: dagLayout.graphHeight,
                className: 'TWT_stageSvg',
                style: { width: `${dagLayout.graphWidth}px`, height: `${dagLayout.graphHeight}px` },
                'aria-hidden': 'true',
              },
              ...dagLayout.edges.map((e, idx) => h('path', {
                key: `${e.from}-${e.to}-${idx}`,
                d: e.pathD,
                fill: 'none',
                stroke: e.color,
                strokeWidth: 1.75,
                strokeOpacity: 0.75,
              })),
              ...dagLayout.nodes.map((n) => h('circle', {
                key: `n-${n.hash}`,
                cx: n.cx,
                cy: n.cy,
                r: n.isForkPoint ? 5 : 3.5,
                fill: n.worktreeRefs.length > 0 ? n.color : 'var(--dsw-alias-bg-layer-2)',
                stroke: n.color,
                strokeWidth: 2,
              })),
            ),
            ...dagLayout.nodes.map((n) => h(
              'div',
              { key: n.hash, className: 'TWT_dagRow', style: { height: `${dagLayout.rowHeight}px` } },
              h('span', { className: 'TWT_sha' }, n.shortHash),
              h('span', { className: 'TWT_subj', style: { flex: '1 1 auto' }, title: n.subject }, n.subject || '(no subject)'),
              h(
                'span',
                { className: 'TWT_pills', style: { flexShrink: 0 } },
                n.isForkPoint ? h('span', { className: 'TWT_pill TWT_pillWarn' }, t('forkTag')) : null,
                n.isMergeCommit ? h('span', { className: 'TWT_pill' }, t('mergeTag')) : null,
                ...n.worktreeRefs.map((ref) => h(
                  'span',
                  {
                    key: ref.path,
                    className: ref.isCurrent ? 'TWT_pill TWT_pillCur' : 'TWT_pill',
                    title: ref.path,
                  },
                  ref.branch,
                )),
              ),
            )),
          ),
        )
      }

      const WorktreeTabBody = (props) => {
        const t = resolveTranslator(props?.t, ctx.locale)
        const info = typeof props?.useTabInfo === 'function' ? props.useTabInfo() : null
        const tabVisible = info?.tab?.visible !== false
        const sessionId = props?.sessionId
        const navPath = info?.tab?.navigation?.params?.path || null
        const liveSessionCwd = typeof props?.useProjection === 'function' ? props.useProjection('workingDirectory') : undefined
        const sessionCwd = typeof props?.useSessions === 'function'
          ? props.useSessions((s) => (sessionId ? s?.byId?.[sessionId]?.cwd : undefined))
          : ctx.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
        const effectiveSessionCwd = liveSessionCwd || sessionCwd || null

        const workspaceSnap = React.useSyncExternalStore(subscribeWorkspaces, getWorkspaces, getWorkspaces)
        const sessionSnap = React.useSyncExternalStore(subscribeSessions, getSessions, getSessions)
        const extSnap = React.useSyncExternalStore(
          extHost ? extHost.subscribe : () => () => {},
          extHost ? extHost.getSnapshot : () => ({ extensions: [], pendingIntent: null }),
          extHost ? extHost.getSnapshot : () => ({ extensions: [], pendingIntent: null }),
        )

        const [manualPath, setManualPath] = React.useState(null)
        const lastNavPathRef = React.useRef(navPath)
        const [recentDirs, setRecentDirs] = React.useState(() => readRecentDirs())
        const [dirPopoverOpen, setDirPopoverOpen] = React.useState(false)
        const [pathDraft, setPathDraft] = React.useState('')
        const [browserState, setBrowserState] = React.useState({
          open: false,
          browsePath: '',
          showHidden: false,
          nonce: 0,
          loading: false,
          error: null,
          data: null,
        })
        const headerRef = React.useRef(null)

        const [viewMode, setViewMode] = React.useState(() => readSavedViewMode())
        const [commitLimit, setCommitLimit] = React.useState(DEFAULT_COMMIT_LIMIT)
        const [refreshTick, setRefreshTick] = React.useState(0)
        const [phase1, setPhase1] = React.useState({ loading: false, error: null, data: null })
        const [phase2, setPhase2] = React.useState({ loading: false, detailsByPath: {}, parentByPath: null, treeEdges: null })
        const [commitsState, setCommitsState] = React.useState({ loading: false, error: null, data: null, loadedKey: null })
        const [selectedPath, setSelectedPath] = React.useState(null)
        const [switching, setSwitching] = React.useState(false)
        const [switchError, setSwitchError] = React.useState(null)

        const bodyRef = React.useRef(null)
        const canvasRef = React.useRef(null)
        const [paneWidth, setPaneWidth] = React.useState(380)
        const [panZoom, setPanZoom] = React.useState({ scale: 1, tx: 0, ty: 0 })
        const [panning, setPanning] = React.useState(false)
        const panDragRef = React.useRef(null)

        const targetPath = manualPath || navPath || effectiveSessionCwd || null
        const isPinnedManual = Boolean(manualPath)

        React.useEffect(() => {
          if (navPath && navPath !== lastNavPathRef.current) {
            setManualPath(null)
            setDirPopoverOpen(false)
          }
          lastNavPathRef.current = navPath
        }, [navPath])

        React.useEffect(() => {
          if (!dirPopoverOpen || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
          const onDocDown = (e) => {
            if (headerRef.current && typeof headerRef.current.contains === 'function' && !headerRef.current.contains(e.target)) {
              setDirPopoverOpen(false)
            }
          }
          const onKey = (e) => {
            if (e?.key === 'Escape') setDirPopoverOpen(false)
          }
          document.addEventListener('mousedown', onDocDown)
          document.addEventListener('keydown', onKey)
          return () => {
            document.removeEventListener('mousedown', onDocDown)
            document.removeEventListener('keydown', onKey)
          }
        }, [dirPopoverOpen])

        React.useEffect(() => {
          if (!browserState.open) return undefined
          const ac = typeof AbortController === 'function' ? new AbortController() : null
          let active = true
          setBrowserState((prev) => ({ ...prev, loading: true, error: null }))
          callWorktreeRpc(ctx, 'list-dirs', { path: browserState.browsePath || '', showHidden: browserState.showHidden }, ac?.signal)
            .then((data) => {
              if (!active) return
              setBrowserState((prev) => ({ ...prev, loading: false, error: null, data }))
            })
            .catch((err) => {
              if (!active || err?.name === 'AbortError') return
              setBrowserState((prev) => ({ ...prev, loading: false, error: err?.message || String(err) }))
            })
          return () => {
            active = false
            ac?.abort?.()
          }
        }, [browserState.open, browserState.browsePath, browserState.showHidden, browserState.nonce])

        const selectDirectory = React.useCallback((nextPath) => {
          if (typeof nextPath !== 'string' || !nextPath.trim()) return
          const clean = nextPath.trim()
          setManualPath(clean)
          setPathDraft(clean)
          setRecentDirs(pushRecentDir(clean))
          setDirPopoverOpen(false)
          setBrowserState((prev) => ({ ...prev, open: false }))
          setSelectedPath(null)
          setSwitchError(null)
        }, [])

        const openBrowserModal = React.useCallback((seedPath) => {
          setDirPopoverOpen(false)
          setBrowserState((prev) => ({
            ...prev,
            open: true,
            browsePath: typeof seedPath === 'string' && seedPath ? seedPath : (targetPath || ''),
            error: null,
            nonce: prev.nonce + 1,
          }))
        }, [targetPath])

        const hasNativePicker = Boolean(
          (typeof window !== 'undefined' && typeof window.__DSH_DIRECTORY_PICKER__?.pick === 'function') ||
          typeof ctx.uiWorkspace?.pickDirectory === 'function',
        )

        const handleNativePick = React.useCallback(async () => {
          try {
            let picked = null
            if (typeof window !== 'undefined' && typeof window.__DSH_DIRECTORY_PICKER__?.pick === 'function') {
              picked = await window.__DSH_DIRECTORY_PICKER__.pick()
            } else if (typeof ctx.uiWorkspace?.pickDirectory === 'function') {
              picked = await ctx.uiWorkspace.pickDirectory()
            }
            if (typeof picked === 'string' && picked.trim()) {
              selectDirectory(picked.trim())
            } else if (picked && typeof picked.path === 'string' && picked.path.trim()) {
              selectDirectory(picked.path.trim())
            }
          } catch (err) {
            setBrowserState((prev) => ({ ...prev, error: err?.message || String(err) }))
          }
        }, [selectDirectory])

        const triggerRefresh = React.useCallback(() => {
          setRefreshTick((n) => n + 1)
          ctrl.notifyRefreshed(targetPath)
        }, [targetPath])

        React.useEffect(() => {
          const bind = info?.tab?.actions?.bindCommands
          if (typeof bind !== 'function') return undefined
          return bind({ refresh: triggerRefresh })
        }, [info?.tab?.actions, triggerRefresh])

        React.useEffect(() => {
          const el = bodyRef.current
          if (!el) return undefined
          const update = (w) => {
            if (Number.isFinite(w) && w > 0) setPaneWidth(w)
          }
          update(el.clientWidth || el.getBoundingClientRect?.().width || 380)
          if (typeof ResizeObserver !== 'function') return undefined
          const ro = new ResizeObserver((entries) => {
            for (const entry of entries) update(entry.contentRect?.width)
          })
          ro.observe(el)
          return () => ro.disconnect()
        }, [])

        React.useEffect(() => {
          if (!tabVisible || !targetPath) return undefined
          const ac = typeof AbortController === 'function' ? new AbortController() : null
          let active = true
          setPhase1((prev) => ({ loading: true, error: null, data: prev.data?.queryPath === targetPath ? prev.data : null }))
          setPhase2({ loading: false, detailsByPath: {}, parentByPath: null, treeEdges: null })

          callWorktreeRpc(ctx, 'skeleton', { path: targetPath }, ac?.signal)
            .then((skel) => {
              if (!active) return
              setPhase1({ loading: false, error: null, data: skel })
              setSelectedPath((prev) => {
                if (prev && skel.worktrees?.some((w) => w.path === prev)) return prev
                return skel.currentWorktreePath || skel.mainPath || skel.worktrees?.[0]?.path || null
              })
              if (skel.status !== 'ok' || !Array.isArray(skel.worktrees) || skel.worktrees.length === 0) return
              setPhase2({ loading: true, detailsByPath: {}, parentByPath: null, treeEdges: null })
              return callWorktreeRpc(
                ctx,
                'details',
                { path: targetPath, worktreePaths: skel.worktrees.map((w) => w.path) },
                ac?.signal,
              ).then((det) => {
                if (!active) return
                setPhase2({
                  loading: false,
                  detailsByPath: det?.detailsByPath || {},
                  parentByPath: det?.parentByPath || null,
                  treeEdges: det?.treeEdges || null,
                })
              }).catch(() => {
                if (active) setPhase2((p) => ({ ...p, loading: false }))
              })
            })
            .catch((err) => {
              if (!active || err?.name === 'AbortError') return
              setPhase1({ loading: false, error: err?.message || String(err), data: null })
            })

          return () => {
            active = false
            ac?.abort?.()
          }
        }, [tabVisible, targetPath, refreshTick])

        const skel = phase1.data
        const commitReqKey = `${targetPath || ''}::${commitLimit}::${refreshTick}`
        React.useEffect(() => {
          if (!tabVisible || viewMode !== 'commits' || !targetPath || !skel || skel.status !== 'ok') return undefined
          if (commitsState.loadedKey === commitReqKey && commitsState.data) return undefined
          const ac = typeof AbortController === 'function' ? new AbortController() : null
          let active = true
          setCommitsState((prev) => ({ ...prev, loading: true, error: null }))
          callWorktreeRpc(ctx, 'commits', { path: targetPath, limit: commitLimit }, ac?.signal)
            .then((dag) => {
              if (!active) return
              setCommitsState({ loading: false, error: null, data: dag, loadedKey: commitReqKey })
            })
            .catch((err) => {
              if (!active || err?.name === 'AbortError') return
              setCommitsState((prev) => ({ ...prev, loading: false, error: err?.message || String(err) }))
            })
          return () => {
            active = false
            ac?.abort?.()
          }
        }, [tabVisible, viewMode, targetPath, skel?.status, commitReqKey])

        const switchMode = (nextMode) => {
          setViewMode(writeSavedViewMode(nextMode))
        }

        const isWide = paneWidth >= NARROW_BREAKPOINT || Boolean(info?.sidebar?.fullscreen)
        const worktrees = skel?.worktrees || []
        const parentByPath = phase2.parentByPath || undefined
        const compactRows = React.useMemo(
          () => (!isWide && viewMode === 'tree' ? computeCompactTreeLayout(worktrees, parentByPath) : []),
          [isWide, viewMode, worktrees, parentByPath],
        )
        const canvasLayout = React.useMemo(
          () => (isWide && viewMode === 'tree' ? computeCanvas2DLayout(worktrees, parentByPath) : null),
          [isWide, viewMode, worktrees, parentByPath],
        )
        const dagLayout = React.useMemo(
          () => (viewMode === 'commits' && commitsState.data ? computeCommitDagLayout(commitsState.data) : null),
          [viewMode, commitsState.data],
        )

        const fitCenter = React.useCallback(() => {
          const el = canvasRef.current
          if (!el || !canvasLayout) {
            setPanZoom({ scale: 1, tx: 0, ty: 0 })
            return
          }
          const vw = el.clientWidth || 560
          const vh = el.clientHeight || 320
          const bw = canvasLayout.bounds.width || 320
          const bh = canvasLayout.bounds.height || 220
          const nextScale = Math.max(0.5, Math.min(1, Math.min((vw - 16) / bw, (vh - 16) / bh)))
          const tx = Math.round((vw - bw * nextScale) / 2)
          const ty = Math.round(Math.max(12, (vh - bh * nextScale) / 2))
          setPanZoom({ scale: Number(nextScale.toFixed(2)), tx, ty })
        }, [canvasLayout])

        React.useEffect(() => {
          if (isWide && viewMode === 'tree' && canvasLayout?.nodes?.length > 0) fitCenter()
        }, [isWide, viewMode, skel?.mainPath])

        const mergedByPath = React.useMemo(() => {
          const allClaimedByPath = new Map()
          for (const wt of worktrees) {
            for (const sid of wt.sessionIds || []) {
              allClaimedByPath.set(sid, wt.path)
            }
          }
          const map = new Map()
          for (const wt of worktrees) {
            const claimedElsewhere = new Set()
            for (const [sid, owner] of allClaimedByPath.entries()) {
              if (owner !== wt.path) claimedElsewhere.add(sid)
            }
            map.set(wt.path, mergeWorktreeSessions(wt, workspaceSnap, sessionSnap, skel?.sessionActivities, claimedElsewhere))
          }
          return map
        }, [worktrees, workspaceSnap, sessionSnap, skel?.sessionActivities])

        const selectedWt = worktrees.find((w) => w.path === selectedPath) || worktrees[0] || null
        const selectedMerged = selectedWt ? (mergedByPath.get(selectedWt.path) || { sessions: [], runningCount: 0, activityCounts: {} }) : null
        const selectedDetail = selectedWt ? phase2.detailsByPath[selectedWt.path] : null

        const extApi = {
          ctx,
          sessionId,
          targetPath,
          skel,
          phase2,
          selectedWt,
          selectedMerged,
          selectedDetail,
          pendingIntent: extSnap.pendingIntent,
          consumeIntent: extHost ? extHost.consumeIntent : () => null,
          refresh: triggerRefresh,
          selectPath: (p) => { setSelectedPath(p); setSwitchError(null) },
          selectDirectory,
          wslDistro: skel?.wslDistro || null,
          t,
        }
        const toolbarExtNodes = extSnap.extensions
          .map((ext) => (typeof ext.renderToolbarActions === 'function' ? ext.renderToolbarActions(extApi) : null))
          .filter(Boolean)
        const secondaryToolbarExtNodes = extSnap.extensions
          .map((ext) => (typeof ext.renderSecondaryToolbarActions === 'function' ? ext.renderSecondaryToolbarActions(extApi) : null))
          .filter(Boolean)
        const detailExtNodes = extSnap.extensions
          .map((ext) => (typeof ext.renderDetailActions === 'function' ? ext.renderDetailActions(extApi) : null))
          .filter(Boolean)
        const detailDangerExtNodes = extSnap.extensions
          .map((ext) => (typeof ext.renderDetailDangerActions === 'function' ? ext.renderDetailDangerActions(extApi) : null))
          .filter(Boolean)
        const overlayExtNodes = extSnap.extensions
          .map((ext) => (typeof ext.renderOverlay === 'function' ? ext.renderOverlay(extApi) : null))
          .filter(Boolean)

        const handleEnterWorktree = async (wt) => {
          if (!wt || switching) return
          setSwitchError(null)
          setSwitching(true)
          try {
            const res = await openWorktreeTarget({
              wt,
              workspaces: ctx.workspaces,
              uiWorkspace: ctx.uiWorkspace,
              referencePath: targetPath,
              wslDistro: skel?.wslDistro,
            })
            if (!res.ok) {
              setSwitchError(res.reason === 'bare' ? t('bareBlocked') : t('prunableBlocked'))
            }
          } catch (err) {
            setSwitchError(err?.message || String(err))
          } finally {
            setSwitching(false)
          }
        }

        const handleOpenSession = (sid) => {
          if (!sid || typeof ctx.uiWorkspace?.openSession !== 'function') return
          ctx.uiWorkspace.openSession(sid)
        }

        const onCanvasPointerDown = (e) => {
          if (e.button !== undefined && e.button !== 0) return
          if (e.target?.closest?.('button, a, [data-worktree-card]')) return
          const startX = e.clientX
          const startY = e.clientY
          const origTx = panZoom.tx
          const origTy = panZoom.ty
          setPanning(true)
          const onMove = (ev) => {
            setPanZoom((p) => ({ ...p, tx: origTx + (ev.clientX - startX), ty: origTy + (ev.clientY - startY) }))
          }
          const onUp = () => {
            setPanning(false)
            window?.removeEventListener?.('pointermove', onMove)
            window?.removeEventListener?.('pointerup', onUp)
            window?.removeEventListener?.('pointercancel', onUp)
            panDragRef.current = null
          }
          panDragRef.current = onUp
          window?.addEventListener?.('pointermove', onMove)
          window?.addEventListener?.('pointerup', onUp)
          window?.addEventListener?.('pointercancel', onUp)
        }

        React.useEffect(() => () => { panDragRef.current?.() }, [])

        const onCanvasWheel = (e) => {
          if (!e.ctrlKey && !e.metaKey) return
          e.preventDefault()
          const factor = e.deltaY < 0 ? 1.12 : 0.89
          setPanZoom((p) => ({ ...p, scale: Math.max(0.5, Math.min(2, Number((p.scale * factor).toFixed(2)))) }))
        }

        const renderEmptyActions = () => h(
          'div',
          { className: 'TWT_barGrp' },
          h(
            'button',
            {
              type: 'button',
              className: 'TWT_priBtn',
              'data-worktree-pick-dir-empty': 'true',
              onClick: () => openBrowserModal(targetPath || ''),
            },
            h(FolderGlyph, { size: 12 }),
            t('pickAnotherDir'),
          ),
          isPinnedManual && effectiveSessionCwd
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'TWT_iconBtn',
                  'data-worktree-follow-empty': 'true',
                  onClick: () => { setManualPath(null); setSwitchError(null) },
                },
                t('followSession'),
              )
            : null,
        )

        const renderMainContent = () => {
          if (!targetPath) return h('div', { className: 'TWT_state' }, h('div', null, t('noWorkspace')), renderEmptyActions())
          if (phase1.loading && !skel) {
            return h(
              'div',
              { className: 'TWT_skeletonList', 'aria-label': t('loadingSkeleton') },
              h('div', { className: 'TWT_skeletonCard' }),
              h('div', { className: 'TWT_skeletonCard' }),
              h('div', { className: 'TWT_skeletonCard' }),
            )
          }
          if (phase1.error && !skel) {
            return h(
              'div',
              { className: 'TWT_state' },
              h('div', { className: 'TWT_errText' }, `${t('rpcError')}: ${phase1.error}`),
              h(
                'div',
                { className: 'TWT_barGrp' },
                h('button', { type: 'button', className: 'TWT_iconBtn', onClick: triggerRefresh }, t('retry')),
                h('button', { type: 'button', className: 'TWT_priBtn', 'data-worktree-pick-dir-empty': 'true', onClick: () => openBrowserModal(targetPath) }, t('pickAnotherDir')),
              ),
            )
          }
          if (!skel) return null
          if (skel.status === 'missing-dir') return h('div', { className: 'TWT_state' }, h('div', null, t('missingDir', { path: targetPath })), renderEmptyActions())
          if (skel.status === 'not-git') return h('div', { className: 'TWT_state' }, h('div', null, t('notGit', { path: targetPath })), renderEmptyActions())
          if (skel.status === 'bare-only') return h('div', { className: 'TWT_state' }, h('div', null, t('bareOnly')), renderEmptyActions())

          if (viewMode === 'commits') {
            return h(CommitDagView, {
              dagLayout,
              commitLimit,
              onLimitChange: (n) => setCommitLimit(n),
              loading: commitsState.loading,
              error: commitsState.error,
              onRetry: triggerRefresh,
              t,
            })
          }

          if (isWide && canvasLayout) {
            const { nodes, edges, bounds } = canvasLayout
            return h(
              'div',
              {
                ref: canvasRef,
                className: 'TWT_canvas',
                'data-worktree-layout': '2d',
                'data-panning': panning ? 'true' : 'false',
                onPointerDown: onCanvasPointerDown,
                onWheel: onCanvasWheel,
              },
              h(
                'div',
                {
                  className: 'TWT_stage',
                  style: {
                    width: `${bounds.width}px`,
                    height: `${bounds.height}px`,
                    transform: `translate(${panZoom.tx}px, ${panZoom.ty}px) scale(${panZoom.scale})`,
                  },
                },
                h(
                  'svg',
                  {
                    width: bounds.width,
                    height: bounds.height,
                    className: 'TWT_stageSvg',
                    style: { width: `${bounds.width}px`, height: `${bounds.height}px` },
                    'aria-hidden': 'true',
                  },
                  ...edges.map((edge) => h('path', {
                    key: `${edge.from}->${edge.to}`,
                    d: edge.pathD,
                    fill: 'none',
                    stroke: 'var(--dsw-alias-border-l3, #64748b)',
                    strokeWidth: 1.75,
                  })),
                ),
                ...nodes.map((node) => h(
                  'div',
                  {
                    key: node.wt.path,
                    className: 'TWT_stageNode',
                    style: { left: `${node.x}px`, top: `${node.y}px`, width: `${node.width}px` },
                  },
                  h(WorktreeCard, {
                    wt: node.wt,
                    merged: mergedByPath.get(node.wt.path) || { sessions: [], runningCount: 0, activityCounts: {} },
                    detail: phase2.detailsByPath[node.wt.path],
                    selected: selectedWt?.path === node.wt.path,
                    onSelect: (p) => { setSelectedPath(p); setSwitchError(null) },
                    onEnter: handleEnterWorktree,
                    t,
                  }),
                )),
              ),
            )
          }

          return h(
            'div',
            { className: 'TWT_treeList', 'data-worktree-layout': 'compact' },
            ...compactRows.map((row) => {
              const stepW = 16
              const gutterW = row.depth * stepW
              const paths = []
              for (let d = 0; d < row.depth; d += 1) {
                const x = d * stepW + stepW / 2
                if (d < row.depth - 1) {
                  if (row.ancestorHasNext[d]) paths.push(`M ${x} 0 V 100`)
                } else {
                  paths.push(row.isLastSibling ? `M ${x} 0 V 26 H ${gutterW}` : `M ${x} 0 V 100 M ${x} 26 H ${gutterW}`)
                }
              }
              return h(
                'div',
                { key: row.wt.path, className: 'TWT_treeRow' },
                gutterW > 0
                  ? h(
                      'svg',
                      {
                        width: gutterW,
                        height: '100%',
                        viewBox: `0 0 ${gutterW} 100`,
                        preserveAspectRatio: 'none',
                        className: 'TWT_gutter',
                        style: { width: `${gutterW}px` },
                        'aria-hidden': 'true',
                      },
                      ...paths.map((d, idx) => h('path', {
                        key: idx,
                        d,
                        fill: 'none',
                        stroke: 'var(--dsw-alias-border-l3, #64748b)',
                        strokeWidth: 1.5,
                        vectorEffect: 'non-scaling-stroke',
                      })),
                    )
                  : null,
                h(
                  'div',
                  { className: 'TWT_cardWrap' },
                  h(WorktreeCard, {
                    wt: row.wt,
                    merged: mergedByPath.get(row.wt.path) || { sessions: [], runningCount: 0, activityCounts: {} },
                    detail: phase2.detailsByPath[row.wt.path],
                    selected: selectedWt?.path === row.wt.path,
                    onSelect: (p) => { setSelectedPath(p); setSwitchError(null) },
                    onEnter: handleEnterWorktree,
                    t,
                  }),
                ),
              )
            }),
          )
        }

        return h(
          'div',
          { ref: bodyRef, className: 'TWT_root', 'data-tune-worktree-root': 'true' },
          h(
            'div',
            { ref: headerRef, className: 'TWT_header' },
            h(
              'div',
              { className: 'TWT_barTop' },
              h(DirectoryPickerPopover, {
                open: dirPopoverOpen,
                targetPath,
                skel,
                worktreeCount: worktrees.length,
                isPinnedManual,
                effectiveSessionCwd,
                workspaces: workspaceSnap?.items,
                recentDirs,
                pathDraft,
                onToggleOpen: () => {
                  setDirPopoverOpen((o) => {
                    const next = !o
                    if (next) setPathDraft(targetPath || '')
                    return next
                  })
                },
                onPathDraftChange: setPathDraft,
                onSubmitPath: selectDirectory,
                onFollowSession: () => {
                  setManualPath(null)
                  setDirPopoverOpen(false)
                  setSelectedPath(null)
                  setSwitchError(null)
                },
                onOpenBrowser: () => openBrowserModal(targetPath || ''),
                onSelectDirectory: selectDirectory,
                t,
              }),
              h(
                'div',
                { className: 'TWT_barGrp', style: { flexShrink: 0 } },
                ...toolbarExtNodes,
                h(
                  'button',
                  {
                    type: 'button',
                    className: phase1.loading ? 'TWT_iconBtn TWT_refreshBtn TWT_spinning' : 'TWT_iconBtn TWT_refreshBtn',
                    'data-worktree-refresh': 'true',
                    title: t('refresh'),
                    'aria-label': t('refresh'),
                    disabled: !targetPath || phase1.loading,
                    onClick: triggerRefresh,
                  },
                  h(RefreshGlyph, { size: 13 }),
                ),
              ),
            ),
            h(
              'div',
              { className: 'TWT_barSub' },
              h(
                'div',
                { className: 'TWT_seg', role: 'tablist' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'TWT_segBtn',
                    'data-active': viewMode === 'tree' ? 'true' : 'false',
                    'data-worktree-mode': 'tree',
                    onClick: () => switchMode('tree'),
                  },
                  t('modeTree'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'TWT_segBtn',
                    'data-active': viewMode === 'commits' ? 'true' : 'false',
                    'data-worktree-mode': 'commits',
                    onClick: () => switchMode('commits'),
                  },
                  t('modeCommits'),
                ),
              ),
              h(
                'div',
                { className: 'TWT_barGrp' },
                isWide && viewMode === 'tree' && canvasLayout
                  ? h(
                      React.Fragment,
                      null,
                      h('button', {
                        type: 'button',
                        className: 'TWT_iconBtn',
                        'aria-label': t('zoomOut'),
                        onClick: () => setPanZoom((p) => ({ ...p, scale: Math.max(0.5, Number((p.scale - 0.15).toFixed(2))) })),
                      }, '-'),
                      h('button', {
                        type: 'button',
                        className: 'TWT_iconBtn',
                        'aria-label': t('fitCenter'),
                        onClick: fitCenter,
                      }, t('fitCenter')),
                      h('button', {
                        type: 'button',
                        className: 'TWT_iconBtn',
                        'aria-label': t('zoomIn'),
                        onClick: () => setPanZoom((p) => ({ ...p, scale: Math.min(2, Number((p.scale + 0.15).toFixed(2))) })),
                      }, '+'),
                    )
                  : null,
                ...secondaryToolbarExtNodes,
              ),
            ),
          ),
          skel?.isSubmodule
            ? h('div', { className: 'TWT_banner' }, t('submoduleBanner', { root: skel.superprojectRoot || '' }))
            : null,
          phase2.loading
            ? h('div', { className: 'TWT_banner' }, t('loadingDetails'))
            : null,
          h('div', { className: 'TWT_main' }, renderMainContent()),
          viewMode === 'tree' && skel?.status === 'ok' && selectedWt
            ? h(WorktreeDetailPanel, {
                wt: selectedWt,
                detail: selectedDetail,
                merged: selectedMerged,
                switching,
                switchError,
                extraActions: detailExtNodes,
                dangerActions: detailDangerExtNodes,
                onEnter: handleEnterWorktree,
                onOpenSession: handleOpenSession,
                t,
              })
            : null,
          browserState.open
            ? h(FolderBrowserModal, {
                state: browserState,
                hasNativePicker,
                onNavigate: (nextPath) => setBrowserState((prev) => ({ ...prev, browsePath: nextPath, nonce: prev.nonce + 1 })),
                onToggleHidden: (val) => setBrowserState((prev) => ({ ...prev, showHidden: val, nonce: prev.nonce + 1 })),
                onNativePick: handleNativePick,
                onConfirmPath: selectDirectory,
                onClose: () => setBrowserState((prev) => ({ ...prev, open: false })),
                t,
              })
            : null,
          ...overlayExtNodes,
        )
      }

      return { WorktreeGuideIcon, ContextMenuWorktreeIcon, WorktreeTabTitle, WorktreeHeaderBadge, WorktreeTabBody }
    }

    exports.inject = ['connection', 'workspaces', 'uiWorkspace', 'sessions', 'sidebarRightTabs', 'sidebarRight', 'slots', 'locale', 'contextMenus']
    exports.apply = (ctx) => {
      ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALES), 'tune-worktree: locale')
      ctx.effect(() => ensureStyle(), 'tune-worktree: css')
      const ctrl = createWorktreeController(ctx)
      const extHost = createWorktreeExtensionHost()
      if (typeof ctx.provide === 'function') {
        ctx.provide('tuneWorktreeUi', extHost)
      }
      const ui = createWorktreeComponents(ctx, ctrl, extHost)
      const t = resolveTranslator(null, ctx.locale)

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: WORKTREE_ID,
        kind: WORKTREE_KIND,
        priority: 'extension',
        title: () => t('tabTitle'),
        guide: [{
          id: 'worktree',
          order: 25,
          title: () => t('guideTitle'),
          description: () => t('guideDesc'),
          ...(ui?.WorktreeGuideIcon ? { icon: ui.WorktreeGuideIcon } : {}),
        }],
      }), 'tune-worktree: tab-type')

      if (ui && ctx.slots) {
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: WORKTREE_ID,
          locale: LOCALE_NS,
        }, ui.WorktreeTabBody)), 'tune-worktree: tab-body')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: WORKTREE_ID,
          locale: LOCALE_NS,
        }, ui.WorktreeTabTitle)), 'tune-worktree: tab-title')

        ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'runtime-tuning.worktree-badge',
          order: 20,
          locale: LOCALE_NS,
        }, ui.WorktreeHeaderBadge)), 'tune-worktree: header-badge')

        ctx.effect(() => ctx.slots.inject('contextMenu.icon', () => ctx.slots.register({
          name: 'contextMenu.icon',
          key: 'tune.worktree',
        }, ui.ContextMenuWorktreeIcon)), 'tune-worktree: context-menu-icon')
      }

      ctx.effect(() => ctx.contextMenus.register({
        id: 'worktree.viewTree',
        target: 'workspace',
        order: 350,
        observe: () => [ctx.locale],
        resolve: ({ path, workspaceId }) => [{
          id: 'worktree.viewTree',
          label: t('contextMenuViewTree'),
          icon: { key: 'tune.worktree' },
          run: () => openWorktreeTab(ctx, { path, workspaceId }),
        }],
      }), 'tune-worktree: workspace-menu')

      ctx.effect(() => () => {
        ctrl.dispose()
        extHost.dispose()
      }, 'tune-worktree: cleanup')
    }

    exports.__internals = {
      MODULE_ID,
      WORKTREE_KIND,
      WORKTREE_ID,
      RPC_CHANNEL,
      LOCALE_NS,
      VIEW_MODE_STORAGE_KEY,
      RECENT_DIRS_STORAGE_KEY,
      NARROW_BREAKPOINT,
      DEFAULT_COMMIT_LIMIT,
      COMMIT_LIMIT_OPTIONS,
      LOCALES,
      readSavedViewMode,
      writeSavedViewMode,
      readRecentDirs,
      pushRecentDir,
      formatShortDirLabel,
      formatLocaleText,
      computeCompactTreeLayout,
      computeCanvas2DLayout,
      computeCommitDagLayout,
      normClientPath,
      canonicalComparePath,
      formatPathForWorkspaceCreate,
      mergeWorktreeSessions,
      openWorktreeTarget,
      openWorktreeTab,
      callWorktreeRpc,
      createWorktreeController,
      createWorktreeExtensionHost,
      createWorktreeComponents,
    }

    return exports
  },
})
