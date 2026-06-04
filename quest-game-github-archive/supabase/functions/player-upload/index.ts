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

        const { file, bucket, fileName, mimeType } = await req.json();
        
        if (!file || !bucket || !fileName) {
            throw new Error('Missing required parameters: file, bucket, fileName');
        }

        // Convert base64 to bytes if needed
        let fileData;
        if (typeof file === 'string') {
            // If file is base64
            const binaryString = atob(file);
            fileData = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                fileData[i] = binaryString.charCodeAt(i);
            }
        } else {
            // If file is already bytes
            fileData = new Uint8Array(file);
        }

        // Determine content type
        let contentType = mimeType || 'application/octet-stream';
        if (!contentType || contentType === 'application/octet-stream') {
            if (fileName.toLowerCase().endsWith('.png')) {
                contentType = 'image/png';
            } else if (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) {
                contentType = 'image/jpeg';
            } else if (fileName.toLowerCase().endsWith('.gif')) {
                contentType = 'image/gif';
            } else if (fileName.toLowerCase().endsWith('.webp')) {
                contentType = 'image/webp';
            } else if (fileName.toLowerCase().endsWith('.mp4')) {
                contentType = 'video/mp4';
            } else if (fileName.toLowerCase().endsWith('.mp3')) {
                contentType = 'audio/mpeg';
            } else if (fileName.toLowerCase().endsWith('.wav')) {
                contentType = 'audio/wav';
            }
        }

        // Upload to storage using service role key (which should have full permissions)
        const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                'apikey': supabaseServiceRoleKey,
                'Content-Type': contentType,
            },
            body: fileData
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        }

        // Generate public URL
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;

        return new Response(
            JSON.stringify({ 
                success: true,
                url: publicUrl,
                fileName: fileName,
                bucket: bucket,
                contentType: contentType
            }), 
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({
                error: {
                    code: 'UPLOAD_ERROR',
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