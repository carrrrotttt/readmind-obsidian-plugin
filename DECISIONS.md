# DECISIONS

## 2026-05-25 Phase 5B ????????

- ??????????????????????????????????????? AI?
- ?? / ?? / ???????????????????????????? AI ?????
- ?????????? `ReadingJourneySummary`?????????AI ??????????????
- AI ???????????????????????????????? API Key?Authorization Header???????????????
- ????????? source fragment ??? block ID?AI ?????? evidenceId?cardId ? relationId ?????? Markdown?
- `createdAt` ??????????????????????????????? `time_unconfirmed` ?????????
- ????????? `KnowledgeCardRecord.createdAt` ?????????? `ConfirmedRelation.acceptedAt` ???
- ??????????????????????????????????
- ?????????????????????????????????????????????
- ??????????????????????????????????????????????? Release ????


## 2026-05-25 Phase 5A 阅读旅程数据面板决策

- 阅读回顾页面基于微信读书官方 Gateway API 的 `/readdata/detail`，支持 `weekly` / `monthly` / `annually` / `overall`，默认周期为 `monthly`。
- 官方统计口径采用 Tencent/WeChatReading 官方仓库中的 `skills/readdata.md`，并参考 `skills/notes.md` 与 `README.md` 维持官方 Gateway / skill 使用方式。
- `totalReadTime` 以秒为单位，并作为总阅读时长主口径。
- `dayAverageReadTime` 以秒为单位，用户侧文案固定为“自然日均”，不误写为阅读日均。
- `readTimes` 仅用于趋势明细展示，不替代 `totalReadTime` 计算总量。
- `readLongest[].readTime` 与 `preferCategory[].readingTime` 以秒为单位。
- `preferTime` 是 24 小时时段分布，顺序从 6 点开始至次日 5 点，不按 0 点开始解释。
- `preferAuthor[].readTime` 若返回，为官方格式化文本，不再次按秒转换。
- `skill_version` 继续保持当前真实验证可用的 `1.0.3`，除非服务端明确要求升级并单独处理。
- 本阶段只展示官方统计和本地结构化沉淀摘要，不调用 AI，不写入 Markdown，不修改知识卡片、确认关系或知识网络布局。
- ReadMind 沉淀区域当前展示的是本地累计知识卡片与确认关系数量，不按阅读统计周期过滤。
- 下一阶段为“用户确认式、有证据的阶段阅读回顾”。


## 2026-05-25 AI Phase 4 知识网络画布决策

- 知识网络在 Obsidian 中部独立标签页打开，不占用知识卡片 / 关联建议工作区的内嵌空间。
- 知识网络节点只来自 `KnowledgeCardRecord`，连线只来自 `ConfirmedRelation`。
- 网络视图只展示用户已确认关系；待处理、暂不处理和已忽略建议不作为连线展示。
- 节点布局与 viewport 使用 `knowledgeNetworkLayout` 保存在插件本地 store 中，仅作为视图配置，不写入 Markdown。
- 拖动节点只修改视图坐标，不修改知识卡片语义、证据、双链或确认关系。
- 网络画布仅用于浏览、布局与来源回溯，不触发 AI 请求，不生成新关系，不重写已确认双链。
- 下一阶段为“阅读旅程数据面板 MVP”，优先基于官方 API 已有阅读进度、同步记录和本地结构化数据展示阅读旅程。

## 2026-05-25 AI Phase 3 知识卡片关系决策

- 关联建议的对象统一为用户确认后的知识卡片，不再以原始书籍、未确认概念候选或全库笔记作为直接关系对象。
- 知识卡片关联建议支持同书概念关联，也支持跨书关联发现；只有用户确认后才写入双链。
- AI 关联建议输入只包含用户本次选择的知识卡片及其真实来源证据，证据必须能回溯到稳定来源 block。
- AI 返回的关系建议必须引用左右双方合法 evidence；未知 cardId 或 evidenceId 的建议会被丢弃。
- 用户可接受、编辑后接受、暂不处理或忽略建议；只有接受或编辑后接受会更新双方知识卡片。
- 已确认关系以结构化数据持久化，后续知识网络视图应读取这些确认关系，而不是重新解析 Markdown 或重新调用 AI 推断。
- 接受关系写入双方知识卡片的受控关联区域，并保留用户“我的理解”区域。
- 下一阶段为“知识网络视图与关系管理 MVP”，重点展示和管理已经确认的知识结构，不新增 AI 推断。

## 2026-05-25 AI Phase 2 知识卡片决策

- 知识卡片只能由用户在 AI 分析 Tab 中主动确认创建或追加；插件不得自动批量创建。
- 创建知识卡片复用已有单书 AI 分析结果中的概念候选、解释和合法 `sourceFragmentIds`，不再次调用 AI 模型。
- 知识卡片证据来自 `ReadMindSourceFragment`，Markdown 链接必须指向来源笔记稳定 block ID。
- 知识卡片使用 `normalizedTitle` 做最小去重；不做复杂同义词合并。
- 追加证据时同一 `fragmentId + blockId` 不重复写入。
- 知识卡片中的“我的理解”区域属于用户，插件更新证据和初步理解时不得覆盖。
- 本阶段不写入自动双链，不生成跨书关联建议，不开发知识图谱、阅读统计或推荐能力。
- 下一阶段为“跨书关联建议与用户确认双链 MVP”。

