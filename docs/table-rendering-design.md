# 聊天表格渲染：核验与实施设计

状态：0.2.15-dev.5 已实现独立样式覆盖；rc.2 / rc.3 原生聊天界面已检查截图、390px 实际消息列与横向溢出，详见 [验收范围](visual-verification.md)。目标是聊天列内可读、适应列宽、溢出时可滚动；保留现有主题，不修改官方 dist。

## 已核验

rc.3 的 `dsh-web-frontend/dist` 存在交接描述的 tableScroll 规则；官方源码中的 `ui-primitives/src/markdown/MarkdownText.module.css` 和 `render.tsx` 也支持这些结论：四列及以上（非引用块）进入 md-table-wide，table 使用 max-content、单元格最小 100px，桌面端默认隐藏横向滚动条，hover/focus 改为 scroll。

用交接量测页在本机 Chromium 重跑：390px 容器中，原四列表宽 512px、六列表宽 776px；建议 CSS 两者均为 390px。建议六列表格最大行高 79px，数字 129709 的文本 Range 只有一行。上述仅复现这份样例，不是完整真实聊天验收。

## 交接中需修正或补充的地方

1. **缺少聊天层的 breakout 规则。** rc.3 `dsh-client-ui-chat/src/client/chat/AssistantMarkdown.module.css` 对 md-table-wide 设置基于 100cqw 的额外宽度、负 margin-left 和 padding-left。交接量测页未包含这层。仅改表格 width:100% 会填满扩宽的 wrapper，不一定填满用户期望的聊天消息列；实现时需把聊天 wide wrapper 的 width/max-width、margin-left、padding-left 一并复位，且不改变其他 Markdown 宿主。
2. **对比截图不是终稿 CSS 的效果证据。** 截图中的建议版仍将 129709 拆行；对比 HTML 使用 8px 12px padding，也未完整使用终稿 break-word 规则。终稿量测页使用 6px 9px，重跑未拆这组数字。验收以最终注入后的真实聊天为准。
3. **“固定宽度”只对给定数据成立。** 512/776 来自该样例最小列宽与 padding；不同内容、字体、代码、URL 可能产生更宽的 intrinsic size，不能当所有四/六列表的恒定宽度。
4. **量测页模拟了滚动展开态。** 它把 hover/focus 的 scroll 规则写成永久命中；clipped 字段只比较宽度，说明水平溢出，不足以独立证明用户永远无法访问右列。需要另外在真实 hover 设备、未悬停时验证 overflowX。
5. **auto 不保证滚动条始终有可见轨道。** OS 覆盖式滚动条设置可能影响观感，验收要区分“有滚动能力”和“有可发现的提示”。若使用端仍看不出溢出，再单独加一个仅在真实溢出时出现的轻量提示，不能凭列数强制加箭头或强制滚动。
6. **不把宽视窗等同于聊天列。** 1200px 是窗口/量测容器宽度时，原生 DSH 聊天内容列另有 680–920px 自适应规则；应比较 table 与实际消息容器，不能要求真实界面里的表格一律 1200px。

## 接入与样式边界

- 新增独立的 table-layout 客户端功能，共用现有生成的 client.js 入口；它不修改回答判定等 JS，不把 CSS 合并进已有正则替换字符串。
- 注入一份有稳定 id 的 style，卸载/停用时移除；重复加载更新已有节点，不累积多个 style。不采用全局 table/th/td 选择器。
- 作用域必须是聊天正文的 Markdown 包装层，再选择其 tableScroll。匹配当前构建的语义类片段并做契约检查，不写死哈希；确认引用块、列表内表格、轨迹页和侧栏文档的边界。
- 宽表 wrapper 恢复消息列内宽度：width/max-width:100%，margin-left/padding-left:0；overflow-x:auto，padding-bottom:0，覆盖 hover/focus 分支，不再把 wrapper 扩到整个 transcript。
- 表格 width:100%、max-width:none，保持 table-layout:auto；单元格移除 100px 最小宽和 30vw 最大宽，padding:6px 9px，vertical-align:top、text-align:start，border-bottom:1px 使用现有主题 token。表头 weight:600、white-space:nowrap。真实截图发现长代码 token 会挤窄其他列，导致四字表头变成四行并产生大片空白；保持表头一行，以表头固有宽度提供基本列宽，正文仍按 normal 换行，宽内容继续横向滚动。
- 单元格覆盖继承的 overflow-wrap:anywhere 为 break-word，word-break:normal。长连续数字/URL 放不下时允许表格自然溢出并滚动，不能为了强塞所有列而使用 fixed 布局、隐藏内容或对数字强制断行。
- 明确覆盖首列/末列的旧零 padding 规则。采用限定作用域的选择器与明确注入顺序，测计算样式，不靠 CSS 字符串里有关键词就认定成功。
- 注入异常只回退该功能并记不含用户内容的诊断；不让表格失败影响聊天或审批卡，也不因审批补丁失效撤销表格修复。

## 验收

1. 真实 rc.2 / rc.3 聊天中，消息列 390px、常用笔记本窗口、宽屏；3/4/6 列，长数字、长 URL/路径、代码、中文及引用块/列表。
2. 首屏不悬停即 overflowX:auto；窄表没有无意义横向滚动，宽内容可通过鼠标、触控板和键盘到达最后一列。
3. 内容放得下时 table 宽等于消息容器；放不下时 wrapper 仍在消息列内，table 可变宽而不溢出整个页面。不能把“六列必须出现滚动”写成判据。
4. 对 129709 用文本 Range 的逐行矩形验证不拆行，并检查末列可达；不能只看 table 的 clientWidth。
5. 计算样式确认表头 600、padding 6px 9px、首尾 padding 非零、1px 底边；深浅色都使用主题 token。切换会话、重载插件和流式新增表格不重复注入。
6. 注入失败/停用后恢复原生表格；审批卡、轨迹页、侧栏文档及非表格 Markdown 无回归。只有通过真实使用端验收，才更新 README 的实测声明。

顺序建议：先完成表格的完整聊天 DOM 契约测试与 CSS 修复，再接入审批卡；两者各有开关、测试和失败回退。
