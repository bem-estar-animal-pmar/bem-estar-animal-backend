import { Hono } from 'hono'
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { HTTPException } from 'hono/http-exception';
import { usersService } from './users.service';
import { listUsersQuerySchema } from './users.schema';

const app = new Hono<AuthEnv>()

/* private routes */

app.use('*', authMiddleware);

/* @desc list all user with filters and pagination
   @route GET https://example.com/api/admin/users/?role=USER&page=1&limit=20
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
    
    // Pass the entire sanitized query object to the service
    const result = await usersService.list(role, query);

    return ctx.json(result, 200);
});

export default app;