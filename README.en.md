# TreeCode

[中文](README.md) | English

TreeCode is a branch-aware AI coding agent for long-running work. It is built on OpenCode (MIT) and turns a session's context from a single linear history into a **switchable, compactable, linkable context tree**.

> TreeCode is a derivative of OpenCode. It is not an official OpenCode product and is not affiliated with the OpenCode team.

## Why TreeCode

A traditional coding session is linear:

- going back to an older approach means editing history or starting over
- competing approaches contaminate each other's context
- global compaction mixes conclusions from unrelated branches
- old branches cannot see later workspace changes

TreeCode makes every user prompt a tree node:

- switch to any node; the TUI and model history change together
- continue from an old node to create a sibling branch without overwriting the original
- start additional independent roots
- link another branch into the current model context without merging the UI
- compact a single node and reuse its checkpoint when switching back
- share files, todos, and shell state across branches

## Features

- **Node switching**: keep only the active node's ancestry
- **Natural branching**: continue from an old node as a new sibling
- **Multiple roots**: start a fresh context for unrelated work
- **Cross-branch links**: include another path in model context with provenance
- **Node deletion**: remove a node and its descendants
- **Node compaction**: bind compaction to a node without polluting other branches
- **Shared workspace state**: inject recent file changes, todos, and shell commands
- **Sidebar hints**: show links from the active node

## Usage

```text
/tree                  Select and switch a context node
/tree new              Start the next prompt as a new root
/tree link             Link or unlink another node
/tree delete           Delete a node and its descendants
/tree compact          Switch to a node and compact it
```

The first `/tree` builds a tree from existing user messages. Later prompts append nodes automatically.

## Run from source

```sh
git clone --branch context-tree https://github.com/cyzroot-jpg/opencode.git
cd opencode
bun install
bun run dev
```

On Windows:

```bat
treecode.cmd C:\path\to\your\project
```

Commands:

- product command: `treecode`
- compatibility command: `opencode`

## Compatibility

TreeCode keeps OpenCode's compatibility layer:

- reads `~/.config/opencode`
- supports `OPENCODE_*` environment variables
- keeps existing plugins and session data working
- adds a `treecode` command without breaking `opencode`

Internal package names and environment variables are intentionally unchanged for now.

## Relationship to OpenCode

TreeCode is based on OpenCode's MIT source and keeps its copyright and license. Main differences:

- the context tree is a core session model
- the TUI projects both the tree and the model context
- node-level compaction, cross-branch links, and shared workspace state
- user-visible branding and command name are TreeCode

Upstream: https://github.com/anomalyco/opencode

## Development

```sh
bun install
bun test
bun run typecheck
```

## Limitations

- nodes are user prompts; tool calls and assistant replies belong to the prompt interval containing them
- links affect model context only; linked conversations stay hidden in the TUI
- workspace state is tracked per session; VCS status refreshes at most every two seconds
- the conversation tree does not isolate the filesystem; use Git worktrees for parallel experiments
- internal package names and environment variables remain `opencode` for compatibility

## License

MIT. Original OpenCode copyright remains with its authors. TreeCode modifications are released under the same license.