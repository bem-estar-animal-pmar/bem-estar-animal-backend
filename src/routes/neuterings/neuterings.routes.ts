import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { neuteringService } from "./neuterings.service";
import { createNeuteringSchema } from './neuterings.schema';

const app = new Hono<AuthEnv>();

app.use('*', authMiddleware);

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

export default app;