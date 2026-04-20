import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { neuteringService } from "./neuterings.service";
import { createNeuteringSchema, listNeuteringsQuerySchema, updateNeuteringStatusSchema } from './neuterings.schema';

const app = new Hono<AuthEnv>();

app.use('*', authMiddleware);

/* @desc list current user's neutering appointments
   @route GET /api/neutering/me
   @access private (USER, ADMIN) */
app.get('/me', async (ctx) => {
    const user = ctx.get("user")!;
    const rawQuery = ctx.req.query();
    const validation = listNeuteringsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    const appointments = await neuteringService.listByUser(user.id, validation.data);
    return ctx.json(appointments, 200);
});

/* @desc list all neutering appointments (with filters and pagination)
   @route GET /api/neutering?page=1&limit=20
   @access private (ADMIN) */
app.get('/', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const rawQuery = ctx.req.query();
    const validation = listNeuteringsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    const appointments = await neuteringService.list(role, validation.data);
    return ctx.json(appointments, 200);
});

/* @desc create a new neutering appointment
   @route POST /api/neutering
   @access private (USER, ADMIN) */
app.post('/', async (ctx) => {
    const user = ctx.get("user")!;

    const body = await ctx.req.json();
    const validation = createNeuteringSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const appointment = await neuteringService.create(user.id, validation.data);
    
    return ctx.json(appointment, 201);
});

/* @desc admin updates appointment status (can cancel) (or reschedules)
   @route PATCH /api/neutering/:id/status
   @access private (ADMIN) */
app.patch('/:id/status', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const appointmentId = ctx.req.param('id');

    const body = await ctx.req.json();
    const validation = updateNeuteringStatusSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const updated = await neuteringService.updateStatus(appointmentId, role, validation.data);
    return ctx.json({ data: updated, message: "Status updated successfully" }, 200);
});

/* @desc user cancels their own appointment
   @route PATCH /api/neutering/:id/cancel
   @access private (USER) */
app.patch('/:id/cancel', async (ctx) => {
    const user = ctx.get("user")!;
    const appointmentId = ctx.req.param('id');

    const cancelled = await neuteringService.cancelByUser(appointmentId, user.id);
    return ctx.json({ data: cancelled, message: "Appointment cancelled successfully" }, 200);
});

export default app;