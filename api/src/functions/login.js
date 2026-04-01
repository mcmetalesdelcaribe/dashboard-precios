const { app } = require('@azure/functions');
const crypto = require('crypto');

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

function generarToken() {
    return crypto.createHmac('sha256', process.env.JWT_SECRET || 'mcm-secret-2024')
        .update(process.env.DASHBOARD_PASSWORD || 'mcmetales')
        .digest('hex');
}

app.http('login', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request) => {
        if (request.method === 'OPTIONS') {
            return { status: 204, headers: CORS, body: '' };
        }
        try {
            const { password } = await request.json();
            if (!password || password !== (process.env.DASHBOARD_PASSWORD || 'mcmetales')) {
                return { status: 401, headers: CORS, body: JSON.stringify({ error: 'Contraseña incorrecta' }) };
            }
            return { status: 200, headers: CORS, body: JSON.stringify({ token: generarToken() }) };
        } catch (e) {
            return { status: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
        }
    }
});
