import CryptoJS from 'crypto-js'

const ENCRYPTION_KEY = process.env.APP_SECRET ?? 'fallback-key-change-me'

export function encryptToken(token: string): string {
  return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString()
}

export function decryptToken(encrypted: string): string {
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY)
  return bytes.toString(CryptoJS.enc.Utf8)
}

export interface DriveFile {
  id: string
  name: string
  size?: string
  modifiedTime: string
  mimeType: string
}

export async function listDriveFiles(accessToken: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: "mimeType='application/pdf' and trashed=false",
    fields: 'files(id,name,size,modifiedTime,mimeType)',
    pageSize: '50',
    orderBy: 'modifiedTime desc',
  })

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`Drive API error: ${res.status}`)
  const data = await res.json()
  return data.files ?? []
}

export async function downloadDriveFile(fileId: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`Drive download error: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function getDriveFileMetadata(fileId: string, accessToken: string): Promise<DriveFile> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,modifiedTime,mimeType`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Drive metadata error: ${res.status}`)
  return res.json()
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh error: ${res.status}`)
  return res.json()
}
