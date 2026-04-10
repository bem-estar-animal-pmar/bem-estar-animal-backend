import { z } from "zod";

/* giveup request table related schemas */

export const createGiveUpSchema = z.object({
    petId: z.string()
        .min(1, "Pet ID is required")
        .max(50, "Pet ID must be less than 50 characters"),
    reason: z.string()
        .min(10, "Please provide a longer reason")
        .max(500, "Reason text is too long")
        .optional(),
});

export const updateGiveUpStatusSchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
});

/* adoption request table related schemas */

export const createAdoptionSchema = z.object({
    petId: z.string()
        .min(1, "Pet ID is required")
        .max(50, "Pet ID must be less than 50 characters"),
    adopterName: z.string().trim()
        .min(1, "Name can't be blank")
        .max(40, "Name is expected to have less than 40 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Name must contain only letters"),
    adopterEmail: z.email("Invalid email format"),
    adopterPhone: z.string().trim()
        .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "Invalid phone number format")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
});

export const updateAdoptionStatusSchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"])
});

// --- QUERIES ---

export const listRequestsQuerySchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    petId: z.string().optional(),
    userId: z.string().optional(),
});

export type CreateGiveUpInput = z.infer<typeof createGiveUpSchema>;
export type UpdateGiveUpStatusInput = z.infer<typeof updateGiveUpStatusSchema>;
export type CreateAdoptionInput = z.infer<typeof createAdoptionSchema>;
export type UpdateAdoptionStatusInput = z.infer<typeof updateAdoptionStatusSchema>;
export type ListRequestsQueryInput = z.infer<typeof listRequestsQuerySchema>;