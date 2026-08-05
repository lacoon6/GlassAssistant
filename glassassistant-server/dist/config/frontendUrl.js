export function parseFrontendUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error('FRONTEND_URL must be a valid absolute URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('FRONTEND_URL must use http or https');
    }
    return { frontendUrl: value, frontendOrigin: parsed.origin };
}
export function frontendAuthResultUrl(frontendUrl, result) {
    const parsed = new URL(frontendUrl);
    parsed.search = '';
    parsed.hash = '';
    parsed.searchParams.set('auth', result);
    return parsed.toString();
}
