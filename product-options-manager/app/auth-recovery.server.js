export function getShopFromRequest(request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) return shop;

  const host = url.searchParams.get("host");

  if (host) {
    try {
      const decodedHost = atob(host);
      const hostShop = decodedHost.split("/")[0];

      if (hostShop) return hostShop;
    } catch {
      // Ignore malformed hosts and fall back to the referrer below.
    }
  }

  const referrer = request.headers.get("referer");

  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      const storeHandle = referrerUrl.pathname.match(/\/store\/([^/]+)/)?.[1];

      if (storeHandle) return `${storeHandle}.myshopify.com`;
    } catch {
      // Ignore malformed referrers and let the login page ask for the shop.
    }
  }

  return "";
}

export function topLevelAuthRedirect(request) {
  const url = new URL(request.url);
  const shop = getShopFromRequest(request);
  const loginUrl = new URL("/auth/login", url.origin);

  if (shop) {
    loginUrl.searchParams.set("shop", shop);
  }

  return new Response(
    `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <script>
            window.top.location.href = ${JSON.stringify(loginUrl.toString())};
          </script>
        </head>
        <body>Redirecting to Shopify authorization...</body>
      </html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function authenticateAdminOrRedirect(authenticate, request) {
  try {
    return await authenticate.admin(request);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw topLevelAuthRedirect(request);
    }

    throw error;
  }
}
