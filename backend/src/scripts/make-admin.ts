/** Promote an existing account to admin:  npm run security:make-admin -- you@example.com */
import { prisma } from '../config/prisma.js'

const email = process.argv[2]
if (!email) { console.error('Usage: npm run security:make-admin -- <email>'); process.exit(1) }
prisma.user.update({ where: { email }, data: { role: 'admin' } })
  .then((u) => console.log(`${u.email} is now admin.`))
  .catch((e) => { console.error(e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
