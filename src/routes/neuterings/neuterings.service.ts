import { prisma } from "../../lib/prisma.js";
import { HTTPException } from "hono/http-exception";
import type { CreateNeuteringInput, UpdateNeuteringStatusInput } from "./neuterings.schema";
import { NEUTERING_QUOTAS, MAX_PETS_PER_MONTH_BY_CPF, MIN_DAY_LIMIT_FOR_NEUTERING_REQUEST } from "../../constants/constants"

/* frontend will receive absolute 00:00 dates in UTC-0 it must not convert the date to local timezone or it may
change the day and cause bugs */

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
                throw new HTTPException(400, { message: `${quota.species}s can only be neutered in the ${data.period.toLowerCase()}` });
            }

            await this.checkSlotAvailability(data.scheduleDate, data.period, quota.limit);
        }

        return await prisma.neuteringAppointment.create({
            data: {
                userId,
                petId: data.petId,
                scheduleDate: data.scheduleDate,
                period: data.period,
                status: "PENDING"
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
    }

    // ... must add methods list(), listByUser() updateStatus() later
};