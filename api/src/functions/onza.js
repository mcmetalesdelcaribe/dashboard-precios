const { app } = require('@azure/functions');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

app.http('onza', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
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

            return {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ bid, fuente: 'kitco.com', timestamp: new Date().toISOString() })
            };
        } catch (e) {
            return { status: 500, body: JSON.stringify({ error: e.message }) };
        }
    }
});