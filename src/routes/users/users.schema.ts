import { z } from "zod";
import { cpf } from "cpf-cnpj-validator";

export const adminUpdateUserSchema = z.object({
    name: z.string().trim()
        .min(1, "Name can't be blank")
        .max(20, "Name is expected to have less than 20 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Name must contain only letters"),
    lastName: z.string().trim()
        .min(1, "Last name can't be blank")
        .max(40, "Last name is expected to have less than 40 characters")
        .regex(/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/, "Last name must contain only letters"),
    phone: z.string().trim()
        .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "Invalid phone number format")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    cpf: z.string().trim()
        .refine((value) => cpf.isValid(value), {
            message: "Invalid CPF",
        })
        .transform((val) => val.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    cep: z.string()
        .regex(/^\d{5}-?\d{3}$/, "Invalid CEP")
        .transform((value) => value.replace(/\D/g, "")), // remove dots and dashes to send only numbers to backend
    street: z.string().trim()
        .min(1, "Street is required")
        .max(200, "Street is expected to have less than 200 characters"),
    neighborhood: z.string().min(1, "Neighborhood is required")
        .max(100, "Neighborhood is expected to have less than 100 characters"),
    city: z.string().trim()
        .min(1, "City is required")
        .max(100, "City is expected to have less than 100 characters"),
    state: z.string().trim()
        .length(2, "State must be UF (2 characters)"),
    number: z.string().trim()
        .min(1, "Number is required")
        .max(16, "Number is expected to have less than 16 characters"),
    maxPetLimit: z.coerce.number().min(1).max(100)
        .optional(),
    maxMonthlyNeuteringRequestLimit: z.coerce.number().min(1).max(100)
        .optional(),
});

export const adminUpdateBlockSchema = z.object({
    blockedUntil: z.coerce.date().nullable(),
});

export const adminUpdateRoleSchema = z.object({
    role: z.enum(["USER", "MANAGER"])
});

export const listUsersQuerySchema = z.object({
    name: z.string().optional(),
    email: z.string().
        max(50, "Email must be less than 50 characters")
        .optional(),
    role: z.enum(["USER", "ADMIN", "MANAGER"]).optional(),
    id: z.string()
        .max(50, "User ID must be less than 50 characters")
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;