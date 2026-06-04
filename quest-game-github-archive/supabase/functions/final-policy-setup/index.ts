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

        // Create SQL commands using EXECUTE to bypass RLS
        const sqlCommands = [
            // Create function to bypass RLS and create policies
            `
                CREATE OR REPLACE FUNCTION create_policies_with_bypass()
                RETURNS void
                LANGUAGE plpgsql
                SECURITY DEFINER
                SET search_path = public
                AS $$
                BEGIN
                    -- Enable RLS on storage.objects
                    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
                    
                    -- Create policies using dynamic SQL
                    EXECUTE 'CREATE POLICY "Public Access question-media" ON storage.objects FOR SELECT TO public USING (bucket_id = ''question-media'')';
                    EXECUTE 'CREATE POLICY "Public Upload question-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = ''question-media'')';
                    EXECUTE 'CREATE POLICY "Public Update question-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = ''question-media'')';
                    EXECUTE 'CREATE POLICY "Public Delete question-media" ON storage.objects FOR DELETE TO public USING (bucket_id = ''question-media'')';
                    
                    EXECUTE 'CREATE POLICY "Public Access answer-media" ON storage.objects FOR SELECT TO public USING (bucket_id = ''answer-media'')';
                    EXECUTE 'CREATE POLICY "Public Upload answer-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = ''answer-media'')';
                    EXECUTE 'CREATE POLICY "Public Update answer-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = ''answer-media'')';
                    EXECUTE 'CREATE POLICY "Public Delete answer-media" ON storage.objects FOR DELETE TO public USING (bucket_id = ''answer-media'')';
                END;
                $$;
                
                -- Grant execute permission to anon
                GRANT EXECUTE ON FUNCTION create_policies_with_bypass() TO anon;
            `,
            
            // Execute the function
            'SELECT create_policies_with_bypass();',
            
            // Check if policies were created
            'SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename = ''objects'' AND schemaname = ''storage'' ORDER BY policyname;'
        ];

        const results = [];
        
        // Execute each command
        for (let i = 0; i < sqlCommands.length; i++) {
            const query = sqlCommands[i];
            
            try {
                // Try different approaches to execute SQL
                
                // Method 1: Try with RPC endpoint
                const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                        'apikey': supabaseServiceRoleKey,
                    },
                    body: JSON.stringify({ sql: query })
                });
                
                if (rpcResponse.ok) {
                    const data = await rpcResponse.json();
                    results.push({
                        step: i + 1,
                        method: 'rpc',
                        status: 'success',
                        result: data
                    });
                } else {
                    const errorText = await rpcResponse.text();
                    
                    // Try direct SQL execution
                    const directResponse = await fetch(`${supabaseUrl}/database/query`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                            'Content-Type': 'application/sql',
                            'apikey': supabaseServiceRoleKey,
                        },
                        body: query
                    });
                    
                    if (directResponse.ok) {
                        results.push({
                            step: i + 1,
                            method: 'direct',
                            status: 'success',
                            result: await directResponse.text()
                        });
                    } else {
                        results.push({
                            step: i + 1,
                            method: 'failed',
                            status: 'error',
                            error: errorText
                        });
                    }
                }
            } catch (error) {
                results.push({
                    step: i + 1,
                    method: 'exception',
                    status: 'error',
                    error: error.message
                });
            }
        }

        return new Response(
            JSON.stringify({ 
                success: true,
                message: 'Storage policies setup attempt completed',
                results,
                sql_queries: sqlCommands,
                recommendation: 'If no SQL function was created, manual SQL execution in Dashboard is required'
            }), 
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

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