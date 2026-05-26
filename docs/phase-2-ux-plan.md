# Phase 2 界面体验整改方案

## 目标

ReadMind 当前主路径先聚焦微信读书到 Obsidian 的稳定同步：

连接微信读书 → 刷新书架 → 选择书籍同步。

本阶段只调整普通用户可见展示层，不修改微信读书登录、Cookie、鉴权、同步数据结构或内部状态字段。

## 当前问题

| 页面/场景 | 当前展示或问题 | 为什么影响体验 | 建议处理方式 | 优先级 |
| ----- | ------- | ------- | ------ | --- |
| 主页面 | 直接展示 `connected`、`not_synced`、`unknown` 等内部枚举 | 普通用户难以理解 | 统一映射为自然中文文案 | P0 |
| 主页面 | 直接展示 ISO 时间 | 难读，不像产品界面 | 统一格式化为本地日期时间 | P0 |
| 主页面 | 展示 AI 状态和 AI/关联建议入口 | AI 闭环尚未完成，会误导用户 | 当前普通界面隐藏，未来 AI MVP 再接入 | P0 |
| 书籍详情 | 展示原始阅读状态、同步状态、AI 状态 | 内部字段暴露 | 只展示阅读与同步的用户文案，隐藏 AI 状态 | P0 |
| 导入/同步反馈 | 成功与失败提示仍偏简略 | 用户不一定知道下一步 | 后续补充保存位置、失败建议和日志层级 | P1 |
| 首次使用 | 示例数据和导入入口与微信读书路径同级 | 主路径不够突出 | 后续把示例和导入降为次级入口 | P1 |

## 用户可见文案映射原则

| 内部状态 | 用户可见文案 | 是否保留内部字段 |
| ------- | ------- | -------- |
| `connected` | 已连接 | 是 |
| `disconnected` | 未连接 | 是 |
| `waiting_scan` | 等待扫码 | 是 |
| `confirming` | 确认中 | 是 |
| `expired` | 登录已失效 | 是 |
| `failed`，连接上下文 | 连接失败 | 是 |
| `not_synced` | 尚未同步 | 是 |
| `syncing` | 同步中 | 是 |
| `synced` | 已同步 | 是 |
| `update_available` | 有更新 | 是 |
| `failed`，同步上下文 | 同步失败 | 是 |
| `reading` | 在读 | 是 |
| `finished` | 已读完 | 是 |
| `unknown`，阅读状态上下文 | 暂无阅读状态 | 是 |

## AI 功能当前处理

- 当前普通用户界面隐藏 AI 状态、AI 分析入口、关联建议入口和双链相关入口。
- 内部 AI 状态字段、索引、命令和服务代码暂时保留，供后续 AI MVP 阶段继续接入。
- 后续重新接入时，不以“AI 状态枚举”为入口，而以“生成知识卡片”“发现关联建议”等明确用户价值重新设计。

## 后续任务拆分

| 任务 | 涉及文件 | 是否影响同步逻辑 | 测试方式 | 建议 checkpoint |
| --- | --- | --- | --- | --- |
| 2B-1 用户可见状态与时间整改 | `displayText.ts`, `BookshelfView.ts`, `BookDetailModal.ts`, `ReadMindSettingTab.ts` | 否 | 主页面和详情页不再出现原始枚举、ISO 时间和 AI 状态 | `ux: humanize visible status labels` |
| 2B-2 主页面宽屏信息层级 | `BookshelfView.ts`, `styles.css` | 否 | 中部标签页中顶部主路径更清晰 | `ux: refine bookshelf primary actions` |
| 2B-3 书籍详情信息层级 | `BookDetailModal.ts`, `styles.css` | 否 | 核心阅读与同步信息优先，内部字段隐藏 | `ux: simplify book detail overview` |
| 2B-4 导入与同步反馈 | `main.ts`, `SyncLogModal.ts`, `syncService.ts` | 低 | 导入、同步、失败、登录失效都有清晰下一步 | `ux: improve import and sync feedback` |
| 2B-5 空状态与错误状态统一 | `BookshelfView.ts` | 否 | 未登录、空书架、无搜索结果、接口失败都有明确行动入口 | `ux: clarify bookshelf empty states` |

## 不做

- 不开发 AI、双链、图谱或知识卡片增强。
- 不修改微信读书登录、鉴权和书架同步接口。
- 不删除内部同步、去重、AI 或状态判断所需字段。
- 不把 Cookie、Session、API Key、本地配置、测试 Vault 或个人笔记写入 Git。
