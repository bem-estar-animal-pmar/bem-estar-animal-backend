import { z } from "zod";
import { PetBreed } from "../../../generated/prisma/enums";
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from "../../constants/constants"

const checkDogBreed = (breed: PetBreed) => {
    return ![ "ABYSSINIAN", "ANGORA", "BENGAL", "BIRMAN", "CHARTREUX", "RUSSIAN_BLUE", "HIMALAYAN", "MAINE_COON", "MUNCHKIN", "SPHYNX", "SIAMESE", "RAGDOLL", "SCOTTISH_FOLD", "AMERICAN_BURMESE", "PERSIAN", "EXOTIC_SHORTHAIR"
    ].includes(breed);
}

const checkCatBreed = (breed: PetBreed) => {
    return [ "MIXED_BREED", "ABYSSINIAN", "ANGORA", "BENGAL", "BIRMAN", "CHARTREUX", "RUSSIAN_BLUE", "HIMALAYAN", "MAINE_COON", "MUNCHKIN", "SPHYNX", "SIAMESE", "RAGDOLL", "SCOTTISH_FOLD", "AMERICAN_BURMESE", "PERSIAN", "EXOTIC_SHORTHAIR"
    ].includes(breed);
}

const basePetSchema = z.object({
    name: z.string()
        .min(1, "Name cannot be empty")
        .max(28, "Name must be less than 28 characters"),
    species: z.enum(["DOG", "CAT"]),
    gender: z.enum(["MALE", "FEMALE"]),
    breed: z.enum(PetBreed),
    weight: z.coerce.number()
        .positive("Weight must be greater than zero"),
    size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
    coatColor: z.string()
        .min(1, "Coat color is required")
        .max(28, "Coat color must be less than 28 characters"),
    birthDate: z.coerce.date()
        .transform(date => 
            new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        ),
});

const breedRefinement = (data: { species: string; breed: PetBreed }) => {
    if (data.species === "DOG") return checkDogBreed(data.breed);
    if (data.species === "CAT") return checkCatBreed(data.breed);
    return true;
};

const breedRefinementMessage = {
    message: "Breed does not match species",
    path: ["breed"],
};

export const createPetSchema = basePetSchema.extend({
    homeStatus: z.enum([
        "HAS_OWNER",
        "TEMPORARY_HOME",
    ]).optional(),
    image: z.instanceof(File, { message: "Photo is required" })
        .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 5MB`)
        .refine(
            (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
            "Only .jpg, .jpeg, .png and .webp formats are supported"
        ),
}).refine(breedRefinement, breedRefinementMessage);

export const adminCreatePetSchema = basePetSchema.extend({
    ownerId: z.string()
        .max(50, "Owner ID must be less than 50 characters").optional(), /* added for admin creation */
    chip: z.string()
        .max(50)
        .optional(),
    homeStatus: z.enum([ /* added for admin creation, since most of cases admins will create for users, they can only set as temporary home or has_owner */
        "HAS_OWNER",
        "TEMPORARY_HOME", 
        "STRAY_ANIMAL" /* no for_adoption or adopted here */
    ]).optional(),
    isNeutered: z.coerce.boolean()
        .optional(),
    allowEmergency: z.coerce.boolean()
        .optional(),
    image: z.instanceof(File, { message: "Photo is required" })
        .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 5MB`)
        .refine(
            (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
            "Only .jpg, .jpeg, .png and .webp formats are supported"
        )
        .optional(),
}).refine(breedRefinement, breedRefinementMessage);

export const updatePetImageSchema = z.object({
    image: z.instanceof(File, { message: "Photo is required" })
        .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 5MB`)
        .refine(
            (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
            "Only .jpg, .jpeg, .png and .webp formats are supported"
        ),
});

export const adminUpdatePetSchema = z.object({
    name: z.string()
        .max(28)
        .optional(),
    species: z.enum(["DOG", "CAT"])
        .optional(),
    gender: z.enum(["MALE", "FEMALE"])
        .optional(),
    breed: z.enum(PetBreed)
        .optional(),
    weight: z.number()
        .positive()
        .optional(),
    size: z.enum(["SMALL", "MEDIUM", "LARGE"])
        .optional(),
    coatColor: z.string()
        .max(28)
        .optional(),
    isNeutered: z.coerce.boolean()
        .optional(),
    allowEmergency: z.coerce.boolean()
        .optional(),
    birthDate: z.coerce.date()
        .transform(date => 
            new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        )
        .optional(), /* since we rely in period instead of hours of date, zod will clean up any date the frontend sends to prevent bugs */
    chip: z.string()
        .max(50)
        .optional(), /* must add constraint on service to only let admin set chip */
    homeStatus: z.enum([ /* must add constraint on service to only let admin set adoptionStatus */ 
        "HAS_OWNER", /* here admins do not set adoption status anymore, it is 100% controlled by the backend */
        "TEMPORARY_HOME",
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
    homeStatus: z.enum([
        "HAS_OWNER",
        "TEMPORARY_HOME",
        "STRAY_ANIMAL"
    ]).optional(),
    adoptionStatus: z.enum([
        "NONE",
        "FOR_ADOPTION",
        "ADOPTED",
    ]).optional(),
    chip: z.string()
        .max(50)
        .optional(),
    userId: z.string() /* admin-only filter */
        .max(50, "User ID must be less than 50 characters")
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listPetsForAdoptionQuerySchema = z.object({
    species: z.enum(["DOG", "CAT"]).optional(),
    gender: z.enum(["MALE", "FEMALE"]).optional(),
});


export type CreatePetFormInput = z.infer<typeof createPetSchema>;
export type CreatePetInput = Omit<CreatePetFormInput, "image"> & {
    image: string;
};
export type AdminCreatePetFormInput = z.infer<typeof adminCreatePetSchema>;
export type AdminCreatePetInput = Omit<AdminCreatePetFormInput, "image"> & {
    image?: string;
};

export type AdminUpdatePetInput = z.infer<typeof adminUpdatePetSchema>;
export type ListPetsParamsInput = z.infer<typeof listPetsQuerySchema>;
export type ListPetsForAdoptionParamsInput = z.infer<typeof listPetsForAdoptionQuerySchema>;