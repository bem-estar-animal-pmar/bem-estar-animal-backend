import { z } from "zod";

export const createNeuteringSchema = z.object({ /* users are allowed to create neutering requests */
    petId: z.string() 
        .max(50, "Pet ID must be less than 50 characters"),
    scheduleDate: z.coerce.date()
        .transform(date => 
            new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        ).optional(), /* since we rely in period instead of hours of date, zod will clean up any date the frontend sends to prevent bugs */
    period: z.enum(["MORNING", "AFTERNOON"]).optional(),
    animalFastAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must confirm that your pet will be fasting"
    }),
    animalChipAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree to have your pet microchipped"
    }),
    termsAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree that you have read the neutering terms"
    }),
});

export const adminCreateNeuteringSchema = z.object({ /* schema for admins to create already completed neutering rows */
    petId: z.string() 
        .max(50, "Pet ID must be less than 50 characters"),
    status: z.enum(["PENDING", "AWAITING_EXAMS", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
    scheduleDate: z.coerce.date()
        .transform(date => 
            new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        ),
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

export const listNeuteringsQuerySchema = z.object({
    status: z.preprocess(
        (val) => {
            if (typeof val === "string") {
                return val.split(",").map(s => s.trim()).filter(Boolean);
            }
            return val;
        },
        z.array(
            z.enum([
                "PENDING",
                "AWAITING_EXAMS",
                "CONFIRMED",
                "COMPLETED",
                "CANCELLED",
                "NO_SHOW"
            ])
        )
    ).optional(),
    petId: z.string().optional(),
    userId: z.string().optional(), // Apenas Admin
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const calendarQuerySchema = z.object({
    startDate: z.coerce.date()
        .transform(date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))),
    endDate: z.coerce.date()
        .transform(date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))),
});

export type CreateNeuteringInput = z.infer<typeof createNeuteringSchema>;
export type AdminCreateNeuteringInput = z.infer<typeof adminCreateNeuteringSchema>;
export type UpdateNeuteringStatusInput = z.infer<typeof updateNeuteringStatusSchema>;
export type ListNeuteringsQueryInput = z.infer<typeof listNeuteringsQuerySchema>;
export type calendarQueryInput = z.infer<typeof calendarQuerySchema>;