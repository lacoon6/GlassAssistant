import 'dotenv/config';
function required(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`Missing required environment variable: ${name}`);
    return value;
}
function getNodeEnv() {
    const value = process.env.NODE_ENV ?? 'development';
    if (value === 'development' || value === 'production' || value === 'test')
        return value;
    throw new Error('NODE_ENV must be development, production, or test');
}
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid TCP port');
export const env = {
    nodeEnv: getNodeEnv(),
    port,
    trustProxy: process.env.TRUST_PROXY === 'true',
    frontendUrl: required('FRONTEND_URL'),
    discordClientId: required('DISCORD_CLIENT_ID'),
    discordClientSecret: required('DISCORD_CLIENT_SECRET'),
    discordRedirectUri: required('DISCORD_REDIRECT_URI'),
    sessionSecret: required('SESSION_SECRET'),
    redisUrl: process.env.REDIS_URL?.trim() || undefined,
};
if (env.nodeEnv === 'production' && !env.redisUrl) {
    throw new Error('REDIS_URL is required in production');
}
