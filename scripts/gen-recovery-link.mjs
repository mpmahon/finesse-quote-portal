/**
 * One-off admin helper: generate a password-recovery link WITHOUT sending an
 * email, bypassing Supabase's built-in mailer rate limit. Prints the
 * action_link, which the account owner pastes into a browser to land on the
 * app's /auth/reset-password page with a valid recovery session.
 *
 * Usage: node scripts/gen-recovery-link.mjs <email>
 *
 * Uses the service-role key from .env.local — never commit its output, and
 * the link is single-use and short-lived.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Parse .env.local ourselves — a plain node script doesn't get Next's loader.
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    })
)

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/gen-recovery-link.mjs <email>')
  process.exit(1)
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const { data, error } = await supabase.auth.admin.generateLink({
  type: 'recovery',
  email,
  options: { redirectTo: 'https://finesse-quote-portal.vercel.app/auth/reset-password' },
})

if (error) {
  console.error('ERROR:', error.message)
  process.exit(1)
}

console.log('\nRECOVERY LINK (single-use, expires shortly):\n')
console.log(data.properties?.action_link)
console.log('')
