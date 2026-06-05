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
    const { gameId } = await req.json();
    
    if (!gameId) {
      return new Response(JSON.stringify({ 
        error: 'gameId is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    console.log(`Starting comprehensive game deletion for game: ${gameId}`);

    // 1. Получаем все связанные данные
    console.log('Fetching related data...');
    
    // Получаем все вопросы этой игры
    const questionsResponse = await fetch(`${supabaseUrl}/rest/v1/questions?game_id=eq.${gameId}&select=id,media_url`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      }
    });
    const questions = await questionsResponse.json();
    console.log(`Found ${questions.length} questions`);

    // Получаем все команды этой игры
    const teamsResponse = await fetch(`${supabaseUrl}/rest/v1/teams?game_id=eq.${gameId}&select=id,avatar_url`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      }
    });
    const teams = await teamsResponse.json();
    console.log(`Found ${teams.length} teams`);

    // Получаем team IDs для поиска ответов
    const teamIds = teams.map(team => team.id);
    console.log('Team IDs:', teamIds);

    // Получаем все ответы этих команд
    let answers = [];
    if (teamIds.length > 0) {
      const answersResponse = await fetch(`${supabaseUrl}/rest/v1/answers?team_id=in.(${teamIds.join(',')})&select=id,media_urls`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        }
      });
      answers = await answersResponse.json();
    }
    console.log(`Found ${answers.length} answers`);

    const parsePublicUrl = (url: string) => {
      const marker = '/storage/v1/object/public/';
      const idx = url.indexOf(marker);
      if (idx === -1) return null;
      const rest = url.slice(idx + marker.length);
      const slash = rest.indexOf('/');
      if (slash <= 0) return null;
      return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
    };

    const GAME_BUCKETS = ['answer-media', 'avatars', 'question-media'];
    const pathsByBucket = new Map<string, Set<string>>();

    const addPath = (bucket: string, path: string) => {
      if (!pathsByBucket.has(bucket)) pathsByBucket.set(bucket, new Set());
      pathsByBucket.get(bucket)!.add(path);
    };

    for (const q of questions) {
      if (q.media_url) {
        const p = parsePublicUrl(q.media_url);
        if (p) addPath(p.bucket, p.path);
      }
    }
    for (const team of teams) {
      if (team.avatar_url) {
        const p = parsePublicUrl(team.avatar_url);
        if (p) addPath(p.bucket, p.path);
      }
    }
    for (const answer of answers) {
      const urls = answer.media_urls;
      if (Array.isArray(urls)) {
        for (const u of urls) {
          if (typeof u === 'string') {
            const p = parsePublicUrl(u);
            if (p) addPath(p.bucket, p.path);
          }
        }
      }
    }

    // IMP-ST-003: всё под префиксом gameId/
    for (const bucket of GAME_BUCKETS) {
      const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: `${gameId}/`, limit: 1000, offset: 0 }),
      });
      if (listRes.ok) {
        const listed = await listRes.json();
        if (Array.isArray(listed)) {
          for (const item of listed) {
            if (item?.name) addPath(bucket, `${gameId}/${item.name}`);
          }
        }
      }
    }

    const mediaFilesToDelete: { bucket: string; path: string }[] = [];
    for (const [bucket, paths] of pathsByBucket.entries()) {
      for (const path of paths) {
        mediaFilesToDelete.push({ bucket, path });
      }
    }

    console.log(`Need to delete ${mediaFilesToDelete.length} media files`);

    await Promise.all(mediaFilesToDelete.map(async (file) => {
      try {
        const deleteResponse = await fetch(`${supabaseUrl}/storage/v1/object/${file.bucket}/${file.path}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey
          }
        });
        if (!deleteResponse.ok) {
          console.error(`Failed to delete ${file.bucket}/${file.path}`, await deleteResponse.text());
        }
      } catch (error) {
        console.error(`Error deleting ${file.bucket}/${file.path}`, error);
      }
    }));

    // 3. Удаляем данные в правильном порядке (избегаем foreign key conflicts)
    console.log('Deleting related data...');
    
    // Удаляем ответы
    if (teamIds.length > 0) {
      const deleteAnswersResponse = await fetch(`${supabaseUrl}/rest/v1/answers?team_id=in.(${teamIds.join(',')})`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        }
      });
      
      if (deleteAnswersResponse.ok) {
        console.log(`Deleted ${answers.length} answers`);
      } else {
        console.error('Failed to delete answers', await deleteAnswersResponse.text());
      }
    }

    // Удаляем команды
    const deleteTeamsResponse = await fetch(`${supabaseUrl}/rest/v1/teams?game_id=eq.${gameId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      }
    });
    
    if (deleteTeamsResponse.ok) {
      console.log(`Deleted ${teams.length} teams`);
    } else {
      console.error('Failed to delete teams', await deleteTeamsResponse.text());
    }

    // Удаляем вопросы
    const deleteQuestionsResponse = await fetch(`${supabaseUrl}/rest/v1/questions?game_id=eq.${gameId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      }
    });
    
    if (deleteQuestionsResponse.ok) {
      console.log(`Deleted ${questions.length} questions`);
    } else {
      console.error('Failed to delete questions', await deleteQuestionsResponse.text());
    }

    // Удаляем саму игру в последнюю очередь
    console.log('Deleting game...');
    const deleteGameResponse = await fetch(`${supabaseUrl}/rest/v1/games?id=eq.${gameId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      }
    });

    if (!deleteGameResponse.ok) {
      const errorText = await deleteGameResponse.text();
      console.error('Failed to delete game:', errorText);
      return new Response(JSON.stringify({
        error: 'Failed to delete game',
        details: errorText
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Game deletion completed successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Game and all related data deleted successfully',
      deleted: {
        game: 1,
        questions: questions.length,
        teams: teams.length,
        answers: answers.length,
        mediaFiles: mediaFilesToDelete.length
      },
      mediaFiles: mediaFilesToDelete.map(f => `${f.bucket}/${f.path}`)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in deleteGame function:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});