const { app } = require('@azure/functions');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

app.http('dolar', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const res = await fetch('https://pbit.bancodebogota.com/Indicadores/DolarMinutoInfo.aspx', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            const html = await res.text();
            const $ = cheerio.load(html);
            
            let compra = null;
            let hora = null;

            $('tr').each((i, row) => {
                if (compra) return;
                const cols = $(row).find('td');
                if (cols.length >= 3) {
                    const horaText = $(cols[0]).text().trim();
                    const compraText = $(cols[1]).text().trim().replace(',', '.');
                    if (/^\d{2}:\d{2}$/.test(horaText) && !isNaN(parseFloat(compraText))) {
                        hora = horaText;
                        compra = parseFloat(compraText);
                    }
                }
            });

            if (!compra) throw new Error('No se pudo leer el precio');

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ compra, hora, fuente: 'Banco de Bogotá', timestamp: new Date().toISOString() })
            };
        } catch (e) {
            return { status: 500, body: JSON.stringify({ error: e.message }) };
        }
    }
});
``
