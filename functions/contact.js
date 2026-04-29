export async function onRequestPost(context) {
  const { request } = context;
  const env = context.env;

  if (!env) {
    return new Response(JSON.stringify({ error: 'Missing environment variables.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    let body;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    const nombre = typeof body?.nombre === 'string' ? body.nombre : '';
    const email = typeof body?.email === 'string' ? body.email : '';
    const telefono = typeof body?.telefono === 'string' ? body.telefono : '';
    const servicio = typeof body?.servicio === 'string' ? body.servicio : '';
    const mensaje = typeof body?.mensaje === 'string' ? body.mensaje : '';

    const clientId = env.ZOHO_CLIENT_ID;
    const clientSecret = env.ZOHO_CLIENT_SECRET;
    const refreshToken = env.ZOHO_REFRESH_TOKEN;

    const fromAddress = env.ZOHO_FROM_EMAIL || 'hola@tecnik.studio';
    const toAddress = 'hola@tecnik.studio';
    const subject = 'Alguien quiere más información';

    const tokenUrl = 'https://accounts.zoho.eu/oauth/v2/token';
    const tokenForm = new URLSearchParams();
    tokenForm.set('grant_type', 'refresh_token');
    tokenForm.set('client_id', clientId);
    tokenForm.set('client_secret', clientSecret);
    tokenForm.set('refresh_token', refreshToken);

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenForm.toString()
    });

    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenJson || typeof tokenJson.access_token !== 'string') {
      const msg = tokenJson && typeof tokenJson.error === 'string' ? tokenJson.error : 'Zoho token error';
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const accessToken = tokenJson.access_token;

    const accountsUrl = 'https://mail.zoho.eu/api/accounts';
    const accountsRes = await fetch(accountsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });

    const accountsJson = await accountsRes.json().catch(() => null);
    if (!accountsRes.ok || !accountsJson) {
      const msg =
        accountsJson && typeof accountsJson.error === 'string'
          ? accountsJson.error
          : 'Zoho accounts error';
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const accountId =
      (Array.isArray(accountsJson?.accounts) && accountsJson.accounts[0] && accountsJson.accounts[0].accountId) ||
      (typeof accountsJson?.accountId === 'string' && accountsJson.accountId) ||
      (Array.isArray(accountsJson) && accountsJson[0] && accountsJson[0].accountId);

    if (typeof accountId !== 'string' || !accountId) {
      return new Response(JSON.stringify({ error: 'Zoho accountId not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const mailUrl = `https://mail.zoho.eu/api/accounts/${accountId}/messages`;
    const content =
      `Nombre: ${nombre}\n` +
      `Email: ${email}\n` +
      `Teléfono: ${telefono}\n` +
      `Servicio: ${servicio}\n` +
      `Mensaje: ${mensaje}`;

    const messagePayload = {
      fromAddress,
      toAddress,
      subject,
      content
    };

    const mailRes = await fetch(mailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Zoho-oauthtoken ${accessToken}`
      },
      body: JSON.stringify(messagePayload)
    });

    const mailJson = await mailRes.json().catch(() => null);
    if (!mailRes.ok) {
      const msg =
        mailJson && typeof mailJson.error === 'string'
          ? mailJson.error
          : 'Zoho send message error';
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequest(context) {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

