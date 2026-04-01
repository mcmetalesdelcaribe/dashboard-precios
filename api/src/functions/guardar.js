const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const CONNECTION = process.env.STORAGE_CONNECTION;
const TABLE = 'historialprecios';

app.http('guardar', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { onza, dolar } = body;
            if (!onza || !dolar) throw new Error('Faltan datos');

            const client = TableClient.fromConnectionString(CONNECTION, TABLE);
            await client.createTable();

            const ahora = new Date();
            const rowKey = ahora.toISOString().replace(/[:.]/g, '-');
            const partitionKey = ahora.toISOString().slice(0, 10);

            await client.createEntity({
                partitionKey,
                rowKey,
                onza: parseFloat(onza),
                dolar: parseFloat(dolar),
                timestamp: ahora.toISOString(),
                hora: ahora.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' }),
                fecha: ahora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
            });

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ ok: true, guardado: rowKey })
            };
        } catch (e) {
            return { status: 500, body: JSON.stringify({ error: e.message }) };
        }
    }
});