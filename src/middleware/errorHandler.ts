import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod';
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

const status_code_map: Record<number, string> = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR"
};

export const errorMiddleware = () => {
    return (err: Error, ctx: Context) => {

        /* initialize error as internal server error (unknown) */
        let status: ContentfulStatusCode = 500;
        let code = "INTERNAL_SERVER_ERROR";
        let message = "Internal Server Error";
        let details = undefined;


        /* if it is a syntax error (user send a bad json format), we handle it here */
        if (err instanceof SyntaxError && err.message.includes('JSON')) {
            return ctx.json({
                success: false,
                message: "Invalid JSON format in request body",
                code: "INVALID_JSON"
            }, 400);
        }

        /* if it was thrown by the backend logic, it is a known error, so we handle it */
        if (err instanceof HTTPException) {
            status = err.status
            message = err.message
            /* details is a specific field for zod to list all errors and messages that will need
            to be added to the inputs */
            details = undefined;
           
            /* add the error code name by its status */
            if (status_code_map[status]) {
                code = status_code_map[status];
            }

            /* if it was an zod error, set it as validation error */
            if (err.cause instanceof ZodError) {
                code = 'VALIDATION_ERROR'
                details = err.cause.issues
            }
        }

        /* prisma might also throw errors sometimes, we handle it here to avoid everything that is from prisma being error 500 */
        if ((err as any).code === 'P2002') {
            status = 409
            code = status_code_map[status];
            message = "A record with this unique field already exists"
        }
        else if ((err as any).code === 'P2003') {
            status = 409
            code = status_code_map[status];
            message = "Foreign Key constraint failed, a related record was not found or cannot be deleted"
        }
        else if ((err as any).code === 'P2025') {
            status = 404
            code = status_code_map[status];
            message = "The requested resource could not be found"
        }

        /* log only system errors (on production) */
        if (status >= 500 || process.env.NODE_ENV !== "production") {
            console.error('System Error:', err)
        }

        /* sends json response to the frontend */
        return ctx.json(
            {
                success: false,
                code: code,
                message: message,
                details: details,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            }, 
            status
        )
    }
}
