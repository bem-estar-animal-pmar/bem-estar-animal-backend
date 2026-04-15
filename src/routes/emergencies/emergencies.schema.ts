import { z } from "zod";

export const createEmergencySchema = z.object({
    species: z.enum(["DOG", "CAT"]),
    size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
    description: z.string()
        .min(10, "Please provide more details about the emergency")
        .max(500, "Description is too long")
        .optional(),
    scheduleDate: z.coerce.date().transform(d => 
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    ).optional(), /* schedule and period are optional because users dont set it, but an admin creating the table can set it */
    period: z.enum(["MORNING", "AFTERNOON"]).optional(),
    petId: z.string().optional(),
    temporaryHomeAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must confirm to be a temporary home during the pet treatment"
    }),
    animalChipAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree to have your pet microchipped"
    }),
    termsAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree that you have read the neutering terms"
    }),
});

export const listEmergenciesQuerySchema = z.object({
    status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"])
        .optional(),
    userId: z.string()
        .optional(), /* admin-only */
    species: z.enum(["DOG", "CAT"])
        .optional(),
});

export const updateEmergencyStatusSchema = z.object({
    status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"]).optional(),
    scheduleDate: z.coerce.date().transform(d => 
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    ).optional(),
    period: z.enum(["MORNING", "AFTERNOON"]).optional(),
    petId: z.string().optional(), /* when the clinic finish the appointment, it should create a pet for the user and attach the pet ID */
}).superRefine((data, ctx) => {
    /* condition: when confirming the appointment, it must have date and period */
    if (data.status === "CONFIRMED" && (!data.scheduleDate || !data.period)) {
        ctx.addIssue({
            code: "custom",
            message: "Schedule date and period are required to confirm an emergency appointment",
            path: ["scheduleDate"]
        });
    }
});

export type CreateEmergencyInput = z.infer<typeof createEmergencySchema>;
export type ListEmergenciesQueryInput = z.infer<typeof listEmergenciesQuerySchema>;
export type UpdateEmergencyStatusInput = z.infer<typeof updateEmergencyStatusSchema>;