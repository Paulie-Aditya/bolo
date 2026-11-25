# NudgeBee runbooks for Bolo

`bolo-voice-failover.yml` is a NudgeBee Workflow Builder definition (canonical YAML shape, importable with **Automations → Create Automation → Create from Code**).

```
schedule (every minute)
  └─ integrations.http   GET https://<bolo>/api/health
       └─ if action_needed == disable_voice_ordering
            ├─ events.store         incident "Bolo voice ordering degraded" (AI analysis on)
            ├─ llm.summary          brief for the approver
            ├─ core.approval        human approves / rejects (in-app)
            ├─ integrations.http    POST Flagsmith Admin API → voice_ordering OFF
            └─ events.add_evidence  record who approved and what changed
```

Configuration Manager values:

| Key | Type | Value |
| --- | --- | --- |
| `bolo_url` | Config | `https://bolo-festivehacks.vercel.app` |
| `flagsmith_env_id` | Config | Flagsmith environment id (Production) |
| `flagsmith_voice_feature_id` | Config | id of the `voice_ordering` feature |
| `flagsmith_admin_key` | Secret | Flagsmith Organisation API key |

## Rehearse it (game day)

1. In Flagsmith, turn on `chaos_sarvam_outage`. Every Sarvam call in Bolo now fails on purpose.
2. Try 3–4 voice orders on the storefront. `/api/health` flips to `degraded`, `action_needed: disable_voice_ordering`.
3. Within a minute NudgeBee opens the incident and waits for approval.
4. Approve. `voice_ordering` goes off in Flagsmith, and the storefront switches to tap-to-order.
5. Turn `chaos_sarvam_outage` off and `voice_ordering` back on.
