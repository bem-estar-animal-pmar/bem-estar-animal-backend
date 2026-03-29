import { Hono } from "hono"
import { cors } from "hono/cors"

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


app.get('/', (c) => {
  	return c.text(`Hello Hono! ${process.env.NODE_ENV}`)
})

export default app;
