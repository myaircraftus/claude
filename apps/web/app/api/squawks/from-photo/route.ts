import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const imageBlob = formData.get('image')
  const imageFileName =
    typeof imageBlob === 'object' && imageBlob && 'name' in imageBlob && typeof imageBlob.name === 'string'
      ? imageBlob.name
      : 'uploaded image'

  if (!imageBlob || !(imageBlob instanceof Blob)) {
    return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: 'Photo extraction not configured',
        code: 'SERVICE_NOT_CONFIGURED',
      },
      { status: 503 }
    )
  }

  try {
    const arrayBuffer = await imageBlob.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = imageBlob.type || 'image/jpeg'
    const dataUrl = `data:${mimeType};base64,${base64}`

    const openai = new (await import('openai')).default({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract any maintenance squawks, discrepancies, or issues described in this image. Return a JSON array of objects with \'title\' and \'description\' fields for each squawk found. Return ONLY valid JSON, no markdown fences or extra text.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      max_tokens: 1024,
    })

    const content = response.choices[0]?.message?.content?.trim() ?? '[]'

    // Parse JSON from the response, stripping markdown fences if present
    let squawks: { title: string; description: string }[]
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      squawks = JSON.parse(cleaned)
    } catch {
      // If parsing fails, return a single squawk with the raw text
      squawks = [{ title: 'Extracted squawk', description: content }]
    }

    return NextResponse.json({ squawks })
  } catch (err: any) {
    console.error('Photo extraction error:', err)
    return NextResponse.json({
      squawks: [
        {
          title: 'Photo attached for manual review',
          description: `Image "${imageFileName}" was attached, but AI extraction is temporarily unavailable. Review the photo manually or add more detail in text before saving.`,
        },
      ],
      fallback: true,
      error: err.message ?? 'Photo extraction failed',
    })
  }
}
