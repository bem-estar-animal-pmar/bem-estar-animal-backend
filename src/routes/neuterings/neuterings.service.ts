
import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { 
    CreateNeuteringInput, 
    AdminCreateNeuteringInput, 
    UpdateNeuteringStatusInput, 
    ListNeuteringsQueryInput, 
    UpsertMonthQuotaInput,
    UpsertDayExceptionInput
} from "./neuterings.schema";
import {
    MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST,
    MIN_PET_AGE_FOR_NEUTERING, MAX_PET_AGE_FOR_NEUTERING,
    MIN_PET_WEIGHT_FOR_NEUTERING,
    MAX_PET_WEIGHT_FOR_NEUTERING,
    MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST,
    MAX_MONTH_LIMIT_FOR_NEUTERING_REQUEST,
    BRACHYCEPHALIC_BREEDS,
    NEUTERING_QUOTAS,
    MEDICAL_RECORDS_MAP,
    MAX_CANCELLATIONS_PER_WEEK
} from "../../constants/constants";
import { appendHistory } from "../../lib/history.js";

/* frontend will receive absolute 00:00 dates in UTC-0 it must not convert the date to local timezone or it may
change the day and cause bugs */

/* it is ok to not allow admin creates neutering requests for other users, because user is meant to attatch their pet
to the request on the moment of creation */
export const neuteringService = {

    /* user, admin services */

    async create(userId: string, data: CreateNeuteringInput) {
        const pet = await prisma.pet.findUnique({
            where: { id: data.petId }
        });

        const user = await prisma.user.findUnique({
            where: {id: userId}
        })

        if (!user || !pet) {
            throw new HTTPException(404, { message: "User or pet not found" });
        }

        if (pet.ownerId !== userId) {
            throw new HTTPException(404, { message: "Pet not found" });
        }

        if (pet.adoptionStatus === "ADOPTED") {
            throw new HTTPException(400, { message: "This pet is adopted, which means you cannot schedule neuterings anymore. Pet data is for read only now." });
        }

        const activeAppointment = await prisma.neuteringAppointment.findFirst({
            where: {
                petId: data.petId,
                status: {
                    in: ["PENDING", "AWAITING_EXAMS", "CONFIRMED", "COMPLETED"]
                }
            }
        });

        if (activeAppointment || pet.isNeutered) {
            throw new HTTPException(400, { message: "This pet already has an active neutering appointment or is already neutered" });
        }

        if (!data.termsAccepted || !data.animalFastAccepted || !data.animalChipAccepted) {
            throw new HTTPException(400, { message: "You must agree with all terms and declarations" });
        }

        const today = new Date();
        let ageInMonths = (today.getFullYear() - pet.birthDate.getFullYear()) * 12 + (today.getMonth() - pet.birthDate.getMonth());
        if (today.getDate() < pet.birthDate.getDate()) {
            ageInMonths--;
        }

        if (ageInMonths < MIN_PET_AGE_FOR_NEUTERING || ageInMonths > MAX_PET_AGE_FOR_NEUTERING) {
            throw new HTTPException(400, { message: "Neutering is only allowed for pets between 3 months and 8 years old" });
        }

        let neuteringStatus:'CONFIRMED' | 'AWAITING_EXAMS' = "CONFIRMED";

        if (pet.species === "DOG" && pet.gender === "FEMALE") {
            if ((pet.weight <= MIN_PET_WEIGHT_FOR_NEUTERING) || pet.weight > MAX_PET_WEIGHT_FOR_NEUTERING) {
                neuteringStatus = "AWAITING_EXAMS";
            }
        }

        const isBrachycephalic = pet.breed && BRACHYCEPHALIC_BREEDS.includes(pet.breed);
        
        if (isBrachycephalic) {
            neuteringStatus = "AWAITING_EXAMS";
            data.scheduleDate = undefined;
            data.period = undefined;
        }

        if (!isBrachycephalic) {
            if (!data.scheduleDate || !data.period) {
                throw new HTTPException(400, { message: "Schedule date and period are required for this pet" });
            }
        }

        const creator = `pelo responsável`;
        const initialHistory = `Pedido criado com status "${MEDICAL_RECORDS_MAP[neuteringStatus]}" ${creator}.`

        if (user.blockedUntil && user.blockedUntil > new Date()) {
            throw new HTTPException(403, {message: `User is blocked from scheduling until ${user.blockedUntil.toLocaleDateString()}`});
        }

        const nowInBrazil = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const startOfMonth = new Date(Date.UTC(nowInBrazil.getFullYear(), nowInBrazil.getMonth(), 1));
        const endOfMonth = new Date(Date.UTC(nowInBrazil.getFullYear(), nowInBrazil.getMonth() + 1, 0));

        const monthlyCount = await prisma.neuteringAppointment.count({
            where: {
                userId,
                scheduleDate: { gte: startOfMonth, lte: endOfMonth },
                status: { not: "CANCELLED" }
            }
        });

        if (monthlyCount >= user.maxMonthlyNeuteringRequestLimit) {
            throw new HTTPException(400, { message: "Monthly limit of neutering appointments reached for this CPF" });
        }

        const now = new Date(); 
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        const recentCancellations = await prisma.neuteringAppointment.count({
            where: {
                userId,
                status: "CANCELLED",
                updatedAt: { gte: sevenDaysAgo, lte: now } 
            }
        });

        if (recentCancellations >= MAX_CANCELLATIONS_PER_WEEK) {
            throw new HTTPException(429, { 
                message: `Maximum limit for appointments cancellation reached. Please wait a few days to schedule online again, or contact the clinic directly.` 
            });
        }

        if (data.scheduleDate) {
            const todayInUtc = new Date(Date.UTC(nowInBrazil.getFullYear(), nowInBrazil.getMonth(), nowInBrazil.getDate()));

            const minDate = new Date(todayInUtc);
            minDate.setUTCDate(todayInUtc.getUTCDate() + MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST);

            const maxDate = new Date(todayInUtc);
            maxDate.setUTCMonth(todayInUtc.getUTCMonth() + MAX_MONTH_LIMIT_FOR_NEUTERING_REQUEST);

            if (data.scheduleDate < minDate) {
                throw new HTTPException(400, { message: `Appointments must be scheduled at least ${MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST} days in advance` });
            }

            if (data.scheduleDate > maxDate) {
                throw new HTTPException(400, { message: `Appointments must be scheduled at maximum ${MAX_MONTH_LIMIT_FOR_NEUTERING_REQUEST} months after today` });
            }

            const dayOfWeek = data.scheduleDate.getUTCDay(); 
            const isFriday = dayOfWeek === 5;
            const isWeekday = dayOfWeek > 0 && dayOfWeek < 5;
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            if (isWeekend) {
                throw new HTTPException(400, { message: "Neutering is only available from monday to friday" });
            }

            if (isFriday) {
                if (pet.gender !== "MALE") {
                    throw new HTTPException(400, { message: "Fridays are reserved for male animals only" });
                }
                const staticSpeciesRule = data.period === "MORNING" ? NEUTERING_QUOTAS.FRIDAY.MORNING : NEUTERING_QUOTAS.FRIDAY.AFTERNOON;

                if (data.period === "MORNING" && pet.species !== staticSpeciesRule.species) {
                    throw new HTTPException(400, { message: "Friday morning is for cats only" });
                }

                if (data.period === "AFTERNOON" && pet.species !== staticSpeciesRule.species) {
                    throw new HTTPException(400, { message: "Friday afternoon is for dogs only" });
                }

                await this.checkSlotAvailability(data.scheduleDate, data.period!);
            } 

            if (isWeekday) {
                const staticSpeciesRule = data.period === "MORNING" ? NEUTERING_QUOTAS.WEEKDAY.MORNING : NEUTERING_QUOTAS.WEEKDAY.AFTERNOON;
                
                if (pet.species !== staticSpeciesRule.species) {
                    throw new HTTPException(400, { message: `Only ${staticSpeciesRule.species.toLowerCase()}s can be neutered in the ${data.period!.toLowerCase()}` });
                }

                await this.checkSlotAvailability(data.scheduleDate, data.period!);
            }
        }

        return await prisma.neuteringAppointment.create({
            data: {
                userId,
                petId: data.petId,
                status: neuteringStatus,
                scheduleDate: data.scheduleDate,
                period: data.period,
                medicalRecord: {
                    create: {
                        petId: data.petId,
                        notes: "",
                        history: appendHistory("", initialHistory)
                    }
                }
            }
        });
    },

    async getById(neuteringId: string, userId: string, userRole: string) {
        const existingNeutering = await prisma.neuteringAppointment.findUnique({
            where: { id: neuteringId },
            include: {
                pet: {
                    select: {
                        name: true,
                        species: true,
                        gender: true,
                        size: true,
                        breed: true,
                        ownerId: true,
                        chip: true,
                        isNeutered: true,
                        allowEmergency: true,
                        image: true
                    }
                },
                user: {
                    select: {
                        name: true,
                        lastName: true,
                        email: true,
                        phone: true,
                        cep: true,
                        street: true,
                        neighborhood: true,
                        city: true,
                        state: true,
                        number: true
                    }
                },
                ...(userRole !== "USER" && { /* only include medicalRecord if userRole is admin */
                    medicalRecord: {
                        select: {
                            id: true,
                            notes: true,
                            history: true
                        }
                    }
                })
            }
        });

        if (!existingNeutering) {
            throw new HTTPException(404, { message: "Neutering not found" });
        }

        // owner authorization
        if ( userRole !== "ADMIN" && userRole !== "MANAGER" && existingNeutering.pet.ownerId !== userId ) {
            throw new HTTPException(403, { message:  "You do not have permission to perform this action" });
        }

        return existingNeutering;
    },

    async listByUser(userId: string, filters?: ListNeuteringsQueryInput) {
        return await prisma.neuteringAppointment.findMany({
            where: {
                userId,
                status: filters?.status ? { in: filters.status } : undefined,
                petId: filters?.petId,
                scheduleDate: {
                    gte: filters?.startDate,
                    lte: filters?.endDate
                }
            },
            include: {
                pet: { select: { name: true, species: true, gender: true, breed: true, image: true} },
            },
            orderBy: [
                { createdAt: 'desc' }
            ]
        });
    },

    /* user action: cancel own appointment */
    async cancel(appointmentId: string, userId: string) {
        const user = await prisma.user.findUnique({
            where: {id: userId}
        })
        if (!user) {
            throw new HTTPException(401, { message: "Authentication required" });
        }

        const appointment = await prisma.neuteringAppointment.findUnique({
            where: { id: appointmentId },
            include: { medicalRecord: true }
        });

        if (!appointment) {
            throw new HTTPException(404, { message: "Appointment not found" });
        }

        if (appointment.userId !== userId && user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(404, { message: "Appointmento not found" });
        }

        if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
            throw new HTTPException(400, { message: `Cannot cancel an appointment with status ${appointment.status}` });
        }

        /* rule: you can only cancel confirmed appointments > 24 hours before the appointment */
        if (user.role !== "ADMIN" && user.role !== "MANAGER" && appointment.status === "CONFIRMED" && appointment.scheduleDate !== null) {
            const nowInBrazil = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
            const today = new Date(Date.UTC(nowInBrazil.getFullYear(), nowInBrazil.getMonth(), nowInBrazil.getDate()));
            const msInADay = 1000 * 60 * 60 * 24;
            const daysDifference = (appointment.scheduleDate.getTime() - today.getTime()) / msInADay;


            if (daysDifference < MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST) {
                throw new HTTPException(400, { message: `Cancellations must be made at least ${MAX_DAY_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST * 24} hours in advance. If you still want to cancel contact the clinic` });
            }
        }

        let medicalRecordUpdate = undefined;
        if (appointment.medicalRecord) {
            const creator = user.role !== "USER" ? `pelo gerente ${user.name}` : "pelo responsável";
            const logEntry = `Status alterado para "${MEDICAL_RECORDS_MAP["CANCELLED"]}" ${creator}`;

            medicalRecordUpdate = {
                update: {
                    history: appendHistory(appointment.medicalRecord.history, logEntry)
                }
            };
        }

        return await prisma.neuteringAppointment.update({
            where: { id: appointmentId },
            data: {
                status: "CANCELLED",
                medicalRecord: medicalRecordUpdate
            }
        });
    },

    /* admin only services */
    async list(userRole: string, filters: ListNeuteringsQueryInput) {
        if (userRole !== "ADMIN" && userRole !== "MANAGER") {
            throw new HTTPException(403, { message:  "You do not have permission to perform this action" });
        }

        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;

        const appointments = await prisma.neuteringAppointment.findMany({
            where: {
                userId: filters.userId,
                status: filters?.status ? { in: filters.status } : undefined,
                petId: filters.petId,
                scheduleDate: {
                    gte: filters.startDate,
                    lte: filters.endDate
                }
            },
            include: {
                pet: { select: { name: true, species: true, image: true } },
                user: { select: { name: true, lastName: true, email: true, phone: true } }
            },
            orderBy: [
                { createdAt: 'desc' }, /* pending, awaiting_exams and cancelled has no date, so the oldest created comes first */
                { scheduleDate: 'desc' } /* most recent comes first (confirmed, completed and no_show) */
            ],
            skip: skip,
            take: limit + 1, // O truque N+1
        });

        const hasNextPage = appointments.length > limit;

        if (hasNextPage) {
            appointments.pop();
        }

        return {
            data: appointments,
            meta: {
                currentPage: page,
                itemsPerPage: limit,
                hasNextPage,
                hasPrevPage: page > 1
            }
        };
    },

    /* this service is specific for admin to create (usually completed) neutering rows already filled up, they can 
    only create on their own account ID */
    async createByAdmin(userId: string, data: AdminCreateNeuteringInput) {
        const pet = await prisma.pet.findUnique({
            where: { id: data.petId }
        });

        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        if (!user || !pet) {
            throw new HTTPException(404, { message: "User or Pet not found" });
        }
        if (pet.ownerId !== userId) {
            throw new HTTPException(403, { message: "You do not have permission to perform this action" });
        }

        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(403, { message:  "You do not have permission to perform this action" });
        }

        /* pets with active neutering appointments or already neutered cannot create another request */
        const activeAppointment = await prisma.neuteringAppointment.findFirst({
            where: {
                petId: data.petId,
                status: {
                    in: ["PENDING", "AWAITING_EXAMS", "CONFIRMED", "COMPLETED"]
                }
            }
        });

        if (activeAppointment || pet.isNeutered) {
            throw new HTTPException(400, { message: "This pet already has an active neutering appointment or is already neutered" });
        }

        /* constraint: only pets between 3 months and 8 years can be neutered */
        const today = new Date();
        let ageInMonths = (today.getFullYear() - pet.birthDate.getFullYear()) * 12 + (today.getMonth() - pet.birthDate.getMonth());
        if (today.getDate() < pet.birthDate.getDate()) {
            ageInMonths--;
        }

        if (ageInMonths < MIN_PET_AGE_FOR_NEUTERING || ageInMonths > MAX_PET_AGE_FOR_NEUTERING) {
            throw new HTTPException(400, { message: "Neutering is only allowed for pets between 3 months and 8 years old" });
        }

        const creator = `pelo gerente ${user.name}`
        const initialHistory = `Pedido criado com status "${MEDICAL_RECORDS_MAP[data.status]}" ${creator}.`;

        return await prisma.neuteringAppointment.create({
            data: {
                userId,
                petId: data.petId,
                status: data.status,
                scheduleDate: data.scheduleDate,
                period: data.period,
                termsAccepted: true,
                animalChipAccepted: true,
                animalFastAccepted: true,
                medicalRecord: {
                    create: {
                        petId: data.petId,
                        notes: "",
                        history: appendHistory("", initialHistory)
                    }
                }
            },
        })
    },

    async updateStatus(appointmentId: string, userId: string, data: UpdateNeuteringStatusInput) {
        const user = await prisma.user.findUnique({
            where: {id: userId}
        })
        if (!user) {
            throw new HTTPException(401, { message:  "Authentication required" });
        }
        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(403, { message:  "You do not have permission to perform this action" });
        }

        const appointment = await prisma.neuteringAppointment.findUnique({
            where: { id: appointmentId },
            include: { medicalRecord: true }
        });


        if (!appointment) {
            throw new HTTPException(404, { message: "Neutering appointment not found" });
        }
   
        /* repare the history log if the status is changing and a medical record exists */
        let medicalRecordUpdate = undefined;
        if (appointment.medicalRecord) {
            const creator = `pelo gerente ${user.name}`;
            const logEntries: string[] = [];

            /* 1. Check for Status changes (Removed manual timestamp) */
            if (data.status !== undefined && data.status !== appointment.status) {
                logEntries.push(`Status alterado de "${MEDICAL_RECORDS_MAP[appointment.status] || appointment.status}" para "${MEDICAL_RECORDS_MAP[data.status] || data.status}" ${creator}`);
            }

            /* 2. Check for Date changes */
            if (data.scheduleDate !== undefined) {
                const newDateMs = data.scheduleDate ? new Date(data.scheduleDate).getTime() : null;
                const oldDateMs = appointment.scheduleDate ? new Date(appointment.scheduleDate).getTime() : null;

                if (newDateMs !== oldDateMs) {
                    const formatUtcDateBR = (d: Date | string | null | undefined) => {
                        if (!d) return "Não definida";
                        const dateObj = new Date(d);
                        const day = String(dateObj.getUTCDate()).padStart(2, '0');
                        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                        const year = dateObj.getUTCFullYear();
                        return `${day}/${month}/${year}`;
                    };
                    
                    logEntries.push(`Data alterada de ${formatUtcDateBR(appointment.scheduleDate)} para ${formatUtcDateBR(data.scheduleDate)} ${creator}`);
                }
            }

            /* 3. Check for Period changes */
            if (data.period !== undefined && data.period !== appointment.period) {
                const formatPeriod = (p: string | null | undefined) => {
                    if (p === "MORNING") return "Manhã";
                    if (p === "AFTERNOON") return "Tarde";
                    return "Não definido";
                };
                
                logEntries.push(`Período alterado de ${formatPeriod(appointment.period)} para ${formatPeriod(data.period)} ${creator}`);
            }

            /* If there are any changes to log, process them sequentially through the helper */
            if (logEntries.length > 0) {
                let updatedHistory = appointment.medicalRecord.history;
                
                // Process each log entry individually so each gets its own timestamp
                for (const log of logEntries) {
                    updatedHistory = appendHistory(updatedHistory, log);
                }

                medicalRecordUpdate = {
                    update: {
                        history: updatedHistory
                    }
                };
            }
        }

        /* rule: if admin set as NO_SHOW, we automatically block the user for a month */
        if (data.status === "NO_SHOW" && appointment.status !== "NO_SHOW") {
            const blockUntilDate = new Date();
            blockUntilDate.setDate(blockUntilDate.getDate() + 30); /* add 30 days */

            /* we use transaction to update appointment and user status at the same time */
            return await prisma.$transaction([
                prisma.neuteringAppointment.update({
                    where: { id: appointmentId },
                    data: {
                        ...data,
                        medicalRecord: medicalRecordUpdate
                    }
                }),
                prisma.user.update({
                    where: { id: appointment.userId },
                    data: { blockedUntil: blockUntilDate }
                })
            ]);
        }

        /* rule: you cannot confirm  appointments without date */
        if ((data.status === "CONFIRMED") && !data.scheduleDate && !appointment.scheduleDate) {
            throw new HTTPException(403, { message: "To confirm a neutering appointment you must set a date." });
        }

        if (data.status === "COMPLETED") {
            return await prisma.$transaction([
                prisma.neuteringAppointment.update({
                    where: { id: appointmentId },
                    data: {
                        ...data,
                        medicalRecord: medicalRecordUpdate
                    }
                }),
                prisma.pet.update({
                    where: { id: appointment.petId },
                    data: { 
                        isNeutered: true,
                    }
                })
            ]);
        }

        /* update for when status is !== NO_SHOW */
        return await prisma.neuteringAppointment.update({
            where: { id: appointmentId },
            data: {
                ...data,
                medicalRecord: medicalRecordUpdate
            }
        });
    },

    /* helpers and neutering quota related services */

    async getDailyQuotaLimits(date: Date) {
        const dayException = await prisma.neuteringDayException.findUnique({
            where: { date: date }
        });
    
        if (dayException) {
            return { MORNING: dayException.morningLimit, AFTERNOON: dayException.afternoonLimit };
        }
    
        const month = date.getUTCMonth() + 1;
        const year = date.getUTCFullYear();
        
        const monthQuota = await prisma.neuteringMonthQuota.findUnique({
            where: { month_year: { month, year } }
        });
    
        if (!monthQuota) {
            return { MORNING: 0, AFTERNOON: 0 };
        }
    
        const dayOfWeek = date.getUTCDay();
        const isFriday = dayOfWeek === 5;
    
        return {
            MORNING: isFriday ? monthQuota.fridayMorningLimit : monthQuota.weekdayMorningLimit,
            AFTERNOON: isFriday ? monthQuota.fridayAfternoonLimit : monthQuota.weekdayAfternoonLimit
        };
    },

    async checkSlotAvailability(date: Date, period: string) {
        const limits = await this.getDailyQuotaLimits(date);
        const limitForPeriod = period === "MORNING" ? limits.MORNING : limits.AFTERNOON;
    
        if (limitForPeriod === 0) {
            throw new HTTPException(400, { message: "No more slots available for this date and period" });
        }
    
        const count = await prisma.neuteringAppointment.count({
            where: {
                scheduleDate: date,
                period: period,
                status: { in: ["PENDING", "CONFIRMED", "AWAITING_EXAMS", "COMPLETED"] }
            }
        });
    
        if (count >= limitForPeriod) {
            throw new HTTPException(400, { message: "No more slots available for this date and period" });
        }
    },

    async getQuotas(month: number, year: number) {
        const config = await prisma.neuteringMonthQuota.findUnique({ 
            where: { month_year: { month, year } } 
        });
        
        const limits = config || {
            weekdayMorningLimit: 0,
            weekdayAfternoonLimit: 0,
            fridayMorningLimit: 0,
            fridayAfternoonLimit: 0,
        };

        const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
        const endOfMonth = new Date(Date.UTC(year, month, 0));
        
        const exceptionsList = await prisma.neuteringDayException.findMany({
            where: { date: { gte: startOfMonth, lte: endOfMonth } }
        });
    
        return {
            WEEKDAY: {
                MORNING: { species: "CAT", limit: limits.weekdayMorningLimit },
                AFTERNOON: { species: "DOG", limit: limits.weekdayAfternoonLimit },
            },
            FRIDAY: {
                MORNING: { species: "CAT", gender: "MALE", limit: limits.fridayMorningLimit },
                AFTERNOON: { species: "DOG", gender: "MALE", limit: limits.fridayAfternoonLimit },
            },
            EXCEPTIONS: exceptionsList.map(ex => ({
                date: ex.date.toISOString().split('T')[0], // e.g., "2026-07-07"
                morningLimit: ex.morningLimit,
                afternoonLimit: ex.afternoonLimit
            }))
        };
    },

    async upsertMonthQuota(userId: string, data: UpsertMonthQuotaInput) {
        return await prisma.neuteringMonthQuota.upsert({
            where: { month_year: { month: data.month, year: data.year } },
            update: data,
            create: {
                month: data.month,
                year: data.year,
                weekdayMorningLimit: data.weekdayMorningLimit ?? 12,
                weekdayAfternoonLimit: data.weekdayAfternoonLimit ?? 6,
                fridayMorningLimit: data.fridayMorningLimit ?? 20,
                fridayAfternoonLimit: data.fridayAfternoonLimit ?? 7,
            }
        });
    },
    
    async upsertDayException(userId: string, data: UpsertDayExceptionInput) {
        return await prisma.neuteringDayException.upsert({
            where: { date: data.date },
            update: {
                morningLimit: data.morningLimit,
                afternoonLimit: data.afternoonLimit
            },
            create: {
                date: data.date,
                morningLimit: data.morningLimit,
                afternoonLimit: data.afternoonLimit
            }
        });
    },

    async getCalendarCounts(startDate: Date, endDate: Date) {
        // 1. Fetch appointments count (1 query)
        const counts = await prisma.neuteringAppointment.groupBy({
            by: ['scheduleDate', 'period'],
            _count: { id: true },
            where: {
                scheduleDate: { gte: startDate, lte: endDate },
                status: { in: ["PENDING", "CONFIRMED", "AWAITING_EXAMS", "COMPLETED"] },
                period: { not: null }
            }
        });

        // 2. Pre-fetch all day exceptions for the whole range (1 query)
        const dayExceptionsList = await prisma.neuteringDayException.findMany({
            where: { date: { gte: startDate, lte: endDate } }
        });
        
        // Convert array to a fast dictionary for O(1) lookup
        const dayExceptions = dayExceptionsList.reduce((acc, curr) => {
            acc[curr.date.toISOString().split('T')[0]] = curr;
            return acc;
        }, {} as Record<string, { morningLimit: number; afternoonLimit: number }>);

        // 3. Pre-fetch monthly quotas for the range (1 query)
        const startMonth = startDate.getUTCMonth() + 1;
        const startYear = startDate.getUTCFullYear();
        const endMonth = endDate.getUTCMonth() + 1;
        const endYear = endDate.getUTCFullYear();

        const monthQuotasList = await prisma.neuteringMonthQuota.findMany({
            where: {
                OR: [
                    { month: startMonth, year: startYear },
                    { month: endMonth, year: endYear }
                ]
            }
        });

        // Convert array to dictionary (e.g., key "2024-5")
        const monthQuotas = monthQuotasList.reduce((acc, curr) => {
            acc[`${curr.year}-${curr.month}`] = curr;
            return acc;
        }, {} as Record<string, any>);

        // Map filled slots
        const filledSlots = counts.reduce((acc, curr) => {
            if (!curr.scheduleDate || !curr.period) return acc;
            const dateStr = curr.scheduleDate.toISOString().split('T')[0];
            if (!acc[dateStr]) acc[dateStr] = { MORNING: 0, AFTERNOON: 0 };
            acc[dateStr][curr.period] = curr._count.id;
            return acc;
        }, {} as Record<string, Record<string, number>>);

        const calendarData: Record<string, { MORNING: number; AFTERNOON: number }> = {};
        let currentDate = new Date(startDate);

        // Loop through days entirely in memory (Zero DB calls here!)
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getUTCDay();
            const monthKey = `${currentDate.getUTCFullYear()}-${currentDate.getUTCMonth() + 1}`;

            if (dayOfWeek === 0 || dayOfWeek === 6) {
                calendarData[dateStr] = { MORNING: 0, AFTERNOON: 0 };
            } else {
                let dailyLimit = { MORNING: 0, AFTERNOON: 0 };
                
                // Check dictionary for day exception
                if (dayExceptions[dateStr]) {
                    dailyLimit = { 
                        MORNING: dayExceptions[dateStr].morningLimit, 
                        AFTERNOON: dayExceptions[dateStr].afternoonLimit 
                    };
                } else {
                    // Fallback to dictionary for month quota
                    const monthQuota = monthQuotas[monthKey];
                    if (monthQuota) {
                        const isFriday = dayOfWeek === 5;
                        dailyLimit = {
                            MORNING: isFriday ? monthQuota.fridayMorningLimit : monthQuota.weekdayMorningLimit,
                            AFTERNOON: isFriday ? monthQuota.fridayAfternoonLimit : monthQuota.weekdayAfternoonLimit
                        };
                    }
                }

                const filledMorning = filledSlots[dateStr]?.MORNING || 0;
                const filledAfternoon = filledSlots[dateStr]?.AFTERNOON || 0;

                calendarData[dateStr] = {
                    MORNING: Math.max(0, dailyLimit.MORNING - filledMorning),
                    AFTERNOON: Math.max(0, dailyLimit.AFTERNOON - filledAfternoon)
                };
            }
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        return calendarData;
    }
};
