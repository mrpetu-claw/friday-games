# Decisions and assumptions (v1)

The specification (section 16) left these open. Decisions marked **Confirmed** were made by Martin on 24 Nov 2026. Items marked **Assumption** are defaults that are easy to change.

| Topic | Decision | Status |
|---|---|---|
| Wrong-solution penalty | **The host decides each time.** The *Wrong guess −2* button is optional and asks for confirmation. It is never applied automatically. | Confirmed |
| Ties (competitive) | **Shared victory.** Every player tied on the top score is listed as a winner. If nobody scored, there is no winner. | Confirmed |
| When the 60 minutes start | **When the first mystery starts.** Time in the lobby doesn't count. | Confirmed |
| Personal code for manually added players | **Included in v1.** The host creates a one-time 6-digit code that lasts 15 minutes and sends it privately. The player enters it, and the host must then confirm it's really them. The player keeps their points. | Confirmed |
| Cooperative success | The team has a points goal (default **60**, set when creating the game). The team succeeds if it reaches the goal before the session ends. In cooperative mode, points can go to *the team* or to a named player, and everything adds up to one shared score. | Assumption |
| Scoring values | Clue points come from each clue (important clues +3, supporting clues +2). Partial deduction +5, full solve +15, wrong guess −2. These are stored in the session's `settings` so they can change later. | Spec default |
| Solve bonus | Can be given once per mystery. Undoing it re-opens the mystery. | Assumption |
| Removing a player | They disappear from the scoreboard and their link stops working. Their score history stays in the audit log. Their name becomes free again. | Assumption |
| Spectators | They can join by checking *Just watching*, or the host can switch a player to spectator. Spectators can't receive points, and they only ever see the public view. | Assumption |
| Starting a new mystery while one is running | The running mystery closes automatically. | Assumption |
| Replaying a mystery | Allowed. The catalogue marks it as *already played*. | Assumption |
| `sessions.current_mystery_id` (spec) | Implemented as `current_round_id`, because a round points to its mystery and also carries round status. | Design |
| Clean-up | `game_private.cleanup()` deletes sessions older than 7 days. You can schedule it with pg_cron (see README). | Assumption |
