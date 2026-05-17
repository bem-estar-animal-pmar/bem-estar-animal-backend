
import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateNeuteringInput, AdminCreateNeuteringInput, UpdateNeuteringStatusInput, ListNeuteringsQueryInput, UpdateNeuteringLimitsInput } from "./neuterings.schema";
import {
    MAX_PETS_PER_MONTH_BY_CPF,
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
            throw new HTTPException(403, { message: "You can only schedule appointments for your own pet" });
        }

        if (pet.adoptionStatus === "ADOPTED") {
            throw new HTTPException(400, { message: "This pet is adopted, which means you cannot schedule neuterings anymore. Pet data is for read only now." });
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

        if (!data.termsAccepted || !data.animalFastAccepted || !data.animalChipAccepted) {
            throw new HTTPException(400, { message: "You must agree with all terms and declarations" });
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

        /* constraint: pets below 3 kg or above 15 kg must do exams */
        let neuteringStatus:'CONFIRMED' | 'AWAITING_EXAMS' = "CONFIRMED";

        if (pet.species === "DOG" && pet.gender === "FEMALE") {
            if ((pet.weight <= MIN_PET_WEIGHT_FOR_NEUTERING) || pet.weight > MAX_PET_WEIGHT_FOR_NEUTERING) {
                neuteringStatus = "AWAITING_EXAMS";
            }
        }

        /* constraint: brachycephalic pets must do exams and date is deleted */
        const isBrachycephalic = pet.breed && BRACHYCEPHALIC_BREEDS.includes(pet.breed);
        
        if (isBrachycephalic) {
            neuteringStatus = "AWAITING_EXAMS";
            data.scheduleDate = undefined;
            data.period = undefined;
        }

        /* constraint: if user is not an admin and animal is not brachycephalic, date and period are mandatory */
        if (!isBrachycephalic) {
            if (!data.scheduleDate || !data.period) {
                throw new HTTPException(400, { message: "Schedule date and period are required for this pet" });
            }
        }

        /* get now to create and update a medical record history */
        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const creator = `pelo responsável`;
        const initialHistory = `[${nowInBrazilShort}] Pedido criado com status "${MEDICAL_RECORDS_MAP[neuteringStatus]}" ${creator}.`;

        /* rule 1: if user is blocked by NO_SHOW, don't allow the request */
        if (user.blockedUntil && user.blockedUntil > new Date()) {
            throw new HTTPException(403, {message: `User is blocked from scheduling until ${user.blockedUntil.toLocaleDateString()}`});
        }

        /* rule 2: monthly limit of MAX_PETS_PER_MONTH_BY_CPF appointments per CPF */
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

        if (monthlyCount >= MAX_PETS_PER_MONTH_BY_CPF) {
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

        /* if it is here, pet is not brachycephalic (must have date) or user is not an admin */
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

            /* neutering quotas constraint */
            const dayOfWeek = data.scheduleDate.getUTCDay(); /* 0 = Sunday, 1 = Monday 5 = Friday */
            const isFriday = dayOfWeek === 5;
            const isWeekday = dayOfWeek > 0 && dayOfWeek < 5;
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            /* no appointment allowed on weekends */
            if (isWeekend) {
                throw new HTTPException(400, { message: "Neutering is only available from monday to friday" });
            }

            if (isFriday) {
                if (pet.gender !== "MALE") {
                    throw new HTTPException(400, { message: "Fridays are reserved for male animals only" });
                }
                const quota = data.period === "MORNING" ? NEUTERING_QUOTAS.FRIDAY.MORNING : NEUTERING_QUOTAS.FRIDAY.AFTERNOON;

                if (data.period === "MORNING" && pet.species !== quota.species) {
                    throw new HTTPException(400, { message: "Friday morning is for cats only" });
                }

                if (data.period === "AFTERNOON" && pet.species !== quota.species) {
                    throw new HTTPException(400, { message: "Friday afternoon is for dogs only" });
                }

                await this.checkSlotAvailability(data.scheduleDate, data.period!, quota.limit);
            } 

            if (isWeekday) {
                const quota = data.period === "MORNING" ? NEUTERING_QUOTAS.WEEKDAY.MORNING : NEUTERING_QUOTAS.WEEKDAY.AFTERNOON;
                
                if (pet.species !== quota.species) {
                    throw new HTTPException(400, { message: `Only ${quota.species.toLowerCase()}s can be neutered in the ${data.period!.toLowerCase()}` });
                }

                await this.checkSlotAvailability(data.scheduleDate, data.period!, quota.limit);
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
                        history: initialHistory
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
            throw new HTTPException(401, { message: "Unauthorized" });
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
                pet: { select: { name: true, species: true, gender: true, breed: true } },
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
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const appointment = await prisma.neuteringAppointment.findUnique({
            where: { id: appointmentId },
            include: { medicalRecord: true }
        });

        if (!appointment) {
            throw new HTTPException(404, { message: "Appointment not found" });
        }

        if (appointment.userId !== userId && user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(403, { message: "You can only cancel your own appointments" });
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
            const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short"
            });
            const creator = user.role !== "USER" ? `pelo administrador ${user.name}` : "pelo responsável";
            const logEntry = `[${nowInBrazilShort}] Status alterado para "${MEDICAL_RECORDS_MAP["CANCELLED"]}" ${creator}`;

            medicalRecordUpdate = {
                update: {
                    history: appointment.medicalRecord.history
                        ? `${appointment.medicalRecord.history}\n${logEntry}`
                        : logEntry
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
            throw new HTTPException(401, { message: "Unauthorized" });
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
                pet: { select: { name: true, species: true } },
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
            throw new HTTPException(403, { message: "You can only register appointments for clinic pets created by your account" });
        }

        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
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

        /* get now to create and update a medical record history */
        const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short"
        });

        const creator = `pelo administrador ${user.name}`
        const initialHistory = `[${nowInBrazilShort}] Pedido criado com status "${MEDICAL_RECORDS_MAP[data.status]}" ${creator}.`;

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
                        history: initialHistory
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
            throw new HTTPException(401, { message: "Unauthorized" });
        }
        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
            throw new HTTPException(401, { message: "Unauthorized" });
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
            const nowInBrazilShort = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short"
            });

            const creator = `pelo administrador ${user.name}`;
            const logEntries: string[] = [];

            /* 1. Check for Status changes */
            if (data.status !== undefined && data.status !== appointment.status) {
                logEntries.push(`[${nowInBrazilShort}] Status alterado de "${MEDICAL_RECORDS_MAP[appointment.status] || appointment.status}" para "${MEDICAL_RECORDS_MAP[data.status] || data.status}" ${creator}`);
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
                    
                    logEntries.push(`[${nowInBrazilShort}] Data alterada de ${formatUtcDateBR(appointment.scheduleDate)} para ${formatUtcDateBR(data.scheduleDate)} ${creator}`);
                }
            }

            /* 3. Check for Period changes */
            if (data.period !== undefined && data.period !== appointment.period) {
                const formatPeriod = (p: string | null | undefined) => {
                    if (p === "MORNING") return "Manhã";
                    if (p === "AFTERNOON") return "Tarde";
                    return "Não definido";
                };
                
                logEntries.push(`[${nowInBrazilShort}] Período alterado de ${formatPeriod(appointment.period)} para ${formatPeriod(data.period)} ${creator}`);
            }

            /* If there are any changes to log, group them and update */
            if (logEntries.length > 0) {
                const newLogs = logEntries.join('\n');
                medicalRecordUpdate = {
                    update: {
                        history: appointment.medicalRecord.history
                            ? `${appointment.medicalRecord.history}\n${newLogs}`
                            : newLogs
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

    /* helpers */

    async checkSlotAvailability(date: Date, period: string, limit: number) {
        const count = await prisma.neuteringAppointment.count({
            where: {
                scheduleDate: date,
                period: period,
                status: { in: ["PENDING", "CONFIRMED", "AWAITING_EXAMS", "COMPLETED"] }
            }
        });

        if (count >= limit) {
            throw new HTTPException(400, { message: "No more slots available for this date and period" });
        }
    },

    /* neutering quota related services */

    async getQuotas() {
        let config = await prisma.neuteringConfig.findUnique({ where: { id: 1 } });
        
        if (!config) {
            config = await prisma.neuteringConfig.create({ data: { id: 1 } });
        }

        return {
            WEEKDAY: {
                MORNING: { species: "CAT", limit: config.weekdayMorningLimit },
                AFTERNOON: { species: "DOG", limit: config.weekdayAfternoonLimit },
            },
            FRIDAY: {
                MORNING: { species: "CAT", gender: "MALE", limit: config.fridayMorningLimit },
                AFTERNOON: { species: "DOG", gender: "MALE", limit: config.fridayAfternoonLimit },
            }
        };
    },

    async updateLimits(userId: string, data: UpdateNeuteringLimitsInput) {
        const user = await prisma.user.findUnique({ 
            where: { id: userId } 
        });

        if (!user || user.role !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        return await prisma.neuteringConfig.upsert({
            where: { 
                id: 1 
            },
            update: data,
            create: {
                id: 1,
                weekdayMorningLimit: data.weekdayMorningLimit ?? 12,
                weekdayAfternoonLimit: data.weekdayAfternoonLimit ?? 6,
                fridayMorningLimit: data.fridayMorningLimit ?? 20,
                fridayAfternoonLimit: data.fridayAfternoonLimit ?? 7,
            }
        });
    },
    
    async getCalendarCounts(startDate: Date, endDate: Date) {
        const NEUTERING_QUOTAS = await this.getQuotas();

        const counts = await prisma.neuteringAppointment.groupBy({
            by: ['scheduleDate', 'period'],
            _count: {
                id: true
            },
            where: {
                scheduleDate: {
                    gte: startDate,
                    lte: endDate
                },
                status: { in: ["PENDING", "CONFIRMED", "AWAITING_EXAMS", "COMPLETED"] },
                period: { not: null }
            }
        });

        /* map all ocuped days */
        const filledSlots = counts.reduce((acc, curr) => {
            if (!curr.scheduleDate || !curr.period) return acc;
            
            const dateStr = curr.scheduleDate.toISOString().split('T')[0];
            if (!acc[dateStr]) acc[dateStr] = { MORNING: 0, AFTERNOON: 0 };
            
            acc[dateStr][curr.period] = curr._count.id;
            return acc;
        }, {} as Record<string, Record<string, number>>);

        const calendarData: Record<string, { MORNING: number; AFTERNOON: number }> = {};
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getUTCDay();

            if (dayOfWeek === 0 || dayOfWeek === 6) {
                calendarData[dateStr] = { MORNING: 0, AFTERNOON: 0 };
            } else {
                const isFriday = dayOfWeek === 5;
                const dailyQuota = isFriday ? NEUTERING_QUOTAS.FRIDAY : NEUTERING_QUOTAS.WEEKDAY;

                const filledMorning = filledSlots[dateStr]?.MORNING || 0;
                const filledAfternoon = filledSlots[dateStr]?.AFTERNOON || 0;

                calendarData[dateStr] = {
                    MORNING: Math.max(0, dailyQuota.MORNING.limit - filledMorning),
                    AFTERNOON: Math.max(0, dailyQuota.AFTERNOON.limit - filledAfternoon)
                };
            }
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        return calendarData;
    },
};
