/* this rate-limiter works only on tradicional 24/7 servers like Render, Railway (WHEN USING A SINGLE INSTACE OF THE APP), 
DigitalOcean (VPS), because it depends on RAM memory to count the access attempts. 

on serverless plataforms like Vercel, Cloudflare Workers, AWS Lambda this won't work, because there is no server online, these
plataforms runs the app everytime someone access it and destroys seconds later. */

/* if added domain protection and later, must updated the middleware to get the cloudflare proxy user ip */

import { rateLimiter } from "hono-rate-limiter";
import { getConnInfo } from "hono/bun";
import type { AuthEnv } from "./authHandler.js";
import type { Context } from "hono";

/* trusting x-forwarded-for is bad because if miss configured of if it is not behind a real proxy (railway or cloudflare), malicious
users might set fake headers with spoofed IPs, but we don't care here BECAUSE this backend is meant to run on railway */

const getClientIp = (c: Context) => {
    /* when putting cloudflare in front of railway, the flux of the user IP comes like this:
        user (IP: 1.2.3.4) -> cloudflare (IP: 99.99.99.99) ➔ Railway Server
    so we need to look for "cf-connecting-ip" to check first if it is being proxied by cloudflare and get user's real ip */
    const cf = c.req.header("cf-connecting-ip")
    if (cf) {
        return cf;
    }
    
    /* in production, x-forwarded-for might be a bunch of ips 203.0.113.1, 70.41.3.18, 150.172.238.178 from every server
    it was parsed, being the first one the client ip, so we must split and try to get the first one */
    const xf = c.req.header("x-forwarded-for")
    if (xf) {
        return xf.split(",")[0].trim();
    }

    try {
        const info = getConnInfo(c);
        if (info.remote.address) {
            return info.remote.address;
        }
    } catch (e) {
        /* failsafe in case getConnInfo throws in a weird environment */
    }   

    return "unknown";
}

export const globalRateLimiter = rateLimiter({
    windowMs: 60 * 1000,
    limit: 100,

    keyGenerator: (c) => {
        return getClientIp(c);
    },

    standardHeaders: true,
});

export const strictRateLimiter = (window: number = 60 * 1000, limit: number = 10) => rateLimiter<AuthEnv>({
    windowMs: window,
    limit: limit,
    keyGenerator: (c) => {
        const user = c.get("user");

        if (user?.id) {
            return `user:${user.id}`;
        }

        return getClientIp(c);
    },
    standardHeaders: true,
});

/*

1. The Direct Connection (How it works locally)
When you are testing on your own machine (localhost), there are no middlemen. The flow is:
Your Browser ➔ Your Bun Server

Because they are directly connected, the server can look at the raw network socket (the actual TCP connection) and see exactly who is knocking on the door. It doesn't need to look at HTTP headers at all; it just asks the socket, "What is your IP?" (which usually returns 127.0.0.1 or ::1).

2. The Proxy Chain (How it works in production)
When you deploy to a service like Railway and put Cloudflare in front of it, you introduce middlemen (proxies). The flow looks like this:
User (IP: 99.1.2.3) ➔ Cloudflare ➔ Railway ➔ Your Bun Server

Here is the problem: Your Bun server is only directly connected to Railway. Railway is directly connected to Cloudflare.
If your Bun server checks the raw network socket now, it will see Cloudflare's IP, not the User's IP. If your rate limiter triggers on the raw socket IP, it will block Cloudflare—effectively banning every single user on your app at the same time.

3. The Solution: Forwarding Headers
To solve this, proxies are designed to "pass the message along" using HTTP Headers.

Before Cloudflare sends the request to Railway, it stamps the user's real IP onto the request like a sticky note. Railway reads it, adds its own notes, and passes it to your server.

This is what those specific headers mean:

x-forwarded-for: This is the industry standard header. Every time a request passes through a proxy, that proxy adds the previous IP to a comma-separated list. It usually looks like this:
x-forwarded-for: 99.1.2.3, 10.0.0.1 (User IP, Proxy 1 IP)
Because it's a list, your code (in limitHandler.ts) splits it by the comma and grabs the first one, which is the original user.

cf-connecting-ip: This is Cloudflare's custom "sticky note." Unlike x-forwarded-for, which is a messy list, Cloudflare guarantees that this header will contain only the original user's IP. It is much safer to rely on this in production because malicious users can fake the x-forwarded-for header, but Cloudflare strictly overwrites cf-connecting-ip so it can't be spoofed.

4. Why Better Auth is working locally without the workaround
You mentioned that you aren't using the x-forwarded-for injection workaround, but Better Auth's rate limiter is still triggering.

Here is exactly why that is happening:
When you spam your local server, Better Auth checks for the x-forwarded-for header (because of your getTrustedIp() config). It doesn't find one.

When a rate limiter can't find an IP, it doesn't just crash or skip the check. It assigns the request a fallback identifier (usually the string "unknown", "127.0.0.1", or a blank string). Because all of your local requests are falling back to the exact same "unknown" identifier, Better Auth throws them all into the same bucket.

Once that single bucket hits 100 requests, it blocks you. So, it is successfully rate-limiting you, but it's rate-limiting the fallback bucket, not your actual IP. For local development, this is perfectly fine, which is why you can safely ignore that workaround unless you specifically need to test IP spoofing!

---------------

To be 100% safe, you must protect your infrastructure.Right now, your code blindly trusts cf-connecting-ip. 
That is safe if and only if the request actually came from Cloudflare, because Cloudflare automatically strips out fake IP headers and inserts the real one.
The One Vulnerability (Infrastructure, not Code)By default, Railway gives your app a public URL (e.g., my-cool-app.up.railway.app).
If a malicious user figures out that Railway URL, they can bypass Cloudflare completely. 

They can send a request directly to Railway with a fake header:cf-connecting-ip: 12.34.56.78
Because the request bypassed Cloudflare, Railway just passes that fake header straight to your Hono app. 
Your app trusts it, and the attacker bypasses your rate limits.How to lock it downTo make your current code 100% secure, you must ensure that your Railway server only accepts traffic that successfully passed through Cloudflare.

Here are the two easiest ways to do that when you go to production:

The Secret Header Method (Highly Recommended): 
In your Cloudflare dashboard, you can set a rule to inject a secret custom header into every request before it goes to Railway (e.g., X-Cloudflare-Secret: my-random-uuid). 
Then, you add three lines of middleware to Hono that instantly drops any request missing that secret password.

Disable the Railway Public URL: 
Once you connect your custom domain to Cloudflare and route it to Railway, you can remove the default up.railway.app public domain from your Railway project settings.
(Note: Some Railway setups still expose raw IPs, so Method 1 is generally safer).
If you put one of those infrastructure locks in place, your code is bulletproof. */