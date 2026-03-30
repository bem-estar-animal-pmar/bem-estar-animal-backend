import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth } from "./lib/auth";
import { errorMiddleware } from "./middleware/errorHandler";

const app = new Hono();

const allowedOrigins = process.env.ALLOWED_CORS_URLS ? JSON.parse(process.env.ALLOWED_CORS_URLS) : ["http://localhost:3000"];

app.use('*', cors({
    origin: (origin, c) => {
        if (!origin) {
            return origin;
        }

        if (process.env.NODE_ENV !== "production") {
            return origin;
        }
       
        if (allowedOrigins.includes(origin)) {
            return origin;
        }
       
        return null;
    },
    allowMethods: ["POST", "GET", "OPTIONS", "PUT", "PATCH", "DELETE"],
    credentials: true, /* must use credentials true to allow frontend to send cookies */
}))

app.onError(errorMiddleware());

import { prisma } from "./lib/prisma"

app.get('/', async (c) => {
	try {
		const result = await prisma.$queryRaw`SELECT 1 as status_conexao`;
		return c.text(`Hello Hono! ${process.env.NODE_ENV} | bd connected succesfully ${result}`);
	} catch (error) {
		return c.text(`Hello Hono! ${process.env.NODE_ENV} | bd didn't connect`);
	}
})

app.on(['POST', 'GET'], '/api/auth/**', (c) => {
    return auth.handler(c.req.raw);
});

const server = Bun.serve({
    fetch: app.fetch,
    port: Number(process.env.PORT) || 3000
});

console.log(`Server running on ${server.url}`);