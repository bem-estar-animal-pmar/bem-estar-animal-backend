export const PETS_PER_USER_LIMIT = 8;

export const MAX_PETS_PER_MONTH_BY_CPF = 2;

export const MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST = 1;

export const NEUTERING_QUOTAS = {
    WEEKDAY: { /* segunda à quinta */
        MORNING: { species: "CAT", limit: 12 },
        AFTERNOON: { species: "DOG", limit: 6 },
    },
    FRIDAY: { /* sexta */
        MORNING: { species: "CAT", gender: "MALE", limit: 20 },
        AFTERNOON: { species: "DOG", gender: "MALE", limit: 7 },
    }
};

