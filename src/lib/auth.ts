import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";


const allowedOrigins = process.env.ALLOWED_CORS_URLS ? JSON.parse(process.env.ALLOWED_CORS_URLS) : ["http://localhost:3000"];

const getTrustedOrigins = () => {
    if (process.env.NODE_ENV !== "production") {
        return ["http://localhost:3000"];
    }
    return allowedOrigins;
};

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
    },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: getTrustedOrigins(), /* allow next (port 3000) to access this provider */
    advanced: {
        useSecureCookies: process.env.NODE_ENV === "production"
    }
});