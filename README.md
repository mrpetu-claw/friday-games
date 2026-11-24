# Friday Games — Mystery Stories

A web game for Microsoft Teams calls. The host runs short original mysteries. Players ask yes/no questions by voice, and the host ticks off clues as players uncover them. Scores update live on everyone's screen.

- **Front end:** React + TypeScript + Vite, published as a static site on **GitHub Pages**
- **Back end:** **Supabase** (Postgres + Realtime) on the free tier. GitHub Pages only serves files, so Supabase is what keeps all browsers in sync.
- No accounts and no payments. Works on mobile and desktop. All game text is in English.

## How a game works

1. The host opens the site, clicks **Create game** and picks *Competitive* or *Cooperative*.
2. The host shares the 6-character **game code** in the Teams chat (or clicks **Copy join link**).
3. Players open the link, type their name, and they appear on the host's screen right away.
   People who can't open the site can be added by the host by name.
4. The host clicks **Open Player View** and shares *that tab* in Teams. The Host View is private: it shows the solution, so never share it.
5. Start a mystery. When someone uncovers a clue, select that player and tick the clue. Points come from the clue itself, and the clue appears on the Player View. Un-ticking takes the points back from the same player.
6. Use **Solved! +15**, **Partial deduction +5** or **Wrong guess −2** as you see fit, then **Reveal solution** and move to the next mystery. Scores carry over from one mystery to the next.
7. **End session** shows the result. The session also closes automatically **60 minutes after the first mystery starts**.

## One-time setup (about 10 minutes)

### 1. Create the Supabase project
1. Sign in at <https://supabase.com> and create a **new project** on the free plan. Pick a region near you, e.g. London.
2. Open **SQL Editor** and run the three files in `supabase/migrations/`, **in order**:
   1. `20261124000001_schema.sql`
   2. `20261124000002_functions.sql`
   3. `20261124000003_seed_mysteries.sql`
3. Go to **Project Settings → Data API / API Keys** and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **anon** (or *publishable*) key

   These two values are public by design. **Never** use the `service_role` / secret key in this app.
4. Under **Realtime → Settings**, make sure *public* channels are allowed. This is the default. The app only sends a "something changed" signal over Realtime, never game data.
5. *(Optional)* To delete sessions after 7 days, enable the `pg_cron` extension and run:
   ```sql
   select cron.schedule('friday-games-cleanup', '0 3 * * *', 'select game_private.cleanup()');
   ```

### 2. Connect GitHub Pages
1. Put your Project URL and publishable key in `.env.production`. Both are public values, so the file is committed.
2. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open **Actions → Test and deploy to GitHub Pages → Run workflow**, or push to `main`.
   The workflow runs the tests, builds the site and publishes it at
   `https://<your-user>.github.io/friday-games/`.

## Local development

```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev                  # http://localhost:5173
npm test                     # unit tests
npm run test:db              # server acceptance tests (needs a local Postgres; set PGHOST/PGUSER/PGPASSWORD)
```

## Security model

- **Every table** has row-level security switched on and **no policies**, and all table grants are revoked. Browsers can't read or write any table directly.
- All access goes through `SECURITY DEFINER` functions (`supabase/migrations/*_functions.sql`):
  - The **public code** only allows reading the public state and asking to join. The public state never includes the solution before *Reveal*, clues not yet found, or any keys.
  - **Host actions** require the host key. The key is created when the game is created, stored only in the host's browser (localStorage), and saved in the database as a SHA-256 hash only. It is sent in the request body, never in a URL, and it is never shown on screen.
  - Player reconnect tokens and link codes are stored as hashes too.
- Rate limits per IP address apply to unknown-code lookups (30 per 10 min), wrong link codes (10 per 15 min), game creation (20 per hour) and joins.
- Names are trimmed, limited to 24 characters, checked for unsafe characters, and unique per game regardless of capitals.
- Clue awards are atomic. A unique index means each clue can be awarded only once per mystery, and every point change is stored in `score_events` so it can be audited and undone.
- Realtime broadcasts carry only a version number. Each screen then fetches its own state through the function that applies its visibility rules.

## Project structure

```
src/
  lib/          api (RPC wrappers), live-state hook (Realtime + polling), types, pure game helpers + tests
  views/        Home, HostView (private), PlayerView (public), JoinView
  components/   timer, scoreboard, shared bits
  games/        game registry — Word Mystery / Trivia Battle slot in here later
public/mysteries/   original SVG illustrations
supabase/
  migrations/   schema, server functions, mystery catalogue
  tests/        acceptance tests (run in CI against Postgres 16)
docs/DECISIONS.md   rule decisions and assumptions
```

## Adding a mystery

Add an `insert` to a new migration with a new `MS-0xx` id, 4–6 clues (points per clue) and an image in `public/mysteries/`. Keep the content original.
