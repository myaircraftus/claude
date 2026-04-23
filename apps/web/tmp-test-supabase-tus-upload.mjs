import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { Upload } from 'tus-js-client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const filePath = process.env.TEST_FILE
const fileName = process.env.TEST_NAME
if (!supabaseUrl || !serviceRole || !filePath) throw new Error('Missing env')

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
const storagePath = `smoke-tests/${crypto.randomUUID()}/${fileName}`
const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await supabase.storage.from('documents').createSignedUploadUrl(storagePath)
if (error || !data?.token) throw error || new Error('No signed token')
const file = fs.readFileSync(filePath)
console.log(JSON.stringify({ event: 'start', size: file.length, storagePath }))
await new Promise((resolve, reject) => {
  const upload = new Upload(file, {
    endpoint,
    retryDelays: [0, 1000, 3000],
    headers: { 'x-upsert': 'false', 'x-signature': data.token },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    chunkSize: 6 * 1024 * 1024,
    uploadLength: file.length,
    metadata: {
      bucketName: 'documents',
      objectName: storagePath,
      contentType: 'application/pdf',
      cacheControl: '3600',
    },
    onProgress: (uploaded, total) => {
      if (uploaded === total || uploaded % (24 * 1024 * 1024) < 6 * 1024 * 1024) {
        console.log(JSON.stringify({ event: 'progress', uploaded, total }))
      }
    },
    onError: reject,
    onSuccess: resolve,
  })
  upload.start()
})
console.log(JSON.stringify({ event: 'success', storagePath }))
const { error: removeError } = await supabase.storage.from('documents').remove([storagePath])
if (removeError) throw removeError
console.log(JSON.stringify({ event: 'cleanup' }))
