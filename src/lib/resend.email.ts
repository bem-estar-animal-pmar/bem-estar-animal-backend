import { HTTPException } from "hono/http-exception";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "IMAAR - Bem-Estar Animal <noreply@mail.songsticker.com.br>";
const LOGO_URL = "https://bemestaranimal.com.br/logo.webp" /* must update later */

export const sendVerification = async (email: string, url: string) => {
    try {
        await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "E-mail De Verificação De Conta Do Bem-Estar Animal",
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 40px 20px; text-align: center;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                <img src="${LOGO_URL}" alt="Bem-estar Logo" style="width: 60px; height: 60px; margin-bottom: 24px; border-radius: 12px;">
                
                <h1 style="color: #111827; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">
                Bem-vindo ao Bem-Estar Animal!
                </h1>
                
                <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 32px;">
                Por favor, verifique seu e-mail clicando no botão abaixo para poder ter acesso à plataforma.
                </p>
                
                <a href="${url}" style="display: inline-block; background-color: #7A9C4C; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px;">
                Verificar Endereço de E-mail
                </a>
                
                <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
                Se você não pediu para receber esse e-mail. pode ignorá-lo com segurança.
                </p>
                
            </div>
            </div>
        `,
        });
    } catch (error) {
        console.error("Failed to send verification email:", error);
        throw new HTTPException(500, { message: "Failed to send verification mail" });
    }
};

export const sendPasswordReset = async (email: string, url: string) => {
    try {
        await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "Redefinição de Senha - Bem-Estar Animal",
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 40px 20px; text-align: center;">
            <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                
                <img src="${LOGO_URL}" alt="Bem-Estar Animal Logo" style="width: 60px; height: 60px; margin-bottom: 24px; border-radius: 12px;">
                
                <h1 style="color: #111827; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">
                Redefinição de Senha
                </h1>
                
                <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 32px;">
                Você solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha para sua conta.
                </p>
                
                <a href="${url}" style="display: inline-block; background-color: #7A9C4C; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px;">
                Redefinir Senha
                </a>
                
                <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
                Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança.
                </p>
                
            </div>
            </div>
        `,
        });
    } catch (error) {
        console.error("Failed to send password reset email:", error);
        throw new HTTPException(500, { message: "Failed to send password reset mail" });
    }
};