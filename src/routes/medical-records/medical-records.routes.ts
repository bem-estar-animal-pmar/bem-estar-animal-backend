import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../../middleware/authHandler';
import { termsMiddleware } from '../../middleware/termsHandler';
import { HTTPException } from 'hono/http-exception';
import { medicalRecordService } from "./medical-records.service";
import { createMedicalRecordSchema, updateMedicalRecordSchema, listMedicalRecordsQuerySchema, idParamSchema } from './medical-records.schema';

const app = new Hono<AuthEnv>();

// Nenhuma rota pública ou de usuário comum. Tudo requer Auth e Role ADMIN.
app.use('*', authMiddleware);
app.use('*', termsMiddleware);

/* @desc create a new medical record for an appointment
   @route POST /api/medical-records
   @access private (ADMIN) */
app.post('/', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const body = await ctx.req.json();
    
    const validation = createMedicalRecordSchema.safeParse(body);
    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const record = await medicalRecordService.create(role, validation.data);
    return ctx.json(record, 201);
});

/* @desc list medical records (usually filtered by petId)
   @route GET /api/medical-records
   @access private (ADMIN) */
app.get('/', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const rawQuery = ctx.req.query();
    
    const validation = listMedicalRecordsQuerySchema.safeParse(rawQuery);
    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid query parameters", cause: validation.error });
    }

    const records = await medicalRecordService.list(role, validation.data);
    return ctx.json(records, 200);
});

/* @desc update notes of an existing medical record
   @route PATCH /api/medical-records/:id
   @access private (ADMIN) */
app.patch('/:id', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const recordId = ctx.req.param('id');
    const idValidation = idParamSchema.safeParse(recordId);
    if (!idValidation.success) {
        throw new HTTPException(400, { message: "Invalid params", cause: idValidation.error });
    }

    const body = await ctx.req.json();
    const validation = updateMedicalRecordSchema.safeParse(body);

    if (!validation.success) {
        throw new HTTPException(400, { message: "Invalid body", cause: validation.error });
    }

    const updated = await medicalRecordService.update(idValidation.data, role, validation.data);
    return ctx.json(updated, 200);
});

/* @desc get a medical record by its appointment ID
   @route GET /api/medical-records/appointment/:type/:appointmentId
   @access private (ADMIN) */
app.get('/appointment/:type/:appointmentId', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const type = ctx.req.param('type').toUpperCase();
    const appointmentId = ctx.req.param('appointmentId');
    const idValidation = idParamSchema.safeParse(appointmentId);
    if (!idValidation.success) {
        throw new HTTPException(400, { message: "Invalid params", cause: idValidation.error });
    }

    if (type !== "NEUTERING" && type !== "EMERGENCY") {
        throw new HTTPException(400, { message: "Invalid appointment type. Must be NEUTERING or EMERGENCY" });
    }

    const record = await medicalRecordService.getByAppointmentId(idValidation.data, type, role);
    return ctx.json(record, 200);
});

// medical-records.route.ts
/* @desc soft delete a medical record
   @route DELETE /api/medical-records/:id
   @access private (ADMIN) */
app.delete('/:id', async (ctx) => {
    const user = ctx.get("user")!;
    const role = user.role ?? "USER";
    const recordId = ctx.req.param('id');
    const idValidation = idParamSchema.safeParse(recordId);
    if (!idValidation.success) {
        throw new HTTPException(400, { message: "Invalid params", cause: idValidation.error });
    }

    await medicalRecordService.delete(idValidation.data, role);
    return ctx.json({ message: "Medical record deleted successfully" }, 200);
});

export default app;