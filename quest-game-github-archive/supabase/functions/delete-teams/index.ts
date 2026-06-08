// Edge Function для полного удаления команд из всех связанных таблиц
// Обеспечивает CASCADE удаление данных команды из всей системы

import { handleCors, requireAuthenticatedUser } from '../_shared/adminAuth.ts'

Deno.serve(async (req) => {
    const cors = handleCors(req)
    if (cors) return cors

    const auth = await requireAuthenticatedUser(req)
    if (auth instanceof Response) return auth

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    try {
        const requestData = await req.json();
        const { team_ids, game_id } = requestData;

        if (!team_ids || !Array.isArray(team_ids) || team_ids.length === 0) {
            return new Response(JSON.stringify({ 
                error: { 
                    code: 'INVALID_PARAMETERS', 
                    message: 'team_ids должен быть непустым массивом UUID команд' 
                }
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Подключение к Supabase с Service Role Key
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Отсутствуют переменные окружения Supabase');
        }

        const deleteResults = {
            teams_deleted: 0,
            answers_deleted: 0,
            message_reads_deleted: 0,
            message_recipients_deleted: 0,
            players_deleted: 0,
            errors: []
        };

        // Получаем названия команд для удаления из таблицы players
        let team_names = [];
        try {
            const teamsResponse = await fetch(`${SUPABASE_URL}/rest/v1/teams?id=in.(${team_ids.join(',')})&select=team_name`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (teamsResponse.ok) {
                const teamsData = await teamsResponse.json();
                team_names = teamsData.map(team => team.team_name).filter(name => name);
            }
        } catch (error) {
            deleteResults.errors.push(`Ошибка получения названий команд: ${error.message}`);
        }

        // ШАГИ УДАЛЕНИЯ (в правильном порядке для избежания FK conflicts):

        // 1. Удаляем записи о прочтении сообщений (message_reads)
        try {
            const messageReadsResponse = await fetch(`${SUPABASE_URL}/rest/v1/message_reads?team_id=in.(${team_ids.join(',')})`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (messageReadsResponse.ok) {
                const responseText = await messageReadsResponse.text();
                // Подсчитываем количество удаленных записей из заголовка Content-Range
                const contentRange = messageReadsResponse.headers.get('Content-Range');
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)$/);
                    deleteResults.message_reads_deleted = match ? parseInt(match[1]) : 0;
                }
            } else {
                deleteResults.errors.push(`Ошибка удаления message_reads: ${messageReadsResponse.status}`);
            }
        } catch (error) {
            deleteResults.errors.push(`Ошибка удаления message_reads: ${error.message}`);
        }

        // 2. Удаляем получателей сообщений (message_recipients)
        try {
            const messageRecipientsResponse = await fetch(`${SUPABASE_URL}/rest/v1/message_recipients?team_id=in.(${team_ids.join(',')})`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (messageRecipientsResponse.ok) {
                const contentRange = messageRecipientsResponse.headers.get('Content-Range');
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)$/);
                    deleteResults.message_recipients_deleted = match ? parseInt(match[1]) : 0;
                }
            } else {
                deleteResults.errors.push(`Ошибка удаления message_recipients: ${messageRecipientsResponse.status}`);
            }
        } catch (error) {
            deleteResults.errors.push(`Ошибка удаления message_recipients: ${error.message}`);
        }

        // 3. Удаляем ответы команд (answers)
        try {
            const answersResponse = await fetch(`${SUPABASE_URL}/rest/v1/answers?team_id=in.(${team_ids.join(',')})`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (answersResponse.ok) {
                const contentRange = answersResponse.headers.get('Content-Range');
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)$/);
                    deleteResults.answers_deleted = match ? parseInt(match[1]) : 0;
                }
            } else {
                deleteResults.errors.push(`Ошибка удаления answers: ${answersResponse.status}`);
            }
        } catch (error) {
            deleteResults.errors.push(`Ошибка удаления answers: ${error.message}`);
        }

        // 4. Удаляем записи игроков по названиям команд (players)
        if (team_names.length > 0) {
            try {
                const playersQuery = team_names.map(name => `team_name.eq.${encodeURIComponent(name)}`).join(',');
                const playersResponse = await fetch(`${SUPABASE_URL}/rest/v1/players?or=(${playersQuery})`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'apikey': SUPABASE_SERVICE_ROLE_KEY,
                        'Content-Type': 'application/json'
                    }
                });

                if (playersResponse.ok) {
                    const contentRange = playersResponse.headers.get('Content-Range');
                    if (contentRange) {
                        const match = contentRange.match(/\/(\d+)$/);
                        deleteResults.players_deleted = match ? parseInt(match[1]) : 0;
                    }
                } else {
                    deleteResults.errors.push(`Ошибка удаления players: ${playersResponse.status}`);
                }
            } catch (error) {
                deleteResults.errors.push(`Ошибка удаления players: ${error.message}`);
            }
        }

        // 5. Удаляем сами команды (teams) - основная таблица
        try {
            const teamsResponse = await fetch(`${SUPABASE_URL}/rest/v1/teams?id=in.(${team_ids.join(',')})`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (teamsResponse.ok) {
                const contentRange = teamsResponse.headers.get('Content-Range');
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)$/);
                    deleteResults.teams_deleted = match ? parseInt(match[1]) : 0;
                } else {
                    // Если нет Content-Range, считаем количество переданных ID
                    deleteResults.teams_deleted = team_ids.length;
                }
            } else {
                deleteResults.errors.push(`Ошибка удаления teams: ${teamsResponse.status}`);
            }
        } catch (error) {
            deleteResults.errors.push(`Ошибка удаления teams: ${error.message}`);
        }

        // Возвращаем результат удаления
        const response = {
            success: true,
            message: `Полное удаление команд завершено`,
            data: deleteResults,
            deleted_team_ids: team_ids,
            team_names_processed: team_names
        };

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        const errorResponse = {
            error: {
                code: 'DELETION_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});