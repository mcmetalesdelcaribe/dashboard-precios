const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const CONNECTION = process.env.STORAGE_CONNECTION;

async function fetchOnza() {
    const res = await fetch('https://www.kitco.com/charts/gold', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    let bid = null;
    $('*').each((i, el) => {
        const text = $(el).text().trim();
        const m = text.match(/^([\d,]+\.\d{2})$/);
        if (m && !bid) {
            const val = parseFloat(m[1].replace(',', ''));
            if (val > 2000 && val < 10000) bid = val;
        }
    });
    if (!bid) throw new Error('No se pudo leer el precio de Kitco');
    return bid;
}

async function fetchDolar() {
    const res = await fetch('https://pbit.bancodebogota.com/Indicadores/DolarMinutoInfo.aspx', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    let compra = null;
    $('tr').each((i, row) => {
        if (compra) return;
        const cols = $(row).find('td');
        if (cols.length >= 3) {
            const horaText = $(cols[0]).text().trim();
            const compraText = $(cols[1]).text().trim().replace(',', '.');
            if (/^\d{2}:\d{2}$/.test(horaText) && !isNaN(parseFloat(compraText))) {
                compra = parseFloat(compraText);
            }
        }
    });
    if (!compra) throw new Error('No se pudo leer el precio del dólar');
    return compra;
}

async function saveToTable(tableName, onza, dolar, dedupSeconds) {
    const client = TableClient.fromConnectionString(CONNECTION, tableName);
    await client.createTable();

    const ahora = new Date();
    const cutoff = new Date(ahora.getTime() - dedupSeconds * 1000);
    const rowKeyMin = cutoff.toISOString().replace(/[:.]/g, '-');
    const partHoy = ahora.toISOString().slice(0, 10);
    const partAntes = cutoff.toISOString().slice(0, 10);

    let yaExiste = false;
    for (const pk of [...new Set([partAntes, partHoy])]) {
        const filter = `PartitionKey eq '${pk}' and RowKey ge '${rowKeyMin}'`;
        for await (const _ of client.listEntities({ queryOptions: { filter }, select: ['rowKey'] })) {
            yaExiste = true; break;
        }
        if (yaExiste) break;
    }
    if (yaExiste) return false;

    const rowKey = ahora.toISOString().replace(/[:.]/g, '-');
    await client.createEntity({
        partitionKey: partHoy,
        rowKey,
        onza: parseFloat(onza),
        dolar: parseFloat(dolar),
        timestamp: ahora.toISOString(),
        hora: ahora.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' }),
        fecha: ahora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    });
    return true;
}

// ── Timer cada 30 minutos → historialprecios ──────────────────────────────────
app.timer('guardartimer30min', {
    schedule: '0 0,30 * * * *',
    handler: async (myTimer, context) => {
        try {
            const [onza, dolar] = await Promise.all([fetchOnza(), fetchDolar()]);
            const saved = await saveToTable('historialprecios', onza, dolar, 25 * 60);
            context.log(`guardartimer30min OK: onza=${onza} dolar=${dolar} guardado=${saved}`);
        } catch (e) {
            context.log('guardartimer30min error:', e.message);
        }
    }
});

// ── Timer cada 1 minuto → historialminutos (+ limpieza 48h) ───────────────────
app.timer('guardartimer1min', {
    schedule: '0 * * * * *',
    handler: async (myTimer, context) => {
        try {
            const [onza, dolar] = await Promise.all([fetchOnza(), fetchDolar()]);
            const saved = await saveToTable('historialminutos', onza, dolar, 50);

            if (saved) {
                // Limpiar registros de más de 48 horas (hasta 200 por ciclo)
                const client = TableClient.fromConnectionString(CONNECTION, 'historialminutos');
                const cutoffPK = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
                let n = 0;
                for await (const e of client.listEntities({
                    queryOptions: { filter: `PartitionKey lt '${cutoffPK}'`, select: ['partitionKey', 'rowKey'] }
                })) {
                    if (n >= 200) break;
                    await client.deleteEntity(e.partitionKey, e.rowKey).catch(() => {});
                    n++;
                }
            }
            context.log(`guardartimer1min OK: onza=${onza} dolar=${dolar} guardado=${saved}`);
        } catch (e) {
            context.log('guardartimer1min error:', e.message);
        }
    }
});
