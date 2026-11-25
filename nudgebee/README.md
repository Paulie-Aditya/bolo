# NudgeBee runbooks for Bolo

`bolo-voice-failover.yml` is a NudgeBee Workflow Builder definition (canonical YAML shape, importable with **Automations → Create Automation → Create from Code**).

```
schedule (every minute)
  └─ integrations.http   GET https://<bolo>/api/health
       └─ if action_needed == disable_voice_ordering
            ├─ events.store         incident "Bolo voice ordering degraded" (AI analysis on)
            ├─ llm.summary          brief for the approver
            ├─ core.approval        human approves / rejects (in-app)
            ├─ integrations.http    POST Bolo /api/ops/voice → re-checks health → Flagsmith voice_ordering OFF
            └─ events.add_evidence  record who approved and what changed
```

Configuration Manager values:

| Key | Type | Value |
| --- | --- | --- |
| `bolo_url` | Config | `https://bolo-festivehacks.vercel.app` |

No secrets live in NudgeBee. The failover endpoint is self-validating: Bolo only switches voice **off** while its own Sarvam health is degraded, and only back **on** once it's healthy. The Flagsmith Admin key stays in Bolo's server environment. Every action is recorded in an audit trail shown on `/ops`.

## Rehearse it (game day)

1. In Flagsmith, turn on `chaos_sarvam_outage`. Every Sarvam call in Bolo now fails on purpose.
2. Try 3–4 voice orders on the storefront. `/api/health` flips to `degraded`, `action_needed: disable_voice_ordering`.
3. Within a minute NudgeBee opens the incident and waits for approval.
4. Approve. `voice_ordering` goes off in Flagsmith, and the storefront switches to tap-to-order.
5. Turn `chaos_sarvam_outage` off and `voice_ordering` back on.
