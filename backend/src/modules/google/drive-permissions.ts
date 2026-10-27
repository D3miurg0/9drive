import type { drive_v3 } from 'googleapis'

/** Deletes every "anyone" (public link) permission on a Drive file. Returns how many were removed. */
export async function removeAnyonePermissions(drive: drive_v3.Drive, fileId: string): Promise<number> {
  const list = await drive.permissions.list({ fileId, fields: 'permissions(id,type,role)', supportsAllDrives: true })
  const publicPerms = (list.data.permissions ?? []).filter((p) => p.type === 'anyone' && p.id)
  for (const perm of publicPerms) {
    await drive.permissions.delete({ fileId, permissionId: perm.id!, supportsAllDrives: true })
  }
  return publicPerms.length
}
