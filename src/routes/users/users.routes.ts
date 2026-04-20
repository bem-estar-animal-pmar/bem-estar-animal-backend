import { Hono } from 'hono'
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { usersService } from './users.service';
import { listUsersQuerySchema } from './users.schema';

const app = new Hono<AuthEnv>()

/* private routes */

app.use('*', authMiddleware);

/* @desc list all user with filters
   @route GET https://example.com/api/admin/users/?name=Rex&srole=USER
   @access private (ADMIN) */
app.get('/', async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */
    
    const rawQuery = ctx.req.query();
    const validation = listUsersQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, {  message: "Validation Error. Invalid params", cause: validation.error })
    }

    const query = validation.data;
    const role = user.role ?? "USER"; 
    /* filters here are used for direct match, not for listing */
    const users = await usersService.list(role, {
        id: query.id,
        role: query.role,
        cpf: query.cpf,
    });

    return ctx.json(users, 200);
});

export default app;