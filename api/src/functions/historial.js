const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const crypto = require('crypto');

const CONNECTION = process.env.STORAGE_CONNECTION;
const TABLE = 'historialprecios';

const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function validarToken(request) {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace('Bearer ', '').trim();
    const esperado = crypto.createHmac('sha256', process.env.JWT_SECRET || 'mcm-secret-2024')
        .update(process.env.DASHBOARD_PASSWORD || 'mcmetales')
        .digest('hex');
    return token === esperado;
}

app.http('historialminutos', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return { status: 204, headers: CORS, body: '' };
        }
        if (!validarToken(request)) {
            return { status: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };
        }
        try {
            const TABLE_MIN = 'historialminutos';
            const client = TableClient.fromConnectionString(CONNECTION, TABLE_MIN);
            await client.createTable();

            // Consultar las últimas 48h (rangos de particiones posibles)
            const ahora = new Date();
            const desde = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
            const particiones = [...new Set([
                desde.toISOString().slice(0, 10),
                new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                ahora.toISOString().slice(0, 10)
            ])];

            const registros = [];
            for (const pk of particiones) {
                for await (const e of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${pk}'` } })) {
                    if (new Date(e.timestamp) >= desde) {
                        registros.push({ onza: e.onza, dolar: e.dolar, timestamp: e.timestamp });
                    }
                }
            }

            // Ordenar ascendente, retornar últimos 120 registros (2 horas de minutos)
            registros.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            return {
                status: 200,
                headers: CORS,
                body: JSON.stringify({ registros: registros.slice(-120) })
            };
        } catch (e) {
            return { status: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
        }
    }
});

app.http('historial', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return { status: 204, headers: CORS, body: '' };
        }
        if (!validarToken(request)) {
            return { status: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };
        }
        try {
            const client = TableClient.fromConnectionString(CONNECTION, TABLE);
            await client.createTable();

            const desde = new Date();
            desde.setFullYear(desde.getFullYear() - 1);

            const registros = [];
            const entidades = client.listEntities();

            for await (const entidad of entidades) {
                const fecha = new Date(entidad.timestamp);
                if (fecha >= desde) {
                    registros.push({
                        fecha: entidad.fecha,
                        hora: entidad.hora,
                        onza: entidad.onza,
                        dolar: entidad.dolar,
                        timestamp: entidad.timestamp
                    });
                }
            }

            registros.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            const ayer = new Date();
            ayer.setDate(ayer.getDate() - 1);
            const ayerFecha = ayer.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
            const precioAyer = registros.find(r => {
                return r.fecha === ayerFecha && r.hora >= '09:00' && r.hora <= '09:30';
            });

            return {
                status: 200,
                headers: CORS,
                body: JSON.stringify({ registros, precioAyer: precioAyer || null })
            };
        } catch (e) {
            return { status: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
        }
    }
});