## 2026-05-25 AI Phase 1 收口决策

- 当前微信读书数据主路径继续使用官方 API，`skill_version = 1.0.3`，不回退到 Legacy Cookie 路线。
- AI 分析输入只能来自真实 `ReadMindSourceFragment`，包含稳定 `fragmentId`、`annotationId`、`blockId`、`sourceNotePath`、类型、章节与正文。
- AI 输出中的主题和概念必须引用合法 `sourceFragmentIds`；未知 fragment ID 会被过滤，缺少有效来源的主题或概念不会写入分析结果。
- 来源笔记 block ID 是 AI 引用锚点：划线使用 `rm-h-*`，想法使用 `rm-t-*`；分析笔记通过 `[[来源笔记#^blockId|查看来源摘录]]` 跳转。
- AI 模型供应商采用 `src/aiProviderPresets.ts` 中的 preset registry；当前已真实验证的供应商为通义千问 / 阿里云百炼。
- AI 连接测试分为基础连接与 ReadMind 结构化能力验证；能力测试只使用内置虚拟 fragment，不发送用户真实阅读内容。
- AI API Key 当前仍保存在本地 Obsidian 插件配置中，迁移到 SecretStorage 是发布前安全任务。
- 下一阶段为“用户确认式知识卡片 MVP”，知识卡片创建必须由用户确认触发，不自动生成跨书关联或双链。

## 2026-05-25 AI Provider 与密钥存储

- AI 模型供应商采用 preset registry 管理，当前统一走 OpenAI-compatible Chat Completions 适配层。
- UI 可选择 OpenAI、DeepSeek、通义千问 / 阿里云百炼、腾讯混元、智谱 GLM、月之暗面 / Kimi、自定义 OpenAI-compatible；只有通义千问当前标记为 ReadMind 已验证。
- AI API Key 与微信读书官方 API Key 在 UI 文案和设置字段中保持区分。
- AI API Key 当前仍保存在本地 Obsidian 插件配置中，迁移到 Obsidian SecretStorage 或等价安全密钥存储是发布前安全任务。

## 2026-05-24 官方 API 主路径

- 微信读书官方 API 是当前正式可用的阅读数据主路径，`skill_version` 固定为 `1.0.3`，后续若响应要求升级再调整。
- 已验证《幸福之路》可通过官方 API 获取阅读进度 9%、划线 4 条、想法 1 条，并写入本地 Markdown。
- Legacy Cookie / 扫码登录路线只保留兼容，不继续作为当前同步修复重点。
- AI 功能继续隐藏；在来源笔记用户化、章节证据和稳定 block ID 通过真实验证后，再开放 AI 跨书关联 MVP。
- 来源笔记默认只展示用户可理解字段；`bookId`、hash、同步状态、AI 状态等技术元数据保留在插件内部索引或管理数据中。

## 2026-05-23

- 插件 ID 使用 `readmind-ai-enhanced-readingnotes`。
- Manifest 名称使用 `ReadMind`，界面显示 `ReadMind / 书脉`。
- MVP 第一阶段只做 Phase 0-3，不接入真实微信读书接口，不实现 AI。
- 项目采用 clean-room 独立实现，不基于参考插件源码开发。
- 数据源通过统一 adapter 抽象，当前正式可用路径为示例数据和 ReadMind JSON 导入。
- 来源笔记同步采用管理块策略：插件只替换 `readmind:source` 管理块，并更新 frontmatter，管理块外用户内容保留。
- 微信读书入口仅保留实验状态机和提示，不声明真实连接可用。
- AI Provider 只实现 OpenAI-compatible Chat Completions，输出要求 JSON，并用轻量手写校验，不引入额外 schema 库。
- 首次 AI 分析前必须确认发送范围；API Key 只放入请求 Header，不写入日志或 Markdown。
- 知识卡片只在用户确认后创建，同名文件默认创建带序号的新文件，不覆盖已有内容。
- 关联建议只有接受后才写入知识卡片的 `readmind:links` 管理块，忽略和稍后处理只更新状态。
- 由于微信读书扫码登录依赖桌面端 Electron 能力，插件当前标记为桌面端优先。
- 微信读书真实接入隔离在 WeRead 登录、API Client 和转换层内；接口变化时必须显示失败或登录失效，不假装成功。
- Daily Notes 不依赖第三方插件，只写入 `ReadMind/05 Daily Reading` 内的 ReadMind 管理块。
- 微信读书登录验证采用网页登录 Cookie 匹配的 Web API：`GET https://weread.qq.com/api/user/notebook`。不再把 `/shelf/sync` 或 `/user/notebooks` 作为扫码登录有效性验证链路。
- 登录窗口使用临时 Electron partition 获取本次扫码 Cookie；后续验证和书架请求使用插件保存的 Cookie 通过 `requestUrl` 显式构造请求，避免依赖登录窗口长期存在。
- 微信读书详细诊断日志默认关闭；Debug 模式也只允许输出 Cookie 名称、域、路径、Header 名称和 HTTP 状态，不输出 Cookie value、Session、Token 或 API Key。
- 参考仓库仅用于理解微信读书外部交互流程和接口行为，本项目保持 clean-room 独立重写，未复制其源代码或类结构。
