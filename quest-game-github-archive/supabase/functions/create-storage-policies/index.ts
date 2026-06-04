Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        
        if (!supabaseServiceRoleKey || !supabaseUrl) {
            throw new Error('Missing Supabase credentials');
        }

        const sqlQueries = [
            // Enable RLS
            'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;',
            
            // Drop existing policies
            'DROP POLICY IF EXISTS "Public Access question-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Upload question-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Update question-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Delete question-media" ON storage.objects;',
            
            // Create question-media policies
            'CREATE POLICY "Public Access question-media" ON storage.objects FOR SELECT TO public USING (bucket_id = \'question-media\');',
            'CREATE POLICY "Public Upload question-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = \'question-media\');',
            'CREATE POLICY "Public Update question-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = \'question-media\');',
            'CREATE POLICY "Public Delete question-media" ON storage.objects FOR DELETE TO public USING (bucket_id = \'question-media\');',
            
            // Create answer-media policies
            'CREATE POLICY "Public Access answer-media" ON storage.objects FOR SELECT TO public USING (bucket_id = \'answer-media\');',
            'CREATE POLICY "Public Upload answer-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = \'answer-media\');',
            'CREATE POLICY "Public Update answer-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = \'answer-media\');',
            'CREATE POLICY "Public Delete answer-media" ON storage.objects FOR DELETE TO public USING (bucket_id = \'answer-media\');',
        ];

        const results = [];
        
        // Execute each SQL query
        for (const query of sqlQueries) {
            try {
                const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sql`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                        'apikey': supabaseServiceRoleKey,
                    },
                    body: JSON.stringify({
                        query: query
                    }),
                });

                if (response.ok) {
                    results.push({ query, status: 'success' });
                } else {
                    const errorText = await response.text();
                    results.push({ query, status: 'error', error: errorText });
                }
            } catch (error) {
                results.push({ query, status: 'error', error: error.message });
            }
        }

        // Check final policies
        try {
            const checkResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/sql`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseServiceRoleKey,
                },
                body: JSON.stringify({
                    query: 'SELECT policyname, cmd FROM pg_policies WHERE tablename = \'objects\' AND schemaname = \'storage\' ORDER BY policyname;'
                }),
            });

            const checkData = await checkResponse.json();
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'Storage policies setup completed',
                    results,
                    policies: checkData
                }), 
                { 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        } catch (error) {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: 'Storage policies setup completed',
                    results,
                    policies_check_error: error.message
                }), 
                { 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

    } catch (error) {
        return new Response(
            JSON.stringify({
                error: {
                    code: 'FUNCTION_ERROR',
                    message: error.message
                }
            }), 
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});