import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./authHandler";
import { HTTPException } from "hono/http-exception";

export const termsMiddleware = createMiddleware<AuthEnv>(async (ctx, next) => {
    const user = ctx.get("user");

    if (!user) {
        throw new HTTPException(401, { message: 'Invalid or expired Session' })
    }

    if ((!user.termsAcceptedAt || !user.privacyAcceptedAt) && user.role !== "ADMIN") {
        throw new HTTPException(403, { message: "Terms acceptance required" });
    }

    if (user.deletedAt !== null) {
        throw new HTTPException(403, { message: "Account deleted by the user" });
    }

    await next();
});