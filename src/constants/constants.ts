export const CURRENT_TERMS_OF_SERVICE_VERSION = "v1.0.0";
export const CURRENT_PRIVACY_POLICY_VERSION = "v1.0.0";

export const PETS_PER_USER_LIMIT = 8;

export const MAX_PETS_PER_MONTH_BY_CPF = 2;

export const MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST = 2;
export const MAX_MONTH_LIMIT_FOR_NEUTERING_REQUEST = 3;
export const MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST = 1;

export const MIN_PET_AGE_FOR_NEUTERING = 3; /* in months */
export const MAX_PET_AGE_FOR_NEUTERING = 96; /* 8 years */

/* female dogs only */
export const MIN_PET_WEIGHT_FOR_NEUTERING = 3; /* in kg */
export const MAX_PET_WEIGHT_FOR_NEUTERING = 15;

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

export const BRACHYCEPHALIC_BREEDS = [
  "PUG",
  "BOSTON_TERRIER",
  "FRENCH_BULLDOG",
  "ENGLISH_BULLDOG",
  "BOXER",
  "SHIH_TZU",
  "LHASA_APSO",
  "CHIHUAHUA",
  "AMERICAN_BULLY",
  "CAVALIER_KING_CHARLES_SPANIEL",
  "MALTESE",
  "STAFFORDSHIRE_BULL_TERRIER",
  /* not on enum */
  "PEKINGESE",  
  "DOGUE_DE_BORDEAUX",
  "SHAR_PEI",

  "AMERICAN_BURMESE",
  "HIMALAYAN",
  "PERSIAN",
  "EXOTIC_SHORTHAIR"
];

export const MEDICAL_RECORDS_MAP: Record<string, string> = {
    /* neuterings  & emergencies */
    PENDING: "Pendente",
    AWAITING_EXAMS: "Aguard. Exames",
    CONFIRMED: "Confirmado",
    COMPLETED: "Completo",
    CANCELLED: "Cancelado",
    NO_SHOW: "Faltou",
};