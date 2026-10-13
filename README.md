# Ross

Every reality show is secretly a Friends episode.

Once a week, Ross:

1. collects this week's Dutch signals: Google Trends NL, Google News NL and upcoming calendar moments;
2. collides them with Friends plotline engines, favouring engines that existing formats rarely use;
3. writes format ideas with a repeatable mechanic;
4. drops weak or derivative ideas after checking them against the 1,085-title format database;
5. emails the best ideas, matched to commissioner profiles.

## Files

| File | What it does |
|---|---|
| `index.js` | Weekly scheduler and the run itself |
| `trendFeed.js` | Google Trends NL and Google News NL (RSS) |
| `calendar.js` | Dutch calendar moments for the coming 8 weeks |
| `pairer.js` | Picks engines (saturation-weighted, 90-day cooldown) and lets Claude pair them with signals |
| `ideaWriter.js` | Writes the ideas: logline, Friends pitch, mechanic, arcs, cast, scores |
| `reviewer.js` | Similarity check against the format database, commissioner match, quality gates |
| `email.js` | Builds and sends the weekly email via Resend |
| `memory.js` | Cooldown and run log on the Railway volume |
| `llm.js` | Claude API wrapper (structured tool output, with a fallback for models that don't allow forced tool use) |
| `engines.json` | 417 Friends plotline engines |
| `saturation.json` | How crowded each engine is in existing formats |
| `formats_tagged.json` | The format database with trigger/tension/relationship tags |
| `profile_*.json` | Commissioner profiles, copied from TRENT and renamed: `profile_videoland.json`, `profile_netflix.json`, `profile_disneyplus.json` |

The repo is completely flat: every file at the root, no folders.

## Deploy on Railway

1. Create a new GitHub repo and upload all files. From TRENT's `profiles/` folder, download `videoland.json`, `netflix.json` and `disneyplus.json`, rename them to `profile_videoland.json`, `profile_netflix.json` and `profile_disneyplus.json`, and upload them alongside the rest.
2. In Railway: **New service → GitHub repo**. The `Procfile` sets the start command (`node index.js`).
3. Add a **volume** to the service, mounted at `/app/data`. Railway sets `RAILWAY_VOLUME_MOUNT_PATH` automatically.
4. Set the variables:

| Variable | Required | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | your Claude API key |
| `RESEND_API_KEY` | yes | your Resend key |
| `EMAIL_TO` | yes | comma-separated recipients |
| `FROM_EMAIL` | no | default `Ross <onboarding@resend.dev>` |
| `ANTHROPIC_MODEL` | no | default `claude-sonnet-5-5` |
| `OUTPUT_LANGUAGE` | no | `en` (default) or `nl` |
| `SCHEDULE` | no | cron, default `50 7 * * 1` (Monday 07:50) |
| `TZ_SCHEDULE` | no | default `Europe/Amsterdam` |
| `FINAL_COUNT` | no | ideas per email, default `6` |
| `PAIRINGS` | no | ideas generated before filtering, default `10` |
| `COOLDOWN_DAYS` | no | days before an engine can return, default `90` |
| `RUN_ON_START` | no | `true` = run once right after deploy (for testing) |
| `DRY_RUN` | no | `true` = don't send, write `data/preview.html` instead |

**First test:** set `RUN_ON_START=true`, deploy, check the logs and your inbox, then remove the variable again.

**Note on `onboarding@resend.dev`:** with Resend's test sender, mail only reaches the email address of the Resend account owner. To send to colleagues, verify a domain in Resend and set `FROM_EMAIL`.

## Logs

Every run logs per step, for example:

```
[ross] signals: {"googleTrends":15,"googleNews":15,"calendar":3}
[ross] 6 engines in cooldown; 45 candidates
[ross] dropped "…": too close to Big Brother
[ross] email sent (…)
```

If a feed is down, the run continues with the other sources. If the email fails, nothing is written to memory, so the engines don't go into cooldown.
