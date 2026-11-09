// Vercel BotID's check runs in the browser before each public write, so the server can tell bots from people (§6).
import { initBotId } from 'botid/client/core'
import { ON_VERCEL } from '@/lib/public-env'

// Elsewhere lib/bot.ts treats every request as human, and the challenge it would fetch only exists on Vercel.
if (ON_VERCEL) initBotId({ protect: [{ path: '/api/*', method: 'POST' }] })
