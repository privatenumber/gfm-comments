# Agent skill directories

pnpm 12.11.0 and newer links the agent skills of approved dependencies into agent skill directories. When `skills.dirs` is not set, pnpm links only into directories that already exist, plus the directory of an agent it detects from the environment. A fresh clone in CI has neither, so the install fails. When `skills.dirs` is set, pnpm creates the listed directories.

## Documented behavior

The [`skills.dirs` setting](https://pnpm.io/settings/build#skillsdirs) (accessed 2026-11-01):

> Default: the agent skill directories that exist in the workspace root, plus the one of the agent running pnpm

> When set, it replaces the detected directories, and pnpm creates the ones that are missing.

An empty list turns the feature off.

## Observed failure without `skills.dirs`

Last verified 2026-11-01 with pnpm 12.16.1. The test used a fresh clone of this repository with no agent directories, `skills.dirs` removed from `pnpm-workspace.yaml`, and no agent detected from the environment:

```sh
CI=true pnpm install --frozen-lockfile
```

Output excerpt (exit code 1):

```text
Error: ERR_PNPM_NO_AGENT_SKILLS_DIR

  × installing dependencies
  ╰─▶ There is no agent skill directory to link the approved skills of clean-
      pkg-json, cleye, lintroll, manten into
  help: Name the directories in pnpm-workspace.yaml, for example:
        skills:
          dirs:
            - .claude/skills
```

With `skills.dirs: [.agents/skills]`, the same fresh-clone install succeeded with and without `CI=true`. It created `.agents/skills` with one `pnpm-<package>-<skill>` link per approved skill, and `git status` stayed clean.
