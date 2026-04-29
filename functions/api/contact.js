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
    const escapeHtml = (value) =>
      String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

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

    const tokenText = await tokenRes.text().catch(() => '');
    let tokenJson = null;
    try {
      tokenJson = tokenText ? JSON.parse(tokenText) : null;
    } catch {
      tokenJson = null;
    }

    if (!tokenRes.ok || !tokenJson || typeof tokenJson.access_token !== 'string') {
      const msg =
        tokenJson && typeof tokenJson.error === 'string'
          ? tokenJson.error
          : tokenText
            ? tokenText.slice(0, 200)
            : 'Zoho token error';
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const accessToken = tokenJson.access_token;

    const explicitAccountId = typeof env.ZOHO_ACCOUNT_ID === 'string' ? env.ZOHO_ACCOUNT_ID.trim() : '';
    let accountId = '';
    let accountsDataJson = null;

    // Optional override to avoid /api/accounts call (useful when scopes/permissions are limited).
    if (explicitAccountId) {
      accountId = explicitAccountId;
    } else {
      const accountsUrl = 'https://mail.zoho.eu/api/accounts';
      const accountsRes = await fetch(accountsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`
        }
      });

      const accountsText = await accountsRes.text().catch(() => '');
      try {
        accountsDataJson = accountsText ? JSON.parse(accountsText) : null;
      } catch {
        accountsDataJson = null;
      }

      if (!accountsRes.ok || !accountsDataJson) {
        const snippet = accountsText ? accountsText.slice(0, 800) : '';
        const msg = `Zoho accounts error (${accountsRes.status} ${accountsRes.statusText || 'HTTP'}): ${snippet || 'Empty response'}`;
        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Zoho EU real structure:
      // { status: { code: 200 }, data: [ { accountId: '...' } ] }
      accountId = accountsDataJson?.data?.[0]?.accountId || '';

      if (!accountId) {
        // eslint-disable-next-line no-console
        console.log('Zoho /api/accounts body (accountId null):', accountsDataJson);
      }
    }

    if (typeof accountId !== 'string' || !accountId.trim()) {
      return new Response(JSON.stringify({ error: 'Zoho accountId not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const mailUrl = `https://mail.zoho.eu/api/accounts/${accountId}/messages`;
    const safeNombre = escapeHtml(nombre);
    const safeEmail = escapeHtml(email);
    const safeTelefono = escapeHtml(telefono);
    const safeServicio = escapeHtml(servicio);
    const safeMensaje = escapeHtml(mensaje);

    const content = `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#152238; line-height:1.4;">
        <h2 style="margin:0 0 16px; font-size:18px; color:#0f3460;">
          Nuevo mensaje desde la web Tecnik
        </h2>

        <div style="border:1px solid rgba(15,52,96,0.15); border-radius:12px; padding:14px 16px; background:#ffffff;">
          <div style="margin:6px 0;"><strong>Nombre:</strong> ${safeNombre}</div>
          <div style="margin:6px 0;"><strong>Email:</strong> ${safeEmail}</div>
          <div style="margin:6px 0;"><strong>Teléfono:</strong> ${safeTelefono || '-'}</div>
          <div style="margin:6px 0;"><strong>Servicio:</strong> ${safeServicio || '-'}</div>
          <div style="margin:12px 0 6px;"><strong>Mensaje:</strong></div>
          <div style="white-space:pre-wrap; margin-top:6px; padding:12px; background:rgba(67,97,238,0.06); border-radius:10px;">
            ${safeMensaje}
          </div>
        </div>

        <div style="margin-top:14px; font-size:12px; color:rgba(21,34,56,0.7);">
          Enviado automáticamente desde el formulario de contacto.
        </div>
      </div>
    `.trim();

    const messagePayload = {
      fromAddress,
      toAddress,
      subject,
      content,
      mailFormat: 'html'
    };

    const mailRes = await fetch(mailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Zoho-oauthtoken ${accessToken}`
      },
      body: JSON.stringify(messagePayload)
    });

    const mailText = await mailRes.text().catch(() => '');
    let mailJson = null;
    try {
      mailJson = mailText ? JSON.parse(mailText) : null;
    } catch {
      mailJson = null;
    }

    if (!mailRes.ok) {
      const msg =
        mailJson && typeof mailJson.error === 'string'
          ? mailJson.error
          : mailText
            ? mailText.slice(0, 200)
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
  // Fallback for any non-POST request.
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

