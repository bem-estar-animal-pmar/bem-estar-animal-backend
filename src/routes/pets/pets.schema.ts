import { z } from "zod";

export const createPetSchema = z.object({
    name: z.string()
        .min(1, "Name cannot be empty")
        .max(28, "Name must be less than 28 characters"),
    species: z.enum(["DOG", "CAT"]),
    gender: z.enum(["MALE", "FEMALE"]),
    breed: z.string()
        .min(1, "Breed is required")
        .max(28, "Breed must be less than 28 characters"),
    weight: z.number()
        .positive("Weight must be greater than zero"),
    coatColor: z.string()
        .min(1, "Coat color is required")
        .max(28, "Coat color must be less than 28 characters"),
    birthDate: z.coerce.date(),
});

export const updatePetSchema = createPetSchema.partial();

export const listPetsQuerySchema = z.object({
    name: z.string()
        .max(28, "Name must be less than 28 characters")
        .optional(),
    species: z.enum(["DOG", "CAT"]).optional(),
    gender: z.enum(["MALE", "FEMALE"]).optional(),
    breed: z.string()
        .max(28, "Breed must be less than 28 characters")
        .optional(),
    userId: z.string() /* admin-only filter */
        .max(50, "User ID must be less than 50 characters")
        .optional(),
});

export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;
export type ListPetsParamsInput = z.infer<typeof listPetsQuerySchema>;