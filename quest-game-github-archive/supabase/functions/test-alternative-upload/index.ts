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
        
        // Create a small 1x1 PNG image (base64)
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        
        // Convert base64 to bytes
        const binaryString = atob(pngBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const testData = {
            file: Array.from(bytes), // Convert Uint8Array to regular array for JSON
            bucket: 'question-media',
            fileName: `test-alt-upload-${Date.now()}.png`
        };

        // Call alternative upload function
        const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/alternative-upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                'Content-Type': 'application/json',
                'apikey': supabaseServiceRoleKey,
            },
            body: JSON.stringify(testData)
        });

        const result = await uploadResponse.json();

        return new Response(
            JSON.stringify({ 
                success: true,
                message: 'Alternative upload test completed',
                upload_result: result,
                test_data: {
                    file_size: bytes.length,
                    bucket: testData.bucket,
                    fileName: testData.fileName
                }
            }), 
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({
                error: {
                    code: 'TEST_ERROR',
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