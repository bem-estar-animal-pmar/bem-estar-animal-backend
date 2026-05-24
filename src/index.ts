import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth } from "./lib/auth";
import { errorMiddleware } from "./middleware/errorHandler";
import { secureHeaders } from "hono/secure-headers";
import { globalRateLimiter } from "./middleware/limitHandler";
import { bodyLimit } from "hono/body-limit";
import "./jobs/appointments.jobs"
import "./jobs/accounts.jobs"

import petsRouter from "./routes/pets/pets.routes"
import neuteringRouter from "./routes/neuterings/neuterings.routes"
import emergencyRouter from "./routes/emergencies/emergencies.routes"
import adoptionRouter from "./routes/adoptions/adoptions.routes"
import medicalRecordRouter from "./routes/medical-records/medical-records.routes"
import userRouter from "./routes/users/users.routes"

/* IDOR, SQL Injection and XSS is protected by Prisma and zod */
/* secureHeaders basics added */
/* CORS is configured */
/* CSRF and Auth protection configured by better auth */
/* rate limiter must add on better auth and here */
/* IDOR protection: must check each route */

const app = new Hono();

app.use('*', secureHeaders());

const allowedOrigins = process.env.ALLOWED_CORS_URLS ? JSON.parse(process.env.ALLOWED_CORS_URLS) : ["http://localhost:3000"];

app.use("/api/*", globalRateLimiter);

app.use("/api/*", bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) => {
        return c.json({ error: "Payload Too Large. Maximum allowed size is 5MB." }, 413);
    },
}));

app.use('*', cors({
    origin: (origin, c) => {
        if (!origin) {
            return null;
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

app.route('/api/pets', petsRouter);
app.route('/api/neuterings', neuteringRouter);
app.route('/api/emergencies', emergencyRouter);
app.route('/api/adoptions', adoptionRouter);
app.route('/api/medical-records', medicalRecordRouter);
app.route('/api/admin/users', userRouter);

app.get('/', (c) => {
	return c.text('Hello Hono!')
})

app.on(['POST', 'GET'], '/api/auth/**', (c) => {
    console.log("req")
    return auth.handler(c.req.raw);
});

const server = Bun.serve({
    fetch: app.fetch,
    port: Number(process.env.PORT) || 3000
});

console.log(`Server running on ${server.url}`);