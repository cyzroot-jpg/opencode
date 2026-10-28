# TreeCode

[English](README.en.md) | 中文

TreeCode 是一个面向长任务编程的分支式 AI 编程代理。它基于 OpenCode（MIT）构建，并把会话上下文从单线历史升级为**可切换、可压缩、可引用的上下文树**。

上下文树已经内置在 TreeCode 中，不需要再安装 `opencode-context-tree` 插件；那个插件只用于给官方 OpenCode 补充能力。

> TreeCode 是 OpenCode 的衍生项目，不是 OpenCode 官方产品，也不代表 OpenCode 团队。

## 为什么需要 TreeCode

传统 AI 编程会话是一条线：

- 想回到旧方案，只能编辑历史或重新开会话
- 多个方案会互相污染上下文
- 长对话压缩会把无关分支的结论混进来
- 旧分支看不到工作区后来的变化

TreeCode 把每个用户提问变成树节点：

- 切回任意节点，TUI 和模型上下文一起切换
- 从旧节点继续提问会自然分叉，不覆盖原分支
- 可以创建多个独立根节点
- 可以把另一条分支 link 进当前上下文，但不合并界面
- 压缩只作用于指定节点，切换分支时复用对应检查点
- 文件、todo、shell 状态跨分支共享，避免旧分支误判工作区

## 功能

- **节点切换**：只保留当前节点到根的路径
- **自然分叉**：从旧节点继续生成新的兄弟分支
- **多根节点**：为无关任务开启全新上下文
- **跨分支链接**：把目标路径加入模型上下文，保留来源
- **节点删除**：递归删除节点及其后代
- **节点压缩**：压缩结果绑定到节点，不污染其他分支
- **共享工作区状态**：注入最新的文件变更、todo 和 shell 命令
- **侧边栏链接提示**：显示当前节点链接了哪些分支

## 使用

启动后，在会话中执行：

```text
/tree                  选择并切换上下文节点
/tree new              下一次提问开启新的根节点
/tree link             链接/取消链接另一个节点
/tree delete           删除节点及其后代
/tree compact          切换并压缩指定节点
```

第一次执行 `/tree` 时会根据已有用户消息建立树；之后的新提问会自动追加节点。

## 从源码运行

当前阶段以源码分发的开发构建为主：

```sh
git clone --branch context-tree https://github.com/cyzroot-jpg/opencode.git
cd opencode
bun install
bun run dev
```

Windows 上也可以使用仓库根目录的启动脚本：

```bat
treecode.cmd C:\path\to\your\project
```

命令别名：

- 产品命令：`treecode`
- 兼容命令：`opencode`

## 兼容性

TreeCode 保留 OpenCode 的内部兼容层：

- 继续读取 `~/.config/opencode` 配置
- 继续支持 `OPENCODE_*` 环境变量
- 继续使用 OpenCode 插件和现有会话数据
- 新增 `treecode` 命令别名，不破坏已有 `opencode` 用法

这是刻意的取舍：先把产品体验做成 TreeCode，再逐步决定哪些内部标识需要迁移。

## 和 OpenCode 的关系

TreeCode 基于 OpenCode 的 MIT 源码，保留原始版权和许可证。主要差异是：

- 上下文树成为核心会话模型
- TUI 同时投影树结构和模型上下文
- 节点级压缩、跨分支链接、共享工作区状态
- 用户可见品牌和命令改为 TreeCode

上游项目：https://github.com/anomalyco/opencode

## 开发

```sh
bun install
bun test
bun run typecheck
```

## 限制

- 树以用户提问为节点，工具调用和助手回复归属于所在提问区间
- link 只影响模型上下文，不会把另一分支的对话显示在当前界面
- 工作区状态按 session 跟踪，VCS 状态最多每 2 秒刷新一次
- 对话树不隔离文件系统；需要并行实验时仍应配合 Git worktree
- 内部包名和环境变量暂未重命名，以保持兼容

## License

MIT。原始 OpenCode 版权归其作者所有；TreeCode 的修改同样以 MIT 发布。