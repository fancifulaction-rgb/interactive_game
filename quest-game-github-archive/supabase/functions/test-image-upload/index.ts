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
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        
        if (!supabaseServiceRoleKey || !supabaseUrl) {
            throw new Error('Missing Supabase credentials');
        }

        // Create a small 1x1 PNG image (base64 encoded)
        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        
        // Convert base64 to bytes
        const binaryString = atob(pngBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const fileName = `test-image-${Date.now()}.png`;

        const uploadTests = [];

        // Test 1: Upload to question-media with anon key
        try {
            const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/question-media/${fileName}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'apikey': supabaseAnonKey,
                    'Content-Type': 'image/png',
                },
                body: bytes
            });
            
            uploadTests.push({
                test: 'Upload to question-media (anon)',
                status: uploadResponse.ok ? 'success' : 'failed',
                status_code: uploadResponse.status,
                message: uploadResponse.ok ? 'Image uploaded successfully' : await uploadResponse.text()
            });
            
            if (uploadResponse.ok) {
                // Get public URL
                const publicUrlResponse = await fetch(`${supabaseUrl}/storage/v1/object/public/question-media/${fileName}`);
                if (publicUrlResponse.ok) {
                    const publicUrl = await publicUrlResponse.text();
                    uploadTests[uploadTests.length - 1].public_url = publicUrl;
                }
            }
        } catch (error) {
            uploadTests.push({
                test: 'Upload to question-media (anon)',
                status: 'error',
                message: error.message
            });
        }

        // Test 2: Upload to answer-media with anon key
        try {
            const uploadResponse2 = await fetch(`${supabaseUrl}/storage/v1/object/answer-media/${fileName}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'apikey': supabaseAnonKey,
                    'Content-Type': 'image/png',
                },
                body: bytes
            });
            
            uploadTests.push({
                test: 'Upload to answer-media (anon)',
                status: uploadResponse2.ok ? 'success' : 'failed',
                status_code: uploadResponse2.status,
                message: uploadResponse2.ok ? 'Image uploaded successfully' : await uploadResponse2.text()
            });
            
            if (uploadResponse2.ok) {
                // Get public URL
                const publicUrlResponse = await fetch(`${supabaseUrl}/storage/v1/object/public/answer-media/${fileName}`);
                if (publicUrlResponse.ok) {
                    const publicUrl = await publicUrlResponse.text();
                    uploadTests[uploadTests.length - 1].public_url = publicUrl;
                }
            }
        } catch (error) {
            uploadTests.push({
                test: 'Upload to answer-media (anon)',
                status: 'error',
                message: error.message
            });
        }

        // Summary
        const successfulUploads = uploadTests.filter(t => t.status === 'success').length;
        const totalTests = uploadTests.length;
        
        return new Response(
            JSON.stringify({ 
                success: true,
                message: `Image upload test completed: ${successfulUploads}/${totalTests} tests successful`,
                upload_tests: uploadTests,
                summary: {
                    total: totalTests,
                    successful: successfulUploads,
                    failed: totalTests - successfulUploads
                },
                recommendation: successfulUploads === totalTests ? 
                    '✅ All image uploads work! You can now test file upload in your game.' :
                    '⚠️ Some uploads failed. Check the error messages above.'
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