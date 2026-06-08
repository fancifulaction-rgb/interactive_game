const ALLOWED_BUCKETS = new Set(['avatars', 'answer-media'])
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export function validateUploadPath(gameId: string, fileName: string): boolean {
  if (!gameId || !fileName) return false
  const prefix = `${gameId}/`
  if (!fileName.startsWith(prefix)) return false
  if (fileName.includes('..')) return false
  return true
}

export async function verifyTeamSession(
  teamId: string,
  gameId: string,
  sessionToken: string
): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey || !teamId || !gameId || !sessionToken) return false

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_team_session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_team_id: teamId,
      p_game_id: gameId,
      p_session_token: sessionToken,
    }),
  })

  if (!res.ok) return false
  const data = await res.json()
  return data === true
}

export function validatePlayerUploadInput(input: {
  bucket?: string
  fileName?: string
  gameId?: string
  teamId?: string
  sessionToken?: string
  fileByteLength?: number
}): string | null {
  if (!input.bucket || !input.fileName || !input.gameId || !input.teamId || !input.sessionToken) {
    return 'Missing required parameters'
  }
  if (!ALLOWED_BUCKETS.has(input.bucket)) {
    return 'Bucket not allowed'
  }
  if (!validateUploadPath(input.gameId, input.fileName)) {
    return 'Invalid upload path'
  }
  if ((input.fileByteLength ?? 0) > MAX_UPLOAD_BYTES) {
    return 'File too large'
  }
  return null
}
