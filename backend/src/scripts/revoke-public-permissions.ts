/**
 * One-off cleanup for instances that ran the upstream code: removes the public
 * "anyone with the link can edit" permission that was added to every upload.
 *
 *   npm run security:revoke-public            # apply
 *   npm run security:revoke-public -- --dry   # only report
 */
import { google } from 'googleapis'
import { prisma } from '../config/prisma.js'
import { getAuthedGoogleClient } from '../modules/google/google.service.js'
import { removeAnyonePermissions } from '../modules/google/drive-permissions.js'

const dryRun = process.argv.includes('--dry')

async function main() {
  const accounts = await prisma.connectedAccount.findMany({ where: { provider: 'google_drive' } })
  let scanned = 0, cleaned = 0, failed = 0
  for (const account of accounts) {
    const drive = google.drive({ version: 'v3', auth: await getAuthedGoogleClient(account) })
    const files = await prisma.file.findMany({ where: { connectedAccountId: account.id, provider: 'google_drive', status: 'active' }, select: { providerFileId: true, name: true } })
    for (const file of files) {
      scanned++
      try {
        if (dryRun) {
          const list = await drive.permissions.list({ fileId: file.providerFileId, fields: 'permissions(type)' })
          if ((list.data.permissions ?? []).some((p) => p.type === 'anyone')) { cleaned++; console.log(`[public] ${account.email} :: ${file.name}`) }
        } else if (await removeAnyonePermissions(drive, file.providerFileId) > 0) {
          cleaned++; console.log(`[fixed]  ${account.email} :: ${file.name}`)
        }
      } catch (err: any) {
        failed++; console.error(`[error]  ${account.email} :: ${file.name}: ${err.message || err}`)
      }
    }
  }
  console.log(`\nScanned ${scanned} files. ${dryRun ? 'Public' : 'Made private'}: ${cleaned}. Errors: ${failed}.`)
}

main().finally(() => prisma.$disconnect())
