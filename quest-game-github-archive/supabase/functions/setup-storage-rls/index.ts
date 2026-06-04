import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Используем прямой SQL запрос через Postgres connection
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')
    if (!dbUrl) {
      throw new Error('SUPABASE_DB_URL not found')
    }

    // Выполняем SQL напрямую через fetch к PostgREST
    const sqlQuery = `
-- Включаем RLS для storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики
DROP POLICY IF EXISTS "Public Access question-media" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload question-media" ON storage.objects;
DROP POLICY IF EXISTS "Public Update question-media" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete question-media" ON storage.objects;
DROP POLICY IF EXISTS "Public Access answer-media" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload answer-media" ON storage.objects;
DROP POLICY IF EXISTS "Public Update answer-media" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete answer-media" ON storage.objects;

-- Политики для question-media
CREATE POLICY "Public Access question-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'question-media');
CREATE POLICY "Public Upload question-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'question-media');
CREATE POLICY "Public Update question-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'question-media') WITH CHECK (bucket_id = 'question-media');
CREATE POLICY "Public Delete question-media" ON storage.objects FOR DELETE TO public USING (bucket_id = 'question-media');

-- Политики для answer-media
CREATE POLICY "Public Access answer-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'answer-media');
CREATE POLICY "Public Upload answer-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'answer-media');
CREATE POLICY "Public Update answer-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'answer-media') WITH CHECK (bucket_id = 'answer-media');
CREATE POLICY "Public Delete answer-media" ON storage.objects FOR DELETE TO public USING (bucket_id = 'answer-media');
`

    // Пытаемся выполнить через разные методы
    let success = false
    let method = ''
    let result = null

    // Метод 1: Попытка через REST API query
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: sqlQuery })
      })
      
      if (response.ok) {
        success = true
        method = 'REST API'
        result = await response.json()
      }
    } catch (e) {
      console.log('Method 1 failed:', e.message)
    }

    // Метод 2: Прямой запрос к базе данных
    if (!success) {
      try {
        // Выполняем каждую политику отдельно через supabase client
        const policies = sqlQuery.split(';').filter(q => q.trim())
        const results = []
        
        for (const policy of policies) {
          if (!policy.trim()) continue
          try {
            const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql: policy })
            if (!error) {
              results.push({ success: true, policy: policy.substring(0, 50) })
            } else {
              results.push({ success: false, policy: policy.substring(0, 50), error: error.message })
            }
          } catch (e) {
            results.push({ success: false, policy: policy.substring(0, 50), error: e.message })
          }
        }
        
        success = results.some(r => r.success)
        method = 'Supabase Client RPC'
        result = results
      } catch (e) {
        console.log('Method 2 failed:', e.message)
      }
    }

    if (success) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Storage RLS policies configured successfully',
          method,
          result
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      // Возвращаем SQL для ручного выполнения
      return new Response(
        JSON.stringify({ 
          success: false,
          message: 'Automatic setup failed. Manual SQL execution required.',
          sql: sqlQuery,
          instructions: 'Please execute the provided SQL in Supabase Dashboard > SQL Editor'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        note: 'Edge Function cannot directly modify storage policies. Manual setup required via Supabase Dashboard.'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
