# Flatline

A browser survival game. Requires a mouse and keyboard.

**Play:** https://alrightyth3nn-sys.github.io/flatline/

## Controls

- WASD: move
- Shift: sprint
- Mouse: aim and fire
- R: reload
- 1 / 2 / 3: switch weapon
- G: throw a grenade once unlocked
- E: use the machine gun when available
- Q: use Upheaval when charged
- F: toggle fullscreen (or the button in the top-right corner of the menus)

## Hosting

GitHub Pages publishes `index.html` from the root of the `main` branch.
Update that file and push to `main` to publish changes.

The game loads Three.js and its font from external CDNs. Each player's personal best is stored locally in their browser.

## Leaderboard

The global leaderboard is a Cloudflare Worker with a D1 database, deployed at
https://flatline-leaderboard.alrightyth3nn.workers.dev. Its source is in `leaderboard/`:

- `worker.js`: `GET /scores?limit=10` returns each name's best run; `POST /scores` with
  `{ name, score, secs }` adds a run and returns its rank and the top 10.
- `schema.sql`: the D1 table.
- `wrangler.toml`: Worker and database binding.

Submissions are rate limited per IP. IPs are stored only as salted hashes; the salt is the
`IP_SALT` Worker secret. Scores come from the browser, so the Worker rejects implausible ones
but can't prove a run was real.

To change the Worker, run these from `leaderboard/`:

```sh
npx wrangler deploy                                   # publish worker.js
npx wrangler d1 execute flatline-leaderboard --remote --file schema.sql   # schema changes
```

For local testing, put `IP_SALT="anything"` in `leaderboard/.dev.vars`, apply the schema with
`--local`, and run `npx wrangler dev --local`.
