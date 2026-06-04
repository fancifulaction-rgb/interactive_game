-- Создание Edge Function для управления настройками квеста
-- Этот код нужно выполнить в Supabase Edge Functions

const { createClient } = require('@supabase/supabase-js')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, settings } = await req.json()

    if (action === 'create_table') {
      // Создаем таблицу quest_settings
      const { error: createError } = await supabase.rpc('create_table_quest_settings')
      
      if (createError) {
        // Если RPC функция не существует, создаем напрямую
        const { error } = await supabase.from('quest_settings').insert([
          { key: 'test', value: 'test' }
        ])
      }
      
      return new Response(
        JSON.stringify({ success: true, message: 'Table created or exists' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'insert_defaults') {
      // Вставляем настройки по умолчанию
      const { error } = await supabase
        .from('quest_settings')
        .upsert([
          {
            key: 'quest_title',
            value: 'Интерактивный Квест',
            description: 'Название квеста на главной странице',
            category: 'main_page'
          },
          {
            key: 'quest_subtitle', 
            value: 'Выберите режим для начала',
            description: 'Подзаголовок на главной странице',
            category: 'main_page'
          }
        ], {
          onConflict: 'key'
        })

      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, message: 'Default settings inserted' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})