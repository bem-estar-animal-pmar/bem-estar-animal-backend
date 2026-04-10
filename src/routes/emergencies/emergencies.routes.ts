import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { emergencyService } from "./emergencies.service";
import { createEmergencySchema, listEmergenciesQuerySchema, updateEmergencyStatusSchema } from './emergencies.schema';

const app = new Hono<AuthEnv>();

app.use('*', authMiddleware);

/* @desc create a new emergency appointment request
   @route POST /api/emergencies
   @access private (USER) */
app.post('/', async (ctx) => {
    const user = ctx.get("user")!;
    const body = await ctx.req.json();
    const validation = createEmergencySchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const appointment = await emergencyService.create(user.id, validation.data);
    
    return ctx.json({
        data: appointment,
        message: "Emergency request created. The clinic will review and schedule your appointment."
    }, 201);
});

/* @desc list current user's emergency requests
   @route GET /api/emergencies/me
   @access private (USER) */
app.get('/me', async (ctx) => {
    const user = ctx.get("user")!;
    const rawQuery = ctx.req.query();
    const validation = listEmergenciesQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    const appointments = await emergencyService.listByUser(user.id, validation.data);
    return ctx.json(appointments, 200);
});

/* @desc list all emergency requests
   @route GET /api/emergencies
   @access private (ADMIN) */
app.get('/', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const rawQuery = ctx.req.query();
    const validation = listEmergenciesQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    const appointments = await emergencyService.list(role, validation.data);
    return ctx.json(appointments, 200);
});

/* @desc admin updates emergency status (schedules or completes)
   @route PATCH /api/emergencies/:id/status
   @access private (ADMIN) */
app.patch('/:id/status', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const appointmentId = ctx.req.param('id');

    const body = await ctx.req.json();
    const validation = updateEmergencyStatusSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const updated = await emergencyService.updateStatus(appointmentId, role, validation.data);
    return ctx.json({ data: updated, message: "Emergency status updated successfully" }, 200);
});

export default app;