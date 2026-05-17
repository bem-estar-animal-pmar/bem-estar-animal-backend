import { Hono } from "hono"
import { cors } from "hono/cors"
import { auth } from "./lib/auth";
import { errorMiddleware } from "./middleware/errorHandler";

import "./jobs/appointments.jobs"

import petsRouter from "./routes/pets/pets.routes"
import neuteringRouter from "./routes/neuterings/neuterings.routes"
import emergencyRouter from "./routes/emergencies/emergencies.routes"
import adoptionRouter from "./routes/adoptions/adoptions.routes"
import medicalRecordRouter from "./routes/medical-records/medical-records.routes"
import userRouter from "./routes/users/users.routes"

/* SQL Inject is protected by Prisma */
/* CORS is configured */
/* secureHeaders must add */
/* CSRF and Auth protection configured by better auth */
/* XSS script injection: zod is cleaning all auth fields, must check other routes */
/* rate limiter must add on better auth and here */
/* IDOR protection: must check each route */

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