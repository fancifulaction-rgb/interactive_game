import { handleCors, jsonResponse } from '../_shared/adminAuth.ts'
import { validatePlayerUploadInput, verifyTeamSession } from '../_shared/teamSession.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')

    if (!supabaseServiceRoleKey || !supabaseUrl) {
      throw new Error('Missing Supabase credentials')
    }

    const body = await req.json()
    const { file, bucket, fileName, mimeType, gameId, teamId, sessionToken } = body

    let fileData: Uint8Array
    if (typeof file === 'string') {
      const binaryString = atob(file)
      fileData = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        fileData[i] = binaryString.charCodeAt(i)
      }
    } else {
      fileData = new Uint8Array(file)
    }

    const validationError = validatePlayerUploadInput({
      bucket,
      fileName,
      gameId,
      teamId,
      sessionToken,
      fileByteLength: fileData.byteLength,
    })
    if (validationError) {
      return jsonResponse({ error: { code: 'INVALID_INPUT', message: validationError } }, 400)
    }

    const sessionOk = await verifyTeamSession(teamId, gameId, sessionToken)
    if (!sessionOk) {
      return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Invalid team session' } }, 403)
    }

    let contentType = mimeType || 'application/octet-stream'
    if (!contentType || contentType === 'application/octet-stream') {
      const lower = fileName.toLowerCase()
      if (lower.endsWith('.png')) contentType = 'image/png'
      else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg'
      else if (lower.endsWith('.gif')) contentType = 'image/gif'
      else if (lower.endsWith('.webp')) contentType = 'image/webp'
      else if (lower.endsWith('.mp4')) contentType = 'video/mp4'
      else if (lower.endsWith('.mp3')) contentType = 'audio/mpeg'
      else if (lower.endsWith('.wav')) contentType = 'audio/wav'
    }

    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        apikey: supabaseServiceRoleKey,
        'Content-Type': contentType,
      },
      body: fileData,
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`)
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`

    return jsonResponse({
      success: true,
      url: publicUrl,
      fileName,
      bucket,
      contentType,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: {
          code: 'UPLOAD_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    )
  }
})
