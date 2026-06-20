/**
 * Cloudflare Worker - Instagram Shopee Redirect
 * Tạo link Shopee với đầy đủ params để tự động mở app
 *
 * Deploy: https://dash.cloudflare.com/workers
 * URL: https://ig-shopee.your-subdomain.workers.dev
 */

const AFFILIATE_ID = '17352620178';
const SUB_ID_PREFIX = 'product----ig';

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS (CORS preflight)
function handleOptions() {
    return new Response(null, {
        headers: corsHeaders,
        status: 204
    });
}

// Generate random tracking ID (giống uls_trackid)
function generateTrackingId() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Generate random term (giống utm_term)
function generateUtmTerm() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Extract credential_token từ Shopee page (nếu có)
async function fetchCredentialToken(productUrl) {
    try {
        const response = await fetch(productUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            redirect: 'follow'
        });

        if (!response.ok) return null;

        const html = await response.text();

        // Try to extract credential_token from HTML
        // Pattern 1: JSON trong script tag
        const credMatch = html.match(/"credential_token["\s:]+([a-zA-Z0-9_-]+)"/i);
        if (credMatch && credMatch[1]) {
            return credMatch[1];
        }

        // Pattern 2: URL parameter trong HTML
        const urlMatch = html.match(/credential_token=([a-zA-Z0-9_-]+)/i);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }

        return null;
    } catch (error) {
        console.error('Error fetching credential_token:', error);
        return null;
    }
}

// Build Instagram Shopee URL
async function buildInstagramUrl(productUrl, fetchToken = true) {
    const affiliatePrefix = 'an_' + AFFILIATE_ID;

    // Base params (luôn có)
    const params = {
        mmp_pid: affiliatePrefix,
        utm_medium: 'affiliates',
        utm_source: affiliatePrefix,
        utm_content: SUB_ID_PREFIX,
        utm_campaign: '-',
        uls_trackid: generateTrackingId(),
        utm_term: generateUtmTerm()
    };

    // Thử fetch credential_token từ Shopee (optional)
    if (fetchToken) {
        const credentialToken = await fetchCredentialToken(productUrl);
        if (credentialToken) {
            params.credential_token = credentialToken;
        }
    }

    // Build URL với params
    const url = new URL(productUrl);
    Object.keys(params).forEach(key => {
        url.searchParams.set(key, params[key]);
    });

    return url.toString();
}

// Main handler
async function handleRequest(request) {
    const url = new URL(request.url);

    // Get params
    const productUrl = url.searchParams.get('go');
    const affType = url.searchParams.get('aff_type');

    if (!productUrl) {
        return new Response('Missing "go" parameter', { status: 400 });
    }

    // Validate Shopee URL
    if (!productUrl.includes('shopee.vn')) {
        return new Response('Invalid Shopee URL', { status: 400 });
    }

    try {
        // Build full Instagram URL với tracking params
        const redirectUrl = await buildInstagramUrl(productUrl, true);

        // Log for debugging (optional)
        console.log('Redirecting to:', redirectUrl);

        // Redirect 302 (temporary redirect)
        return Response.redirect(redirectUrl, 302);

    } catch (error) {
        console.error('Error:', error);

        // Fallback: redirect without credential_token
        try {
            const fallbackUrl = await buildInstagramUrl(productUrl, false);
            return Response.redirect(fallbackUrl, 302);
        } catch {
            // Last resort: redirect to original URL
            return Response.redirect(productUrl, 302);
        }
    }
}

// Event listener
addEventListener('fetch', event => {
    const request = event.request;

    if (request.method === 'OPTIONS') {
        event.respondWith(handleOptions());
    } else if (request.method === 'GET') {
        event.respondWith(handleRequest(request));
    } else {
        event.respondWith(new Response('Method not allowed', { status: 405 }));
    }
});
