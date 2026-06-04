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

        // Method 1: Try to use psql through pg client
        // Since we can't use npm packages, we'll try to connect using fetch
        // to a custom RPC function or use the Storage API approach
        
        // Create a temporary SQL function that can be called
        const createSQLFunctionQuery = `
            CREATE OR REPLACE FUNCTION create_storage_policies()
            RETURNS void
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            BEGIN
                -- Enable RLS
                ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
                
                -- Drop existing policies
                DROP POLICY IF EXISTS "Public Access question-media" ON storage.objects;
                DROP POLICY IF EXISTS "Public Upload question-media" ON storage.objects;
                DROP POLICY IF EXISTS "Public Update question-media" ON storage.objects;
                DROP POLICY IF EXISTS "Public Delete question-media" ON storage.objects;
                DROP POLICY IF EXISTS "Public Access answer-media" ON storage.objects;
                DROP POLICY IF EXISTS "Public Upload answer-media" ON storage.objects;
                DROP POLICY IF EXISTS "Public Update answer-media" ON storage.objects;
                DROP POLICY IF EXISTS "Public Delete answer-media" ON storage.objects;
                
                -- Create question-media policies
                CREATE POLICY "Public Access question-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'question-media');
                CREATE POLICY "Public Upload question-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'question-media');
                CREATE POLICY "Public Update question-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'question-media');
                CREATE POLICY "Public Delete question-media" ON storage.objects FOR DELETE TO public USING (bucket_id = 'question-media');
                
                -- Create answer-media policies
                CREATE POLICY "Public Access answer-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'answer-media');
                CREATE POLICY "Public Upload answer-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'answer-media');
                CREATE POLICY "Public Update answer-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'answer-media');
                CREATE POLICY "Public Delete answer-media" ON storage.objects FOR DELETE TO public USING (bucket_id = 'answer-media');
            END;
            $$;
        `;

        // Try to create the function
        const createFunctionResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/create_storage_policies`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                'Content-Type': 'application/json',
                'apikey': supabaseServiceRoleKey,
            },
            body: JSON.stringify({ query: createSQLFunctionQuery })
        });

        // If that doesn't work, let's try to create policies directly via storage management
        // This is a workaround using the storage management API

        // First, try to set up public access for buckets via Storage API
        const setupBucketsResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                'apikey': supabaseServiceRoleKey,
            },
        });

        const buckets = await setupBucketsResponse.json();
        
        // Try to create policies for existing buckets using storage API
        const policies = [
            'Public Access question-media',
            'Public Upload question-media', 
            'Public Update question-media',
            'Public Delete question-media',
            'Public Access answer-media',
            'Public Upload answer-media',
            'Public Update answer-media',
            'Public Delete answer-media'
        ];

        let policyResults = [];
        
        for (const policyName of policies) {
            try {
                // Since we can't directly create RLS policies via API, 
                // let's try using Supabase's built-in public bucket functionality
                
                // For now, we'll try to set the buckets to public access
                const bucketId = policyName.includes('question') ? 'question-media' : 'answer-media';
                
                const bucketUpdateResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                        'Content-Type': 'application/json',
                        'apikey': supabaseServiceRoleKey,
                    },
                    body: JSON.stringify({
                        public: true,
                        allowed_mime_types: ['image/*', 'video/*', 'audio/*'],
                        file_size_limit: 10485760
                    })
                });
                
                policyResults.push({
                    policy: policyName,
                    bucket: bucketId,
                    status: bucketUpdateResponse.ok ? 'success' : 'failed',
                    response: bucketUpdateResponse.status
                });
                
            } catch (error) {
                policyResults.push({
                    policy: policyName,
                    status: 'error',
                    error: error.message
                });
            }
        }

        // Check if policies were created via SQL execution
        let sqlPolicies = [];
        try {
            const checkResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_policies`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseServiceRoleKey,
                },
                body: JSON.stringify({})
            });
            
            if (checkResponse.ok) {
                sqlPolicies = await checkResponse.json();
            }
        } catch (error) {
            console.log('SQL policy check failed:', error);
        }

        return new Response(
            JSON.stringify({ 
                success: true,
                message: 'Storage policies setup attempt completed',
                buckets_check: buckets,
                bucket_updates: policyResults,
                sql_policies: sqlPolicies,
                sql_function_query: createSQLFunctionQuery,
                next_steps: [
                    'If bucket updates were successful, try uploading files now',
                    'If SQL function was created, execute: SELECT create_storage_policies();',
                    'If still not working, request project owner to enable service role permissions in Supabase Dashboard'
                ]
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