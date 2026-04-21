import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateNeuteringInput, UpdateNeuteringStatusInput, ListNeuteringsQueryInput } from "./neuterings.schema";
import { NEUTERING_QUOTAS, MAX_PETS_PER_MONTH_BY_CPF, MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST, MIN_HOUR_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST, MIN_PET_AGE_FOR_NEUTERING, MAX_PET_AGE_FOR_NEUTERING, MIN_PET_WEIGHT_FOR_NEUTERING, MAX_PET_WEIGHT_FOR_NEUTERING, BRACHYCEPHALIC_BREEDS } from "../../constants/constants"

/* frontend will receive absolute 00:00 dates in UTC-0 it must not convert the date to local timezone or it may
change the day and cause bugs */

/* it is ok to not allow admin creates neutering requests for other users, because user is meant to attatch their pet
to the request on the moment of creation */

export const neuteringService = {
    async create(userId: string, data: CreateNeuteringInput) {

        const pet = await prisma.pet.findUnique({
            where: { id: data.petId }
        });

        const user = await prisma.user.findUnique({
            where: {id: userId}
        })

        if (!user || !pet) {
            throw new HTTPException(404, { message: "User or Pet not found" });
        }

        if (pet.ownerId !== userId) {
            throw new HTTPException(403, { message: "You can only schedule appointments for your own pet" });
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

        if (activeAppointment) {
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
        let neuteringStatus:'PENDING' | 'AWAITING_EXAMS' = "PENDING";

        if (pet.species === "DOG" && pet.gender === "FEMALE") {
            if ((pet.weight <= MIN_PET_WEIGHT_FOR_NEUTERING) || pet.weight > MAX_PET_WEIGHT_FOR_NEUTERING) {
                neuteringStatus = "AWAITING_EXAMS";
            }
        }

        /* constraint: brachycephalic pets must do exams */
        if (pet.breed && BRACHYCEPHALIC_BREEDS.includes(pet.breed)) {
            neuteringStatus = "AWAITING_EXAMS";
        }

        /* admins are allowed to skip any rules for neutering request creation */
        if (user.role === "ADMIN") {
            return await prisma.neuteringAppointment.create({
                data: {
                    userId,
                    petId: data.petId,
                    scheduleDate: data.scheduleDate,
                    period: data.period,
                    status: neuteringStatus
                },
                include: { /* return pet data so frontend can show on success screen */
                    pet: {
                        select: { name: true, species: true }
                    }
                }
            });
        }

        /* rule 1: you can only send appointment requests after MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST */
        const now = new Date(); /* now is in UTC-0 probably */
        const localNow = new Date(now.getTime() - (3 * 60 * 60 * 1000)); /* convert to brasilia to match frontend day */
        const minDate = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST, 0, 0, 0, 0));
        
        if (data.scheduleDate < minDate) {
            throw new HTTPException(400, { message: `Appointments must be scheduled at least ${MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST} days in advance` });
        }

        /* rule 2: if user is blocked by NO_SHOW, don't allow the request */
        if (user.blockedUntil && user.blockedUntil > new Date()) {
            throw new HTTPException(403, {message: `User is blocked from scheduling until ${user.blockedUntil.toLocaleDateString()}`});
        }

        /* rule 3: monthly limit of MAX_PETS_PER_MONTH_BY_CPF appointments per CPF */
        const startOfMonth = new Date(Date.UTC(data.scheduleDate.getUTCFullYear(), data.scheduleDate.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(data.scheduleDate.getUTCFullYear(), data.scheduleDate.getUTCMonth() + 1, 0));

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

        // rule 5: specific rules for animal species and gender based on week days */
        const dayOfWeek = data.scheduleDate.getUTCDay(); /* 0 = Sunday, 1 = Monday 5 = Friday */
        const isFriday = dayOfWeek === 5;
        const isWeekday = dayOfWeek > 0 && dayOfWeek < 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        /* no appointment allowed on weekends */
        if (isWeekend) {
            throw new HTTPException(400, { message: "Neutering is only available from Monday to Friday" });
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

            await this.checkSlotAvailability(data.scheduleDate, data.period, quota.limit);
        } 

        if (isWeekday) {
            const quota = data.period === "MORNING" ? NEUTERING_QUOTAS.WEEKDAY.MORNING : NEUTERING_QUOTAS.WEEKDAY.AFTERNOON;
            
            if (pet.species !== quota.species) {
                throw new HTTPException(400, { message: `Only ${quota.species}s can only be neutered in the ${data.period.toLowerCase()}` });
            }

            await this.checkSlotAvailability(data.scheduleDate, data.period, quota.limit);
        }

        return await prisma.neuteringAppointment.create({
            data: {
                userId,
                petId: data.petId,
                scheduleDate: data.scheduleDate,
                period: data.period,
                status: neuteringStatus
            },
            include: { /* return pet data so frontend can show on success screen */
                pet: {
                    select: { name: true, species: true }
                }
            }
        });
    },

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

    async listByUser(userId: string, filters?: ListNeuteringsQueryInput) {
        return await prisma.neuteringAppointment.findMany({
            where: {
                userId,
                status: filters?.status,
                petId: filters?.petId,
                scheduleDate: {
                    gte: filters?.startDate,
                    lte: filters?.endDate
                }
            },
            include: {
                pet: { select: { name: true, species: true, gender: true, breed: true } }
            },
            orderBy: { scheduleDate: 'desc' }
        });
    },

    /* admin only */
    async list(userRole: string, filters: ListNeuteringsQueryInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const limit = filters.limit;
        const page = filters.page;
        const skip = (page - 1) * limit;

        const appointments = await prisma.neuteringAppointment.findMany({
            where: {
                userId: filters.userId,
                status: filters.status,
                petId: filters.petId,
                scheduleDate: {
                    gte: filters.startDate,
                    lte: filters.endDate
                }
            },
            include: {
                pet: { select: { name: true, species: true, ownerId: true } },
                user: { select: { name: true, lastName: true, email: true, phone: true } }
            },
            orderBy: { scheduleDate: 'desc' },
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

    /* admin only */
    async updateStatus(appointmentId: string, userRole: string, data: UpdateNeuteringStatusInput) {
        if (userRole !== "ADMIN") {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        const appointment = await prisma.neuteringAppointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment) {
            throw new HTTPException(404, { message: "Neutering appointment not found" });
        }

        /* rule: if admin set as NO_SHOW, we automatically block the user for a month */
        if (data.status === "NO_SHOW" && appointment.status !== "NO_SHOW") {
           
            const blockUntilDate = new Date();
            blockUntilDate.setDate(blockUntilDate.getDate() + 30); /* add 30 days */

            /* we use transaction to update appointment and user status at the same time */
            return await prisma.$transaction([
                prisma.neuteringAppointment.update({
                    where: { id: appointmentId },
                    data: { ...data }
                }),
                prisma.user.update({
                    where: { id: appointment.userId },
                    data: { blockedUntil: blockUntilDate }
                })
            ]);
        }

        /* update for when status is !== NO_SHOW */
        return await prisma.neuteringAppointment.update({
            where: { id: appointmentId },
            data: { ...data }
        });
    },

    /* user action: cancel own appointment */
    async cancelByUser(appointmentId: string, userId: string) {
        const appointment = await prisma.neuteringAppointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment) {
            throw new HTTPException(404, { message: "Appointment not found" });
        }

        if (appointment.userId !== userId) {
            throw new HTTPException(403, { message: "You can only cancel your own appointments" });
        }

        if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
            throw new HTTPException(400, { message: `Cannot cancel an appointment with status ${appointment.status}` });
        }

        /* rule: you can only cancel > 24 hours before the appointment */
        const now = new Date();
        const localNow = new Date(now.getTime() - (3 * 60 * 60 * 1000)); // UTC-3
        const hoursDifference = (appointment.scheduleDate.getTime() - localNow.getTime()) / (1000 * 60 * 60);

        if (hoursDifference < MIN_HOUR_LIMIT_FOR_USER_CANCEL_NEUTERING_REQUEST) {
            throw new HTTPException(400, { message: "Cancellations must be made at least 48 hours in advance. If you still want to cancel contact the clinic" });
        }

        return await prisma.neuteringAppointment.update({
            where: { id: appointmentId },
            data: { status: "CANCELLED" }
        });
    }
};