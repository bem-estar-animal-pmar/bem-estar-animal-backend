import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { neuteringService } from "./neuterings.service";
import { createNeuteringSchema, adminCreateNeuteringSchema, listNeuteringsQuerySchema, updateNeuteringStatusSchema, calendarQuerySchema, updateNeuteringLimitsSchema } from './neuterings.schema';

const app = new Hono<AuthEnv>();

app.use('*', authMiddleware);

/* @desc list current user's neutering appointments
   @route GET /api/neuterings/me
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
   @route GET /api/neuterings?page=1&limit=20
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

/* @desc get a specific neutering details
   @route GET https://example.com/api/neuterings/details/:id
   @access private (USER, ADMIN) */
app.get('/details/:id', async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */

    const neuteringId = ctx.req.param('id');
    const role = user.role ?? "USER";

    const result = await neuteringService.getById(neuteringId, user.id, role);
    return ctx.json(result, 200);
});


/* @desc create a new neutering appointment
   @route POST /api/neuterings
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

/* @desc create a new neutering appointment as admin, usually for registering completed appointments
   @route POST /api/neuterings/admin-register
   @access private (ADMIN) */
app.post('/admin-register', async (ctx) => {
    const user = ctx.get("user")!;

    const body = await ctx.req.json();
    const validation = adminCreateNeuteringSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const appointment = await neuteringService.createByAdmin(user.id, validation.data);
    
    return ctx.json(appointment, 201);
});

/* @desc admin updates appointment status (can cancel) (or reschedules)
   @route PATCH /api/neutering/status/:id
   @access private (ADMIN) */
app.patch('/status/:id', async (ctx) => {
    const user = ctx.get("user")!;
    const appointmentId = ctx.req.param('id');

    const body = await ctx.req.json();
    const validation = updateNeuteringStatusSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const updated = await neuteringService.updateStatus(appointmentId, user.id, validation.data);
    return ctx.json({ data: updated, message: "Status updated successfully" }, 200);
});

/* @desc user cancels their own appointment
   @route PATCH /api/neutering/:id/cancel
   @access private (USER) */
app.patch('/cancel/:id', async (ctx) => {
    const user = ctx.get("user")!;
    const appointmentId = ctx.req.param('id');

    const cancelled = await neuteringService.cancel(appointmentId, user.id);
    return ctx.json({ data: cancelled, message: "Appointment cancelled successfully" }, 200);
});

/* neutering quotas related routes */

/* @desc get appointment counts for calendar distribution
   @route GET /api/neutering/calendar?startDate=2026-05-01&endDate=2026-05-31
   @access private (USER, ADMIN) */
app.get('/calendar', async (ctx) => {
    const user = ctx.get("user")!;
    if (!user) {
        throw new HTTPException(403, { message: "Unauthorized access to calendar data" });
    }

    const rawQuery = ctx.req.query();
    const validation = calendarQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid date parameters", cause: validation.error });
    }

    const calendarData = await neuteringService.getCalendarCounts(
        validation.data.startDate,
        validation.data.endDate
    );
    
    return ctx.json(calendarData, 200);
});

app.patch('/quotas', async (ctx) => {
    const user = ctx.get("user")!;
    const body = await ctx.req.json();
    const validation = updateNeuteringLimitsSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const updated = await neuteringService.updateLimits(user.id, validation.data);
    return ctx.json({ data: updated, message: "Quotas updated successfully" }, 200);
});


app.get('/quotas', async (ctx) => {
    const quotas = await neuteringService.getQuotas();
    return ctx.json(quotas, 200);
});

export default app;