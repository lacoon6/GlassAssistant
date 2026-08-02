# Glass Assistant Server

Node.js, Express, and TypeScript backend for Glass Assistant. Discord OAuth tokens remain in the server-side session and are never returned to the frontend.

## Setup

1. Copy `.env.example` to `.env` and fill in every value.
2. In the Discord Developer Portal, add `DISCORD_REDIRECT_URI` as an exact OAuth2 redirect URL.
3. Use a Discord application client ID and secret. The login requests the `identify` and `guilds` scopes and uses Authorization Code Flow with PKCE.
4. Install and run:

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
- `GET /health` — health check for deployment monitoring.

Discord endpoints return `401` when the session is absent or cannot be refreshed. Access tokens, refresh tokens, expiration, OAuth state, and the PKCE verifier are stored only in the server session.

## ConoHa VPS deployment

Point an API subdomain to the ConoHa VPS, allow inbound TCP ports 22, 80, and 443 in the ConoHa security group/firewall, and install Git, Docker Engine, the Docker Compose plugin, Nginx, and Certbot. Clone the repository, enter `glassassistant-server`, copy `.env.production.example` to `.env`, and replace every example value. In production use:

```env
NODE_ENV=production
PORT=3000
TRUST_PROXY=true
FRONTEND_URL=https://your-even-hub-frontend.example
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=https://api.example.com/api/auth/callback
SESSION_SECRET=a_cryptographically_random_secret_of_at_least_32_characters
REDIS_URL=redis://redis:6379
```

Register `DISCORD_REDIRECT_URI` exactly in the Discord Developer Portal. Keep `.env` readable only by the deployment user. Deploy the Docker stack with:

```bash
chmod +x deployment.sh update.sh
./deployment.sh
```

Docker Compose binds Node only to `127.0.0.1:3000`, persists sessions in Redis, checks application health, and applies `restart: unless-stopped` for automatic restart after crashes or VPS reboots.

### PM2

PM2 is an alternative when running Node directly instead of Docker. Install and build, run Redis locally, set `REDIS_URL=redis://127.0.0.1:6379`, then start the supplied ecosystem file:

```bash
npm ci
npm run build
npm install --global pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`, then run `pm2 save` again. The ecosystem configuration enables automatic restart, a restart delay, memory limits, and timestamped logs. Do not run the Docker app service and PM2 simultaneously on port 3000.

### Nginx

Copy `nginx.conf` to `/etc/nginx/sites-available/glassassistant`, replace every `api.glassassistant.example.com` with the real API hostname, enable it, and validate the configuration:

```bash
sudo ln -s /etc/nginx/sites-available/glassassistant /etc/nginx/sites-enabled/glassassistant
sudo nginx -t
sudo systemctl reload nginx
```

Nginx terminates TLS and forwards the host, client address, and original HTTPS protocol to Express. `TRUST_PROXY=true` is required so Express can issue Secure session cookies behind this proxy.

### Let's Encrypt

Before enabling the TLS server block for the first certificate, serve the domain over port 80 and obtain a certificate:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
sudo certbot renew --dry-run
```

Certbot installs automatic renewal through systemd. After the certificate exists, use the supplied TLS paths (updated for the real hostname), run `sudo nginx -t`, and reload Nginx.

### Auto restart

Docker uses `restart: unless-stopped`; Redis data lives in the `redis-data` volume. For PM2, `pm2 startup` plus `pm2 save` restores the process after reboot. Enable Nginx and Docker at boot with `sudo systemctl enable --now nginx docker`.

### Auto update

`update.sh` performs a fast-forward-only Git pull, rebuilds images, recreates changed containers, removes unused images, and prints service health. Run it manually first. To check for updates every 15 minutes, add this deployment-user cron entry:

```cron
*/15 * * * * /absolute/path/to/glassassistant-server/update.sh >> /var/log/glassassistant-update.log 2>&1
```

Only enable unattended updates after protecting the deployment branch and confirming that rollback and backups meet your operational requirements. Redis sessions survive application replacement through the named volume.
