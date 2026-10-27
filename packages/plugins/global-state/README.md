# Global state

An opt-in OpenCode plugin that keeps a current workspace snapshot in the model context. It is useful with context tree branches: when you switch to an older branch, that branch still sees files, todos, and shell commands that changed on another branch.

The plugin tracks:

- files reported by `edit`, `write`, and `patch`
- the latest `todowrite` list
- recent shell commands
- the current VCS status, refreshed when a session is first used and after shell commands

It injects a `<global-state>` system block before each agent request. It does not modify persisted history, restore files, or change the session timeline.

## Install

Install directly from Git:

```sh
opencode plugin add 'git+https://github.com/anomalyco/opencode.git#path:packages/plugins/global-state'
```

For local development, add the directory to `plugins` in the project's `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./packages/plugins/global-state"],
}
```

The plugin is not activated merely by being present in the repository.

## Remove

```sh
opencode plugin remove 'git+https://github.com/anomalyco/opencode.git#path:packages/plugins/global-state'
```

## Limitations

- State is tracked per session. Changes made in another session are only visible through the next VCS status refresh.
- VCS status is capped by a two-second timeout and is refreshed on first use and after shell commands, not on every request.
- The block describes current state; it does not revert files to an older branch.
- Tool results that do not report file changes are only visible through the tracked commands or VCS status.
