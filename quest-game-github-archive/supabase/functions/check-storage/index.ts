Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Получаем информацию о хранилище из Supabase REST API
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const buckets = ['question-media', 'answer-media'];
    const storageInfo = [];
    
    for (const bucketName of buckets) {
      try {
        const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucketName}`, {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey
          }
        });
        
        if (response.ok) {
          const files = await response.json();
          const totalSize = files.reduce((sum: number, file: any) => sum + (file.metadata?.size || 0), 0);
          const fileCount = files.length;
          
          storageInfo.push({
            bucket: bucketName,
            fileCount,
            totalSizeBytes: totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            averageFileSizeMB: fileCount > 0 ? ((totalSize / fileCount) / (1024 * 1024)).toFixed(2) : '0',
            files: files.map((file: any) => ({
              name: file.name,
              sizeBytes: file.metadata?.size || 0,
              sizeMB: ((file.metadata?.size || 0) / (1024 * 1024)).toFixed(2),
              created: file.created_at
            }))
          });
        }
      } catch (error) {
        storageInfo.push({
          bucket: bucketName,
          error: error.message
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      storageInfo,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});