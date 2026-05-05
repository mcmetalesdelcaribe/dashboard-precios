const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const CONNECTION = process.env.STORAGE_CONNECTION;
const TABLE = 'preciositio';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
};

app.http('precio-publicado', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return { status: 204, headers: CORS_HEADERS, body: '' };
        }
        try {
            const client = TableClient.fromConnectionString(CONNECTION, TABLE);
            const e = await client.getEntity('precio', 'publicado');
            return {
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    precios: {
                        puro:        e.puro,
                        monedas22K:  e.monedas22K,
                        italiano18K: e.italiano18K,
                        nacional18K: e.nacional18K,
                        blanco18K:   e.blanco18K,
                        kilate14K:   e.kilate14K,
                        tubular:     e.tubular,
                        kilate10K:   e.kilate10K,
                    },
                    ley:         e.ley,
                    timestamp:   e.publicadoEn || e.timestamp,
                    publicadoEn: e.publicadoEn
                })
            };
        } catch (e) {
            return {
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ precios: null })
            };
        }
    }
});
