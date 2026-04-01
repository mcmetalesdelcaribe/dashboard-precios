const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const CONNECTION = process.env.STORAGE_CONNECTION;
const TABLE = 'historialprecios';

app.http('historial', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const client = TableClient.fromConnectionString(CONNECTION, TABLE);
            await client.createTable();

            // Últimos 15 días
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

            // Ordenar de más reciente a más antiguo
            registros.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Precio de ayer a las 9am para comparativa
            const ayer = new Date();
            ayer.setDate(ayer.getDate() - 1);
            const ayerFecha = ayer.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
            const precioAyer = registros.find(r => {
                return r.fecha === ayerFecha && r.hora >= '09:00' && r.hora <= '09:30';
            });

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ registros, precioAyer: precioAyer || null })
            };
        } catch (e) {
            return { status: 500, body: JSON.stringify({ error: e.message }) };
        }
    }
});