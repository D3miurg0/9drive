import { prisma } from '../config/prisma.js'

export type RegistrationDecision =
  | { allowed: true; role: 'admin' | 'user' }
  | { allowed: false }

/**
 * Decides whether a NEW account may be created for `email`.
 * - The very first account of the instance is allowed and becomes admin.
 * - Afterwards, sign-up is closed unless ALLOW_PUBLIC_REGISTRATION=true
 *   or the email has a pending, non-revoked workspace invite.
 */
export async function decideRegistration(email: string): Promise<RegistrationDecision> {
  const userCount = await prisma.user.count()
  if (userCount === 0) return { allowed: true, role: 'admin' }
  if (process.env.ALLOW_PUBLIC_REGISTRATION === 'true') return { allowed: true, role: 'user' }
  const invite = await prisma.workspaceInvite.findFirst({
    where: { inviteeEmail: email, status: 'pending', revokedAt: null },
    select: { id: true },
  })
  return invite ? { allowed: true, role: 'user' } : { allowed: false }
}

export const REGISTRATION_CLOSED = {
  code: 'REGISTRATION_DISABLED',
  message: 'Registration is closed on this instance. Ask the administrator for an invite.',
} as const
