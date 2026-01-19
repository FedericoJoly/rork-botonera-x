import * as z from "zod";
import { Resend } from "resend";

import { createTRPCRouter, publicProcedure } from "../create-context";

const resend = new Resend(process.env.RESEND_API_KEY);

export const passwordRecoveryRouter = createTRPCRouter({
  sendRecoveryEmail: publicProcedure
    .input(z.object({ 
      email: z.string().email(),
      temporaryPassword: z.string(),
      username: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log('📧 Sending password recovery email to:', input.email);
      
      try {
        const { data, error } = await resend.emails.send({
          from: 'Sales App <onboarding@resend.dev>',
          to: input.email,
          subject: 'Your Password Has Been Reset',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">Password Reset</h2>
              <p>Hello <strong>${input.username}</strong>,</p>
              <p>Your password has been reset. Here is your new temporary password:</p>
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <code style="font-size: 18px; font-weight: bold; color: #007AFF;">${input.temporaryPassword}</code>
              </div>
              <p>Please log in with this temporary password and change it immediately for security.</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                If you didn't request this password reset, please contact your administrator immediately.
              </p>
            </div>
          `,
        });

        if (error) {
          console.error('❌ Resend error:', error);
          throw new Error(error.message || 'Failed to send email');
        }

        console.log('✅ Password recovery email sent:', data?.id);
        return { success: true, messageId: data?.id };
      } catch (error) {
        console.error('❌ Error sending recovery email:', error);
        throw error;
      }
    }),
});
