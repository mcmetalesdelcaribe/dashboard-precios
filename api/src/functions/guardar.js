const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { EmailClient } = require('@azure/communication-email');
const crypto = require('crypto');

const CONNECTION = process.env.STORAGE_CONNECTION;
const TABLE = 'historialprecios';

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

async function enviarEmail(destinatarios, asunto, cuerpoHtml, cuerpoTexto) {
    const connStr = process.env.ACS_CONNECTION_STRING;
    const remitente = process.env.ACS_SENDER_ADDRESS;
    if (!connStr || !remitente || !destinatarios) return;

    const emails = destinatarios.split(',')
        .map(e => e.trim())
        .filter(e => e.includes('@'))
        .map(e => ({ address: e }));
    if (emails.length === 0) return;

    const client = new EmailClient(connStr);
    const message = {
        senderAddress: remitente,
        content: { subject: asunto, plainText: cuerpoTexto, html: cuerpoHtml },
        recipients: { to: emails }
    };
    // Iniciar envío sin bloquear (fire-and-forget el poller)
    client.beginSend(message).catch(() => {});
}

async function verificarAlertas(onza, dolar, context) {
    try {
        const cfgClient = TableClient.fromConnectionString(CONNECTION, 'configuracion');
        let config;
        try {
            config = await cfgClient.getEntity('alertas', 'config');
        } catch (e) { return; }

        if (!config.activo || !config.destinatarios) return;

        // Anti-spam: mínimo 30 min entre alertas
        if (config.ultimaAlerta) {
            const diff = Date.now() - new Date(config.ultimaAlerta).getTime();
            if (diff < 30 * 60 * 1000) return;
        }

        let motivo = null;
        const umbralAlto = parseFloat(config.umbralAlto);
        const umbralBajo = parseFloat(config.umbralBajo);
        const cambioMaxHora = parseFloat(config.cambioMaxHora);

        if (umbralAlto && onza > umbralAlto) {
            motivo = `⬆️ La onza superó el umbral alto: $${onza.toFixed(2)} USD (máx configurado: $${umbralAlto})`;
        } else if (umbralBajo && onza < umbralBajo) {
            motivo = `⬇️ La onza bajó del mínimo: $${onza.toFixed(2)} USD (mín configurado: $${umbralBajo})`;
        } else if (cambioMaxHora) {
            const ahora = new Date();
            const unaHoraAtras = new Date(ahora.getTime() - 60 * 60 * 1000);
            const fechaHoy = ahora.toISOString().slice(0, 10);
            const fechaAyer = unaHoraAtras.toISOString().slice(0, 10);
            const partitions = [fechaHoy];
            if (fechaAyer !== fechaHoy) partitions.push(fechaAyer);

            const histClient = TableClient.fromConnectionString(CONNECTION, TABLE);
            const precios = [];
            for (const pk of partitions) {
                for await (const ent of histClient.listEntities({ queryOptions: { filter: `PartitionKey eq '${pk}'` } })) {
                    if (new Date(ent.timestamp) >= unaHoraAtras) {
                        precios.push(parseFloat(ent.onza));
                    }
                }
            }
            if (precios.length > 1) {
                const cambio = Math.max(...precios) - Math.min(...precios);
                if (cambio > cambioMaxHora) {
                    motivo = `⚡ Cambio brusco: $${cambio.toFixed(2)} USD en la última hora (límite: $${cambioMaxHora})`;
                }
            }
        }

        if (!motivo) return;

        const hora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
        const intl = Math.round((onza * dolar) / 31.1035);
        const fmtCOP = n => Math.round(n).toLocaleString('es-CO');

        const asunto = `Alerta de precio — MC Metales del Caribe`;
        const cuerpoTexto = [
            'MC Metales del Caribe — Alerta de Precio',
            '',
            motivo,
            '',
            `Onza: $${onza.toFixed(2)} USD`,
            `Dólar: $${fmtCOP(dolar)} COP`,
            `Internacional: $${fmtCOP(intl)} COP/g`,
            hora
        ].join('\n');

        const cuerpoHtml = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;margin:0;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#1a1a1a;padding:20px 24px;">
      <h2 style="color:#FFD700;margin:0;font-size:18px;">MC Metales del Caribe</h2>
      <p style="color:#aaa;margin:4px 0 0;font-size:12px;">Alerta de precio — ${hora}</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;font-weight:bold;color:#1a1a1a;margin:0 0 20px;">${motivo}</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 12px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#888;text-transform:uppercase;">Onza Troy (USD)</td>
          <td style="padding:10px 12px;background:#f9f9f9;border-radius:6px;font-size:18px;font-weight:bold;color:#1a1a1a;text-align:right;">$${onza.toFixed(2)}</td>
        </tr>
        <tr><td colspan="2" style="height:6px;"></td></tr>
        <tr>
          <td style="padding:10px 12px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#888;text-transform:uppercase;">Dólar Compra (COP)</td>
          <td style="padding:10px 12px;background:#f9f9f9;border-radius:6px;font-size:18px;font-weight:bold;color:#1a1a1a;text-align:right;">$${fmtCOP(dolar)}</td>
        </tr>
        <tr><td colspan="2" style="height:6px;"></td></tr>
        <tr>
          <td style="padding:10px 12px;background:#fffbe6;border-radius:6px;font-size:12px;color:#888;text-transform:uppercase;">Internacional (COP/g)</td>
          <td style="padding:10px 12px;background:#fffbe6;border-radius:6px;font-size:18px;font-weight:bold;color:#1a1a1a;text-align:right;">$${fmtCOP(intl)}</td>
        </tr>
      </table>
    </div>
    <div style="padding:12px 24px;background:#f5f5f5;font-size:11px;color:#aaa;text-align:center;">
      Este mensaje fue enviado automáticamente por el Dashboard de Precios de MC Metales del Caribe.
    </div>
  </div>
</body>
</html>`;

        await enviarEmail(config.destinatarios, asunto, cuerpoHtml, cuerpoTexto);

        await cfgClient.updateEntity({
            partitionKey: 'alertas', rowKey: 'config',
            ...config, ultimaAlerta: new Date().toISOString()
        }, 'Merge');

    } catch (e) {
        context.log('Error en verificarAlertas:', e.message);
    }
}

app.http('guardar', {
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
            const { onza, dolar } = body;
            if (!onza || !dolar) throw new Error('Faltan datos');

            const client = TableClient.fromConnectionString(CONNECTION, TABLE);
            await client.createTable();

            // Evitar duplicados: omitir si ya existe un registro en los últimos 30 min
            const ahora = new Date();
            const treintaAtras = new Date(ahora.getTime() - 30 * 60 * 1000);
            const rowKeyMin = treintaAtras.toISOString().replace(/[:.]/g, '-');
            const partHoy = ahora.toISOString().slice(0, 10);
            const partAyer = treintaAtras.toISOString().slice(0, 10);

            let yaExiste = false;
            for (const pk of [...new Set([partAyer, partHoy])]) {
                const filter = `PartitionKey eq '${pk}' and RowKey ge '${rowKeyMin}'`;
                for await (const _ of client.listEntities({ queryOptions: { filter }, select: ['rowKey'] })) {
                    yaExiste = true;
                    break;
                }
                if (yaExiste) break;
            }
            if (yaExiste) {
                return { status: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, omitido: true }) };
            }

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

            verificarAlertas(parseFloat(onza), parseFloat(dolar), context);

            return {
                status: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ ok: true, guardado: rowKey })
            };
        } catch (e) {
            return { status: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: e.message }) };
        }
    }
});
