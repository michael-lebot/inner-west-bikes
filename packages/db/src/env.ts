// The server environment, parsed once. Off Vercel every variable has a local default, so a fresh clone needs no
// env files; on Vercel a missing one throws the first time code that needs it runs (plan §1.6).
import { z } from 'zod'

const local = !process.env.VERCEL

export const env = z
  .object({
    DATABASE_URL: local ? z.url().default('postgresql://iwb:iwb@localhost:54318/iwb') : z.url(),
  })
  .parse(process.env)
