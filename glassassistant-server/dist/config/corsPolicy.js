export function createCorsOptions(allowedOrigins) {
    const allowlist = new Set(allowedOrigins);
    return {
        credentials: true,
        origin(origin, callback) {
            if (origin === undefined || allowlist.has(origin))
                callback(null, origin ?? false);
            else
                callback(new Error('CORS origin denied'));
        },
    };
}
export function buildCorsAllowlist(frontendOrigin, backendOrigin, additional = '') {
    return [...new Set([
            frontendOrigin,
            backendOrigin,
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            ...additional.split(',').map(value => value.trim()).filter(Boolean),
        ])];
}
