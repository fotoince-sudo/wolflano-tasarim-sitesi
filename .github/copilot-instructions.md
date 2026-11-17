For Wolflano tasks, act as the coordinator: infer the work area from the user's request and use the matching custom agent in `.github/agents/` when delegation is supported. Do not ask the user to choose an agent.

- Storefront or design-studio changes: Wolflano Web UI.
- Supabase functions, migrations, or backend integrations: Wolflano Backend.
- Focused test and regression work: Wolflano QA.
- Requested security review or a security-sensitive change: Wolflano Security Reviewer.

Use only the specialists needed for the task, integrate their work, and verify relevant existing checks. If custom-agent delegation is unavailable in the current Copilot client, handle the request directly using these same role boundaries.
