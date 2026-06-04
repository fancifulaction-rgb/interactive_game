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
      const answersResponse = await fetch(`${supabaseUrl}/rest/v1/answers?team_id=in.(${teamIds.join(',')})&select=id,media_url`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        }
      });
      answers = await answersResponse.json();
    }
    console.log(`Found ${answers.length} answers`);

    // 2. Удаляем медиа файлы из Storage
    console.log('Deleting media files from storage...');
    const mediaFilesToDelete = [];
    
    // Добавляем медиа из вопросов
    questions.forEach(q => {
      if (q.media_url) {
        const urlParts = q.media_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        mediaFilesToDelete.push({
          bucket: 'question-media',
          fileName: fileName
        });
      }
    });

    // Добавляем аватары команд
    teams.forEach(team => {
      if (team.avatar_url) {
        const urlParts = team.avatar_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        mediaFilesToDelete.push({
          bucket: 'answer-media', // Аватары хранятся в answer-media bucket
          fileName: fileName
        });
      }
    });

    // Добавляем медиа из ответов
    answers.forEach(answer => {
      if (answer.media_url) {
        const urlParts = answer.media_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        mediaFilesToDelete.push({
          bucket: 'answer-media',
          fileName: fileName
        });
      }
    });

    console.log(`Need to delete ${mediaFilesToDelete.length} media files`);
    
    // Удаляем медиа файлы
    const mediaDeletionPromises = mediaFilesToDelete.map(async (file) => {
      try {
        const deleteResponse = await fetch(`${supabaseUrl}/storage/v1/object/${file.bucket}/${file.fileName}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey
          }
        });
        
        if (deleteResponse.ok) {
          console.log(`Deleted media file: ${file.bucket}/${file.fileName}`);
          return { success: true, file: `${file.bucket}/${file.fileName}` };
        } else {
          console.error(`Failed to delete media file: ${file.bucket}/${file.fileName}`, await deleteResponse.text());
          return { success: false, file: `${file.bucket}/${file.fileName}` };
        }
      } catch (error) {
        console.error(`Error deleting media file: ${file.bucket}/${file.fileName}`, error);
        return { success: false, file: `${file.bucket}/${file.fileName}`, error: error.message };
      }
    });

    await Promise.all(mediaDeletionPromises);

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
      mediaFiles: mediaFilesToDelete.map(f => `${f.bucket}/${f.fileName}`)
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