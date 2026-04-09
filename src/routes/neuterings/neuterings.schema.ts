import { z } from "zod";

export const createNeuteringSchema = z.object({ /* users are allowed to create neutering requests */
    petId: z.string() 
        .max(50, "User ID must be less than 50 characters"),
    scheduleDate: z.coerce.date()
        .transform(date => 
            new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        ), /* since we rely in period instead of hours of date, zod will clean up any date the frontend sends to prevent bugs */
    period: z.enum(["MORNING", "AFTERNOON"]),
});

/* only admins can update a neutering appointment */
export const updateNeuteringStatusSchema = z.object({ /* only admin can update */
    status: z.enum(["PENDING", "AWAITING_EXAMS", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"])
        .optional(),
    scheduleDate: z.coerce.date()
        .transform(date => 
            new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        )
        .optional(),
    period: z.enum(["MORNING", "AFTERNOON"])
        .optional(),
});

export type CreateNeuteringInput = z.infer<typeof createNeuteringSchema>;
export type UpdateNeuteringStatusInput = z.infer<typeof updateNeuteringStatusSchema>;