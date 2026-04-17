import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { adoptionsService } from "./adoptions.service";
import { createGiveUpSchema, updateGiveUpStatusSchema, createAdoptionSchema, updateAdoptionStatusSchema, listRequestsQuerySchema } from './adoptions.schema';

const app = new Hono<AuthEnv>();

/* public route */

/* @desc public form to request adoption of a pet
   @route POST /api/adoptions/request
   @access public (any) */
app.post('/request', async (ctx) => {
    const body = await ctx.req.json();
    const validation = createAdoptionSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const request = await adoptionsService.createAdoption(validation.data);
    return ctx.json({ data: request, message: "Adoption request sent successfully" }, 201);
});

/* private routes */

app.use('*', authMiddleware);

/* @desc list current user's give up requests
   @route GET /api/adoptions/give-up/me
   @access private (USER) */
app.get('/give-up/me', async (ctx) => {
    const user = ctx.get("user")!;
    const rawQuery = ctx.req.query();
    const validation = listRequestsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    const requests = await adoptionsService.listGiveUpsByUser(user.id, validation.data);
    return ctx.json(requests, 200);
});

/* @desc list all give up requests (users wanting to donate)
   @route GET /api/adoptions/give-up
   @access private (ADMIN) */
app.get('/give-up', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const rawQuery = ctx.req.query();
    const validation = listRequestsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    const requests = await adoptionsService.listGiveUps(role, validation.data);
    return ctx.json(requests, 200);
});

/* @desc list all adoption requests (people wanting to adopt)
   @route GET /api/adoptions/request
   @access private (ADMIN) */
app.get('/request', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const rawQuery = ctx.req.query();
    const validation = listRequestsQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    // Nota: Aqui não tem o /request/me porque quem pede para adotar não precisa 
    // ter conta logada no momento do pedido (rota pública). O tracking é feito pelo Admin.
    const requests = await adoptionsService.listAdoptions(role, validation.data);
    return ctx.json(requests, 200);
});

/* @desc user requests to give up their pet
   @route POST /api/adoptions/give-up
   @access private (USER) */
app.post('/give-up', async (ctx) => {
    const user = ctx.get("user")!;
    const body = await ctx.req.json();
    const validation = createGiveUpSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const request = await adoptionsService.createGiveUp(user.id, validation.data);
    return ctx.json({ data: request, message: "Give up request submitted" }, 201);
});

/* @desc user cancels their own give up request
   @route PATCH /api/giveup/:id/cancel
   @access private (USER) */
app.patch('/give-up/:id/cancel', async (ctx) => {
    const user = ctx.get("user")!;
    const requestId = ctx.req.param('id');

    const cancelled = await adoptionsService.cancelGiveUpByUser(requestId, user.id);
    return ctx.json({ data: cancelled, message: "Give up request cancelled successfully" }, 200);
});

/* @desc admin updates a give up request (Approve = Pet goes to adoption vitrine)
   @route PATCH /api/adoptions/give-up/:id/status
   @access private (ADMIN) */
app.patch('/give-up/:id/status', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const requestId = ctx.req.param('id');

    const body = await ctx.req.json();
    const validation = updateGiveUpStatusSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const updated = await adoptionsService.updateGiveUpStatus(requestId, role, validation.data);
    return ctx.json(updated, 200);
});

/* @desc admin approves/rejects an adoption request
   @route PATCH /api/adoptions/request/:id/status
   @access private (ADMIN) */
app.patch('/request/:id/status', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const requestId = ctx.req.param('id');

    const body = await ctx.req.json();
    const validation = updateAdoptionStatusSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Validation Error", cause: validation.error });
    }

    const updated = await adoptionsService.updateAdoptionStatus(requestId, role, validation.data);
    return ctx.json(updated, 200);
});

export default app;