import { handleCors, jsonResponse } from '../_shared/adminAuth.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const setupSecret = Deno.env.get('ADMIN_SETUP_SECRET')
  const provided = req.headers.get('x-admin-setup-secret')

  if (!setupSecret || provided !== setupSecret) {
    return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Not allowed' } }, 403)
  }

  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Admin JWT required' } }, 401)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const userId = typeof body.user_id === 'string' ? body.user_id : null
    if (!userId) {
      return jsonResponse({ error: { code: 'INVALID_INPUT', message: 'user_id required' } }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_confirm: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to confirm email: ${error}`)
    }

    return jsonResponse({
      success: true,
      message: 'Admin email confirmed successfully',
    })
  } catch (error) {
    return jsonResponse(
      {
        error: {
          code: 'EMAIL_CONFIRMATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500
    )
  }
})
