// The web app's server environment. Database settings live in @iwb/server.
export const isDev = process.env.NODE_ENV === 'development'
/** Deployed on Vercel, where BotID can judge requests (§6). */
export const onVercel = !!process.env.VERCEL
