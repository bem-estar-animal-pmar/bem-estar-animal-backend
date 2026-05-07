import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { emergencyService } from "./emergencies.service";
import { createEmergencySchema, adminCreateEmergencySchema, listEmergenciesQuerySchema, updateEmergencyStatusSchema } from './emergencies.schema';

const app = new Hono<AuthEnv>();

app.use('*', authMiddleware);

/* @desc create a new emergency appointment request
   @route POST /api/emergencies
   @access private (USER) */
app.post('/', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const body = await ctx.req.json();
    const validation = createEmergencySchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const appointment = await emergencyService.create(user.id, role, validation.data);
    
    return ctx.json(appointment, 201);
});

/* @desc create a new neutering appointment as admin, usually for registering completed appointments
   @route POST /api/emergencies/admin-register
   @access private (ADMIN) */
app.post('/admin-register', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const body = await ctx.req.json();
    const validation = adminCreateEmergencySchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const appointment = await emergencyService.createByAdmin(user.id, role, validation.data);
    
    return ctx.json(appointment, 201);
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

/* @desc get a specific emergency data 
   @route GET https://example.com/api/emergencies/details/:id
   @access private (USER, ADMIN) */
app.get('/details/:id', async (ctx) => {
    const user = ctx.get("user")!;

    const emergencyId = ctx.req.param('id');
    const role = user.role ?? "USER";

    const result = await emergencyService.getById(emergencyId, user.id, role);
    return ctx.json(result, 200);
});

/* @desc list all emergency requests (with filters and pagination)
   @route GET /api/emergencies?page=1&limit=20
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
    const appointmentId = ctx.req.param('id');

    const body = await ctx.req.json();
    const validation = updateEmergencyStatusSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const updated = await emergencyService.updateStatus(appointmentId, user.id, validation.data);
    return ctx.json(updated, 200);
});

/* @desc user cancels their own appointment
   @route PATCH /api/emergencies/:id/cancel
   @access private (USER) */
app.patch('/:id/cancel', async (ctx) => {
    const user = ctx.get("user")!;
    const appointmentId = ctx.req.param('id');

    const cancelled = await emergencyService.cancel(appointmentId, user.id);
    return ctx.json({ data: cancelled, message: "Appointment cancelled successfully" }, 200);
});

export default app;