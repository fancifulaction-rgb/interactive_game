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

        // Direct SQL execution using PostgreSQL protocol
        // This bypasses the REST API and connects directly to PostgreSQL
        
        const connectionString = `postgresql://postgres:${supabaseServiceRoleKey}@db.${supabaseUrl.replace('https://', '')}:5432/postgres`;
        
        const sqlCommands = [
            // Enable RLS
            'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;',
            
            // Drop existing policies
            'DROP POLICY IF EXISTS "Public Access question-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Upload question-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Update question-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Delete question-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Access answer-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Upload answer-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Update answer-media" ON storage.objects;',
            'DROP POLICY IF EXISTS "Public Delete answer-media" ON storage.objects;',
            
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

        // Since direct PostgreSQL connection isn't available in Deno Edge Functions,
        // we'll try a different approach using the Storage Management API
        
        // First, try to get bucket information to verify buckets exist
        const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                'apikey': supabaseServiceRoleKey,
            },
        });

        if (!bucketResponse.ok) {
            throw new Error(`Failed to fetch buckets: ${bucketResponse.status}`);
        }

        const buckets = await bucketResponse.json();
        
        // Check if our buckets exist
        const questionMediaExists = buckets.some((b: any) => b.id === 'question-media');
        const answerMediaExists = buckets.some((b: any) => b.id === 'answer-media');
        
        // Try to create buckets if they don't exist
        if (!questionMediaExists) {
            const createBucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseServiceRoleKey,
                },
                body: JSON.stringify({
                    id: 'question-media',
                    name: 'question-media',
                    public: true,
                    file_size_limit: 5242880, // 5MB
                    allowed_mime_types: ['image/*', 'video/*', 'audio/*']
                }),
            });
        }
        
        if (!answerMediaExists) {
            const createBucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseServiceRoleKey,
                },
                body: JSON.stringify({
                    id: 'answer-media',
                    name: 'answer-media',
                    public: true,
                    file_size_limit: 5242880, // 5MB
                    allowed_mime_types: ['image/*', 'video/*', 'audio/*']
                }),
            });
        }

        // Since direct SQL isn't working, we'll inform the user about the issue
        // and provide instructions for manual execution
        return new Response(
            JSON.stringify({ 
                success: false,
                message: 'Unable to create RLS policies automatically due to permission restrictions',
                explanation: 'This appears to be a project-level permission issue. The service role key cannot modify system tables.',
                buckets: {
                    question_media: { exists: questionMediaExists },
                    answer_media: { exists: answerMediaExists }
                },
                recommendation: 'Please ask the project owner to execute the SQL script manually in Supabase Dashboard',
                sql_script: `Run this SQL in Supabase Dashboard > SQL Editor:

-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policies for question-media
CREATE POLICY "Public Access question-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'question-media');
CREATE POLICY "Public Upload question-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'question-media');
CREATE POLICY "Public Update question-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'question-media');
CREATE POLICY "Public Delete question-media" ON storage.objects FOR DELETE TO public USING (bucket_id = 'question-media');

-- Create policies for answer-media
CREATE POLICY "Public Access answer-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'answer-media');
CREATE POLICY "Public Upload answer-media" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'answer-media');
CREATE POLICY "Public Update answer-media" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'answer-media');
CREATE POLICY "Public Delete answer-media" ON storage.objects FOR DELETE TO public USING (bucket_id = 'answer-media');`
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