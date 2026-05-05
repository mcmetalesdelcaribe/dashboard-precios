const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const crypto = require('crypto');

const CONNECTION = process.env.STORAGE_CONNECTION;
const TABLE = 'preciositio';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

app.http('publicar-sitio', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return { status: 204, headers: CORS_HEADERS, body: '' };
        }
        if (!validarToken(request)) {
            return { status: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No autorizado' }) };
        }
        try {
            const body = await request.json();
            const { precios, ley, onza, dolar } = body;
            if (!precios || typeof precios !== 'object') throw new Error('Faltan datos de precios');

            const ahora = new Date();
            const client = TableClient.fromConnectionString(CONNECTION, TABLE);
            await client.createTable().catch(() => {});

            // Upsert con clave fija — sobreescribe siempre el último precio publicado
            await client.upsertEntity({
                partitionKey: 'precio',
                rowKey: 'publicado',
                // Precios por kilate (ya redondeados al 500 más cercano)
                puro:        precios.puro        ?? 0,
                monedas22K:  precios.monedas22K  ?? 0,
                italiano18K: precios.italiano18K ?? 0,
                nacional18K: precios.nacional18K ?? 0,
                blanco18K:   precios.blanco18K   ?? 0,
                kilate14K:   precios.kilate14K   ?? 0,
                tubular:     precios.tubular     ?? 0,
                kilate10K:   precios.kilate10K   ?? 0,
                // Metadata
                ley:         ley    ?? '',
                onza:        onza   ?? 0,
                dolar:       dolar  ?? 0,
                timestamp:   ahora.toISOString(),
                publicadoEn: ahora.toLocaleString('es-CO', { timeZone: 'America/Bogota' })
            }, 'Replace');

            context.log(`Precios publicados al sitio: ley=${ley}, puro=${precios.puro}`);

            return {
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ ok: true, timestamp: ahora.toISOString() })
            };
        } catch (e) {
            context.log('Error en publicar-sitio:', e.message);
            return { status: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: e.message }) };
        }
    }
});
