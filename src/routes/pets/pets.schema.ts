import { z } from "zod";
import { PetBreed } from "../../../generated/prisma/enums";

const checkDogBreed = (breed: PetBreed) => {
    return ![ "ABYSSINIAN", "ANGORA", "BENGAL", "BIRMAN", "CHARTREUX", "RUSSIAN_BLUE", "HIMALAYAN", "MAINE_COON", "MUNCHKIN", "SPHYNX", "SIAMESE", "RAGDOLL", "SCOTTISH_FOLD", "AMERICAN_BURMESE", "PERSIAN", "EXOTIC_SHORTHAIR"
    ].includes(breed);
}

const checkCatBreed = (breed: PetBreed) => {
    return [ "MIXED_BREED", "ABYSSINIAN", "ANGORA", "BENGAL", "BIRMAN", "CHARTREUX", "RUSSIAN_BLUE", "HIMALAYAN", "MAINE_COON", "MUNCHKIN", "SPHYNX", "SIAMESE", "RAGDOLL", "SCOTTISH_FOLD", "AMERICAN_BURMESE", "PERSIAN", "EXOTIC_SHORTHAIR"
    ].includes(breed);
}

export const createPetSchema = z.object({
    name: z.string()
        .min(1, "Name cannot be empty")
        .max(28, "Name must be less than 28 characters"),
    species: z.enum(["DOG", "CAT"]),
    gender: z.enum(["MALE", "FEMALE"]),
    breed: z.enum(PetBreed),
    weight: z.number()
        .positive("Weight must be greater than zero"),
    coatColor: z.string()
        .min(1, "Coat color is required")
        .max(28, "Coat color must be less than 28 characters"),
    birthDate: z.coerce.date(),
    isTemporaryHome: z.boolean()
        .optional(),
    chip: z.string()
        .max(50)
        .optional(), /* must add constraint on service to only let admin set chip */
    ownerId: z.string()
        .max(50, "User ID must be less than 50 characters").optional(), /* added for admin creation */
}).refine((data) => {
    if (data.species === "DOG") {
        return checkDogBreed(data.breed);
    }
    if (data.species === "CAT") {
        return checkCatBreed(data.breed);
    }
    return true;
}, {
  message: "Breed does not match species",
  path: ["breed"],
});

export const updatePetSchema = z.object({
    name: z.string()
        .max(28)
        .optional(),
    species: z.enum(["DOG", "CAT"]),
    breed: z.enum(PetBreed)
        .optional(),
    weight: z.number()
        .positive()
        .optional(),
    coatColor: z.string()
        .max(28)
        .optional(),
    birthDate: z.coerce.date().optional(),
    isTemporaryHome: z
        .boolean()
        .optional(),
    chip: z.string()
        .max(50)
        .optional(), /* must add constraint on service to only let admin set chip */
    adoptionStatus: z.enum([ /* must add constraint on service to only let admin set adoptionStatus */
        "HAS_OWNER",
        "FOR_ADOPTION",
        "ADOPTED",
        "STRAY_ANIMAL"
    ]).optional(),
}).refine((data) => {
    if (data.species === "DOG" && data.breed) {
        return checkDogBreed(data.breed);
    }
    if (data.species === "CAT" && data.breed) {
        return checkCatBreed(data.breed);
    }
    return true;
}, {
  message: "Breed does not match species",
  path: ["breed"],
});

export const listPetsQuerySchema = z.object({
    name: z.string()
        .max(28, "Name must be less than 28 characters")
        .optional(),
    species: z.enum(["DOG", "CAT"]).optional(),
    gender: z.enum(["MALE", "FEMALE"]).optional(),
    breed: z.enum(PetBreed)
        .optional(),
    isTemporaryHome: z.coerce.boolean().optional(),
    adoptionStatus: z.enum([
        "HAS_OWNER",
        "FOR_ADOPTION",
        "ADOPTED",
        "STRAY_ANIMAL"
    ]).optional(),
    userId: z.string() /* admin-only filter */
        .max(50, "User ID must be less than 50 characters")
        .optional(),
});

export const listPetsForAdoptionQuerySchema = z.object({
    species: z.enum(["DOG", "CAT"]).optional(),
    gender: z.enum(["MALE", "FEMALE"]).optional(),
});

export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;
export type ListPetsParamsInput = z.infer<typeof listPetsQuerySchema>;
export type ListPetsForAdoptionParamsInput = z.infer<typeof listPetsForAdoptionQuerySchema>;