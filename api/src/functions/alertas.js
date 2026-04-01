const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const crypto = require('crypto');

const CONNECTION = process.env.STORAGE_CONNECTION;
const TABLE = 'configuracion';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

function validarToken(request) {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace('Bearer ', '').trim();
    const esperado = crypto.createHmac('sha256', process.env.JWT_SECRET || 'mcm-secret-2024')
        .update(process.env.DASHBOARD_PASSWORD || 'mcmetales')
        .digest('hex');
    return token === esperado;
}

app.http('alertas', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request) => {
        if (request.method === 'OPTIONS') {
            return { status: 204, headers: CORS, body: '' };
        }
        if (!validarToken(request)) {
            return { status: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };
        }

        const client = TableClient.fromConnectionString(CONNECTION, TABLE);
        await client.createTable();

        if (request.method === 'GET') {
            try {
                const config = await client.getEntity('alertas', 'config');
                return {
                    status: 200, headers: CORS, body: JSON.stringify({
                        destinatarios: config.destinatarios || '',
                        umbralAlto: config.umbralAlto || '',
                        umbralBajo: config.umbralBajo || '',
                        cambioMaxHora: config.cambioMaxHora || '',
                        activo: config.activo === true,
                        ultimaAlerta: config.ultimaAlerta || null
                    })
                };
            } catch (e) {
                return {
                    status: 200, headers: CORS, body: JSON.stringify({
                        destinatarios: '', umbralAlto: '', umbralBajo: '', cambioMaxHora: '', activo: false, ultimaAlerta: null
                    })
                };
            }
        }

        if (request.method === 'POST') {
            const body = await request.json();
            await client.upsertEntity({
                partitionKey: 'alertas',
                rowKey: 'config',
                destinatarios: body.destinatarios || '',
                umbralAlto: parseFloat(body.umbralAlto) || 0,
                umbralBajo: parseFloat(body.umbralBajo) || 0,
                cambioMaxHora: parseFloat(body.cambioMaxHora) || 0,
                activo: body.activo === true
            }, 'Replace');
            return { status: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
        }
    }
});
