# Agent skill directories

**Decision (2026-11-01):** [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) sets `skills.dirs: [.agents/skills]`, and the root `.gitignore` ignores `/.agents/skills/`. No agent directory is committed.

## Rationale

- Without `skills.dirs`, a fresh clone in CI fails to install ([pnpm/agent-skills.md](../pnpm/agent-skills.md)). Setting it makes pnpm create the directory, so nothing has to be committed just to make the directory exist.
- `.agents/skills` is not tied to one agent. Configuring only that directory keeps the template free of harness-specific setup.

## Rejected: committed placeholder directories

Before this decision, the template committed `.agents/skills/.gitignore` and `.claude/skills/.gitignore` (each containing `pnpm-*`) and did not set `skills.dirs`. That also prevents `ERR_PNPM_NO_AGENT_SKILLS_DIR`, because pnpm links into directories that exist. It was replaced for two reasons: it tracks files whose only purpose is to make a directory exist, and it commits a harness-specific directory to every repository made from the template.

## Trade-off

pnpm no longer links skills into `.claude/skills`. An agent that reads only `.claude/skills` does not see dependency skills in this repository. Whether Claude Code reads `.agents/skills` was not verified. To support such an agent, add its directory to `skills.dirs` and to `.gitignore`.
