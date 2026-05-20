# Prompt API 版 Chrome 插件改造计划

## 目标
- 基于 Chrome 内置 Prompt API（不依赖服务端）重构当前插件能力。
- 参考 `openai-translator` 的交互思路，引入「动作模式」以提升灵活性。
- 保持项目为纯 Chrome Extension 形态。

## 里程碑与提交策略

### 功能 1：Prompt API 核心能力与动作模式（commit #1）
- 新增统一 AI 执行层，封装 Prompt API 可用性检查、会话创建、流式输出与中断。
- 增加动作模式：`translate` / `summarize` / `polish` / `explain` / `custom`。
- 为不同动作构建对应提示词模板；`translate` 默认要求仅输出翻译结果并尽量保留换行结构。
- 状态：`completed`

### 功能 2：Popup/Overlay 交互升级（commit #2）
- 升级 popup 与页内 overlay 的 UI 控件，支持动作选择、自定义指令、运行/停止、复制结果。
- 对齐当前项目结构（同一套脚本在 popup 与 iframe overlay 运行），并补充状态提示（准备中/下载模型/执行中/完成/报错）。
- 保留并优化源/目标语言设置（主要用于翻译动作）。
- 状态：`completed`

### 功能 3：页面流程与扩展行为收敛（commit #3）
- 调整后台与内容脚本消息流：右键选中文本直接打开统一 overlay 并预填文本。
- 收敛旧的“轻量翻译浮层”逻辑，避免与新 Prompt 流程冲突。
- 更新 manifest 元信息（最小 Chrome 版本/描述）以匹配 Prompt API 能力边界。
- 状态：`completed`

## 验证
- 执行 `npm run build` 作为当前项目可用校验。
- 每个功能完成后更新本计划状态并单独提交，再进入下一个功能。
