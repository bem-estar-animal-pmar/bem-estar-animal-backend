import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth.js"
import { HTTPException } from "hono/http-exception";

/* define type and export, for TS to use them */
export type AuthEnv = {
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null;
    };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (ctx, next) => {
    /* since our application is based on cookies only (better auth standart), this application checks for headers with the cookie,
     every fetch to protected routes on frontend must have crendentials: true on it */
    const headers = ctx.req.raw.headers;

    const session = await auth.api.getSession({
        headers,
    });

    if (!session) {
        ctx.set("user", null);
        ctx.set("session", null);
        throw new HTTPException(401, { message: 'Invalid or expired session' })
    }

    ctx.set("user", session.user);
    ctx.set("session", session.session);

    await next();
});
