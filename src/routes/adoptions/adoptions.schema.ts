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
    temporaryHomeAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must confirm to be a temporary home during the pet treatment"
    }),
    termsAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree that you have read the neutering terms"
    }),
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
        .max(60, "Name is expected to have less than 60 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Name must contain only letters"),
    adopterEmail: z.email("Invalid email format"),
    adopterPhone: z.string().trim()
        .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "Invalid phone number format")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    adopterCep: z.string()
        .regex(/^\d{5}-?\d{3}$/, "Invalid CEP")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    adopterStreet: z.string().trim()
        .min(1, "Street is required")
        .max(200, "Street is expected to have less than 200 characters"),
    adopterNeighborhood: z.string().min(1, "Neighborhood is required")
        .max(100, "Neighborhood is expected to have less than 100 characters"),
    adopterCity: z.string().trim()
        .min(1, "City is required")
        .max(100, "City is expected to have less than 100 characters"),
    adopterState: z.string().trim()
        .length(2, "State must be UF (2 characters)"),
    adopterNumber: z.string().trim()
        .min(1, "Number is required")
        .max(16, "Number is expected to have less than 16 characters"),
    termsAccepted: z.coerce.boolean().refine(val => val === true, {
        message: "You must agree that you have read the neutering terms"
    }),
});

export const updateAdoptionStatusSchema = z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "RETURNED"])
});

// --- QUERIES ---

export const listGiveUpRequestsQuerySchema = z.object({
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
                "APPROVED",
                "REJECTED"
            ])
        )
    ).optional(),
    petId: z.string().optional(),
    userId: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listAdoptionRequestsQuerySchema = z.object({
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
                "APPROVED",
                "REJECTED",
                "RETURNED"
            ])
        )
    ).optional(),
    petId: z.string().optional(),
    userId: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateGiveUpInput = z.infer<typeof createGiveUpSchema>;
export type UpdateGiveUpStatusInput = z.infer<typeof updateGiveUpStatusSchema>;
export type CreateAdoptionInput = z.infer<typeof createAdoptionSchema>;
export type UpdateAdoptionStatusInput = z.infer<typeof updateAdoptionStatusSchema>;
export type ListGiveUpRequestsQueryInput = z.infer<typeof listGiveUpRequestsQuerySchema>;
export type ListAdoptionRequestsQueryInput = z.infer<typeof listAdoptionRequestsQuerySchema>;