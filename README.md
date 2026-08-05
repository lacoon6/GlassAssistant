# Glass Assistant

Glass Assistant 0.10.6 opens directly to Discord channels on Even G2 and supports Discord OAuth inside the Even WebView.

## Run

Create `.env` from `.env.example` and configure the Glass Assistant backend:

```env
VITE_API_URL=https://your-glass-assistant-backend.example
```

The frontend sends credentials with backend requests and expects these routes:

- `GET /api/auth/login`
- `GET /api/auth/logout`
- `GET /api/discord/servers`
- `GET /api/discord/default/channels`
- `GET /api/discord/channels?guildId={guildId}`
- `GET /api/discord/messages?channelId={channelId}`

Discord OAuth, token storage, refresh, and Discord REST requests belong entirely to the backend. The frontend never receives Discord access or refresh tokens.
The G2 flow is channels to messages; server names and settings are not rendered on glasses. Selection state is stored as validated JSON through the public Even Hub SDK local-storage bridge.
Chrome and Even WebView cookies are intentionally treated as separate. Login navigates the current WebView to the backend OAuth route and returns to `/app/` on the backend origin.

```bash
npm install
npm run dev
```

Then either:
- **Simulator:** `npm run simulate`
- **Real glasses:** `npx evenhub qr --url http://<your-ip>:5173` and scan with the Even Hub companion app.

## Pack for distribution

```bash
npm run pack
```

The default `npm run build` keeps the `/app/` asset base used by the production
site and writes to `dist`. Packaging runs the separate `build:ehpk` target,
which uses relative asset URLs and writes to `dist-ehpk` before producing the
versioned `.ehpk` file.

## What's in here

| File | Purpose |
|---|---|
| `index.html` | WebView host. Viewport meta tag locks zoom; CSS kills iOS double-tap zoom + rubber-band scroll. |
| `src/main.ts` | Starts the Discord-only G2 flow and keeps phone-side diagnostics. |
| `app.json` | Even Hub manifest. No permissions by default. |
| `tsconfig.json` | Standard Vite vanilla-ts config. |
| `vite.config.ts` | Dev server on port 5173, host binding for LAN QR access. |

## Next steps

- Add containers, input handling, lifecycle events — see the `everything-evenhub` skill suite.
- Pick another template if you need microphone/STT (`asr`), image display (`image`), or long-form reading (`text-heavy`).
