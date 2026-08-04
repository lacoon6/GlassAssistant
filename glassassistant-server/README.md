# Glass Assistant Server

Node.js, Express, and TypeScript backend for Glass Assistant. Discord OAuth tokens remain in the server-side session and are never returned to the frontend.

## Setup

1. Copy `.env.example` to `.env` and fill in every value.
2. Add `DISCORD_REDIRECT_URI` as an exact redirect URL in the Discord Developer Portal.
3. Install dependencies and start development:

```bash
npm install
npm run dev
```

The frontend must set `VITE_API_URL` to this server's public HTTPS origin.

## API

- `GET /api/auth/login` — starts Discord authorization.
- `GET /api/auth/callback` — validates state and PKCE, exchanges the code, then redirects to `FRONTEND_URL`.
- `GET /api/auth/logout` — destroys the server session.
- `GET /api/discord/servers` — returns the signed-in user's servers.
- `GET /api/discord/channels?guildId=...` — returns channels for a server.
- `GET /api/discord/messages?channelId=...` — returns the latest 50 messages.
- `GET /health` — deployment health check.

## ConoHa VPS deployment with Apache

The production target uses the existing Apache2 server. Point `api.nobutv.org` to the VPS and allow inbound ports 22, 80, and 443 in the ConoHa firewall.

Copy `.env.production.example` to `.env` and configure:

```env
NODE_ENV=production
PORT=3100
TRUST_PROXY=true
FRONTEND_URL=https://your-even-hub-frontend.example
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_TARGET_GUILD_ID=
DISCORD_REDIRECT_URI=https://api.nobutv.org/api/auth/callback
SESSION_SECRET=a_cryptographically_random_secret_of_at_least_32_characters
REDIS_URL=redis://127.0.0.1:6379
CORS_ALLOWED_ORIGINS=
CORS_DIAGNOSTICS=false
```

Register `https://api.nobutv.org/api/auth/callback` exactly in the Discord Developer Portal. Restrict `.env` permissions and never expose its secrets to the frontend.

`DISCORD_BOT_TOKEN` is required at startup. Server listing uses the signed-in user's OAuth token. Channel and message access uses bot authentication only after the signed-in user's guild membership has been verified.

`DISCORD_TARGET_GUILD_ID` is optional. When omitted, the only guild shared by the signed-in user and bot is selected. Multiple shared guilds require an explicit ID.

CORS uses an exact-origin allowlist with credentials and `Vary: Origin`; it never returns a wildcard origin. Add only a confirmed WebView origin to `CORS_ALLOWED_ORIGINS`. Set `CORS_DIAGNOSTICS=true` temporarily to log origin, fetch-site, cookie/token presence booleans, route, and status without logging any credential values.

### PM2

Install Node.js, Redis, and PM2. The default production deployment uses PM2:

```bash
sudo systemctl enable --now redis-server
npm install --global pm2
chmod +x deployment.sh update.sh
./deployment.sh
pm2 startup
```

Run the command printed by `pm2 startup`, then run `pm2 save`. PM2 uses [ecosystem.config.cjs](./ecosystem.config.cjs), automatically restarts crashes, delays rapid restarts, and restarts the process if it exceeds the memory limit.

### Apache VirtualHost

The supplied [apache-vhost.conf](./apache-vhost.conf) contains:

```apache
ServerName api.nobutv.org
ProxyPass / http://127.0.0.1:3100/
ProxyPassReverse / http://127.0.0.1:3100/
```

Enable the required Apache modules:

```bash
sudo a2enmod proxy proxy_http rewrite ssl
sudo systemctl reload apache2
```

Apache terminates HTTPS and proxies requests to PM2 on `127.0.0.1:3100`. Keep `TRUST_PROXY=true` so Express recognizes the secure proxy connection and issues Secure session cookies.

### Let's Encrypt

Apache provides HTTPS. Before enabling the supplied TLS VirtualHost, obtain the certificate using the already-running Apache server:

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d api.nobutv.org
sudo certbot renew --dry-run
```

Certbot enables automatic renewal through systemd. Once `/etc/letsencrypt/live/api.nobutv.org/` exists, install and enable the supplied VirtualHost:

```bash
sudo cp apache-vhost.conf /etc/apache2/sites-available/glassassistant.conf
sudo a2ensite glassassistant.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### Auto restart

Run `pm2 startup` and `pm2 save` to restore Glass Assistant after a VPS reboot. Enable Apache and Redis at boot:

```bash
sudo systemctl enable apache2 redis-server
```

### Auto update

`update.sh` performs a fast-forward-only pull, installs locked dependencies, builds TypeScript, and gracefully reloads PM2. Test it manually, then optionally schedule it for the deployment user:

```cron
*/15 * * * * /absolute/path/to/glassassistant-server/update.sh >> /var/log/glassassistant-update.log 2>&1
```

Only enable unattended updates after establishing backups and rollback procedures.

### Optional Docker deployment

Docker remains available as an alternative to PM2:

```bash
docker compose build --pull
docker compose up -d
```

Compose binds the application to `127.0.0.1:3100`, runs Redis with persistent storage, performs health checks, and restarts containers automatically. Apache uses the same VirtualHost configuration. Do not run PM2 and the Docker app simultaneously because both bind port 3100.
