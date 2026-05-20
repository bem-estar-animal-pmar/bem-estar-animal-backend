import { Hono } from 'hono'
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { termsMiddleware } from '../../middleware/termsHandler';
import { HTTPException } from 'hono/http-exception';
import { usersService } from './users.service';
import { adminUpdateUserSchema, listUsersQuerySchema, adminUpdateBlockSchema, adminUpdateRoleSchema } from './users.schema';

const app = new Hono<AuthEnv>()

/* private routes */

app.use('*', authMiddleware);

/* @desc reaccept terms
   @route POST /api/admin/users/reaccept-terms
   @access private */
app.post("/reaccept-terms", async (ctx) => {
    const user = ctx.get("user")!;

    await usersService.reacceptTerms(user.id);

    return ctx.json({
        message: "Terms accepted successfully"
    });
});

/* @desc revoke LGPD consent
   @route POST /api/admin/users/revoke-terms
   @access private */
app.post("/revoke-terms", async (ctx) => {
    const user = ctx.get("user")!;

    await usersService.revokeTerms(user.id);

    return ctx.json({
        message: "Terms revoked successfully"
    });
});

/* @desc flag account to be deleted after 30 days
   @route POST /api/admin/users/deactivate-account
   @access private (USER) */
app.post("/deactivate-account", async (ctx) => {
    const user = ctx.get("user")!;
    await usersService.deactivateAccount(user.id);

    return ctx.json({
        message: "Account deactivated successfuly"
    });
});

/* @desc reactivate user account
   @route POST /api/admin/users/reactivate-account
   @access private (USER) */
app.post("/reactivate-account", async (ctx) => {
    const user = ctx.get("user")!;
    await usersService.reactivateAccount(user.id);

    return ctx.json({
        message: "Account reactivated successfuly"
    });
});

/* ---!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! user auto-delete route should be here --- */

app.use('*', termsMiddleware);

/* @desc list all user with filters and pagination
   @route GET https://example.com/api/admin/users/?role=USER&page=1&limit=20
   @access private (ADMIN) */
app.get('/', async (ctx) => {
    const user = ctx.get("user")!; /* authMiddle already make sure 'user' exists */
    
    const rawQuery = ctx.req.query();
    const validation = listUsersQuerySchema.safeParse(rawQuery);

    if (!validation.success) {
        throw new HTTPException(400, {  message: "Invalid query params", cause: validation.error })
    }

    const query = validation.data;
    const role = user.role ?? "USER"; 
    
    // Pass the entire sanitized query object to the service
    const result = await usersService.list(role, query);

    return ctx.json(result, 200);
});

/* @desc get a specific user
   @route GET https://example.com/api/admin/users/details/:id
   @access private (USER can access only self, ADMIN/MANAGER any user) */
app.get('/details/:id', async (ctx) => {
    const user = ctx.get("user")!;

    const targetUserId = ctx.req.param('id');
    const role = user.role ?? "USER";

    const result = await usersService.getById( targetUserId, user.id, role);
    return ctx.json(result, 200);
});

/* @desc admin update user fields
   @route PATCH https://example.com/api/admin/users/admin-update/:id
   @access private (ADMIN, MANAGER) */
app.patch('/admin-update/:id', async (ctx) => {
    const user = ctx.get("user")!;

    const body = await ctx.req.json();

    const validation = adminUpdateUserSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, {
            message: "Invalid body",
            cause: validation.error
        });
    }

    const targetUserId = ctx.req.param('id');
    const role = user.role ?? "USER";

    const updatedUser = await usersService.updateByAdmin(
        targetUserId,
        role,
        validation.data
    );

    return ctx.json(updatedUser, 200);
});

/* @desc update user block status
   @route PATCH /api/admin/users/:id/block-status
   @access private (ADMIN) */
app.patch('/block-status/:id', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const body = await ctx.req.json();

    const validation = adminUpdateBlockSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body" });
    }

    const targetUserId = ctx.req.param("id");
    const updatedUser = await usersService.updateBlockByAdmin( targetUserId, role, validation.data.blockedUntil);
    return ctx.json(updatedUser, 200);
});

/* @desc update user role
   @route PATCH /api/admin/users/:id/role
   @access private (ADMIN) */
app.patch('/role/:id', async (ctx) => {
    const user = ctx.get("user")!;
    const requesterRole = user.role ?? "USER";

    const body = await ctx.req.json();
    const validation = adminUpdateRoleSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body" });
    }

    const targetUserId = ctx.req.param("id");
    const updatedUser = await usersService.updateRoleByAdmin( targetUserId, requesterRole, validation.data.role, user.id);
    return ctx.json(updatedUser, 200);
});

/* @desc admin permanently suspends a fraudulent account and releases CPF
   @route POST /api/admin/users/suspend-fraud/:id
   @access private (ADMIN) */
app.post("/suspend-fraud/:id", async (ctx) => {
    const user = ctx.get("user")!;
    const requesterRole = user.role ?? "USER";
    const targetUserId = ctx.req.param("id");

    await usersService.suspendFraudulentAccount(targetUserId, requesterRole);

    return ctx.json({ message: "Account suspended permanently and CPF released."});
});

export default app;