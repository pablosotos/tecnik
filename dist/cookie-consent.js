(() => {
  const STORAGE_KEY = 'cookie_consent';
  const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
  const GA4_ID = 'G-3GP9QMD6NF';

  let gaInitialized = false;
  let bannerElement;
  let modalElement;
  let analyticsToggle;
  let consentRequired = false;

  function setBodyLock(locked) {
    document.body.classList.toggle('cookie-consent-locked', locked);
  }

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function readStoredConsent() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    if (typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > CONSENT_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      analytics: Boolean(parsed.analytics),
      timestamp: parsed.timestamp
    };
  }

  function storeConsent(analyticsAccepted) {
    const payload = {
      analytics: analyticsAccepted,
      timestamp: Date.now()
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }

  function hideBanner() {
    if (!bannerElement) return;
    bannerElement.classList.remove('is-visible');
    bannerElement.setAttribute('aria-hidden', 'true');
    if (!consentRequired) {
      setBodyLock(false);
    }
  }

  function showBanner() {
    if (!bannerElement) return;
    bannerElement.classList.add('is-visible');
    bannerElement.setAttribute('aria-hidden', 'false');
    if (consentRequired) {
      setBodyLock(true);
    }
  }

  function hideModal() {
    if (consentRequired) return;
    if (!modalElement) return;
    modalElement.classList.remove('is-visible');
    modalElement.setAttribute('aria-hidden', 'true');
    setBodyLock(false);
  }

  function showModal() {
    if (!modalElement) return;
    const stored = readStoredConsent();
    if (analyticsToggle) {
      analyticsToggle.checked = Boolean(stored && stored.analytics);
    }
    modalElement.classList.add('is-visible');
    modalElement.setAttribute('aria-hidden', 'false');
    setBodyLock(true);
  }

  function loadAnalytics() {
    if (gaInitialized) return;
    gaInitialized = true;

    if (!window.dataLayer) {
      window.dataLayer = [];
    }
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', GA4_ID, { anonymize_ip: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
    script.setAttribute('data-cookie-consent', 'ga4');
    document.head.appendChild(script);
  }

  function savePreferences(analyticsAccepted) {
    storeConsent(analyticsAccepted);

    if (analyticsAccepted) {
      loadAnalytics();
      window.dispatchEvent(
        new CustomEvent('cookiesAccepted', {
          detail: { analytics: true }
        })
      );
    }

    hideBanner();
    hideModal();
    setBodyLock(false);
  }

  function createBanner() {
    const banner = document.createElement('section');
    banner.className = 'cookie-banner cookie-banner--centered';
    banner.setAttribute('aria-hidden', 'true');
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Aviso de cookies');
    banner.innerHTML = `
      <div class="cookie-banner__overlay"></div>
      <div class="cookie-banner__inner" role="dialog" aria-modal="true" aria-labelledby="cookie-banner-title">
        <div class="cookie-banner__text">
          <h2 id="cookie-banner-title">Usamos cookies</h2>
          <p>
            Usamos cookies propias y de terceros para analizar el tráfico de nuestra web.
            Puedes aceptarlas o configurarlas según tus preferencias.
          </p>
          <a href="/privacidad">Política de privacidad</a>
        </div>
        <div class="cookie-banner__actions">
          <button type="button" class="cookie-btn cookie-btn--primary" data-accept-all>Aceptar todas</button>
          <button type="button" class="cookie-btn cookie-btn--secondary" data-accept-necessary>Solo necesarias</button>
          <button type="button" class="cookie-config-link" data-open-settings>Configurar</button>
        </div>
      </div>
    `;

    banner
      .querySelector('[data-accept-all]')
      ?.addEventListener('click', () => savePreferences(true));
    banner
      .querySelector('[data-accept-necessary]')
      ?.addEventListener('click', () => savePreferences(false));
    banner
      .querySelector('[data-open-settings]')
      ?.addEventListener('click', () => showModal());

    return banner;
  }

  function createModal() {
    const modal = document.createElement('div');
    modal.className = 'cookie-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="cookie-modal__overlay" data-close-settings></div>
      <div class="cookie-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-settings-title">
        <h2 id="cookie-settings-title">Configuración de cookies</h2>
        <p>Aquí puedes activar o desactivar cada categoría de cookies.</p>

        <div class="cookie-category">
          <div class="cookie-category__content">
            <strong>Cookies necesarias</strong>
            <p>Siempre activas. Necesarias para el funcionamiento básico de la web.</p>
          </div>
          <label class="cookie-switch">
            <input type="checkbox" checked disabled />
            <span aria-hidden="true"></span>
          </label>
        </div>

        <div class="cookie-category">
          <div class="cookie-category__content">
            <strong>Cookies analíticas</strong>
            <p>Google Analytics 4. Nos ayudan a entender cómo se usa la web para mejorarla. No se usan con fines publicitarios.</p>
          </div>
          <label class="cookie-switch">
            <input id="analytics-consent-toggle" type="checkbox" />
            <span aria-hidden="true"></span>
          </label>
        </div>

        <div class="cookie-modal__actions">
          <button type="button" class="cookie-btn cookie-btn--primary" data-save-settings>Guardar preferencias</button>
        </div>
      </div>
    `;

    modal.querySelector('[data-close-settings]')?.addEventListener('click', () => {
      if (consentRequired) return;
      hideModal();
    });
    modal.querySelector('[data-save-settings]')?.addEventListener('click', () => {
      const isChecked = analyticsToggle instanceof HTMLInputElement && analyticsToggle.checked;
      savePreferences(isChecked);
    });

    return modal;
  }

  function init() {
    bannerElement = createBanner();
    modalElement = createModal();
    document.body.appendChild(bannerElement);
    document.body.appendChild(modalElement);
    analyticsToggle = document.getElementById('analytics-consent-toggle');

    const storedConsent = readStoredConsent();
    if (!storedConsent) {
      consentRequired = true;
      showBanner();
      return;
    }

    if (storedConsent.analytics) {
      loadAnalytics();
    }
  }

  window.openCookieSettings = function openCookieSettings() {
    consentRequired = false;
    hideBanner();
    showModal();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
