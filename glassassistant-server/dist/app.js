import cors from 'cors';
import express from 'express';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { discordRouter } from './routes/discord.js';
import { DiscordApiError } from './services/discordApi.js';
const app = express();
const redisClient = env.redisUrl ? createClient({ url: env.redisUrl }) : null;
if (redisClient) {
    redisClient.on('error', error => console.error('Redis error', error));
    await redisClient.connect();
}
if (env.trustProxy)
    app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(session({
    name: 'glassassistant.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: redisClient ? new RedisStore({ client: redisClient, prefix: 'glassassistant:' }) : undefined,
    cookie: {
        httpOnly: true,
        secure: env.nodeEnv === 'production',
        sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1_000,
    },
}));
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/discord', discordRouter);
app.use((error, _request, response, _next) => {
    if (error instanceof DiscordApiError) {
        response.status(error.status === 401 || error.status === 403 ? 401 : 502).json({ error: error.message });
        return;
    }
    console.error(error);
    response.status(500).json({ error: 'Internal server error' });
});
app.listen(env.port, () => {
    console.log(`Glass Assistant server listening on port ${env.port}`);
});
