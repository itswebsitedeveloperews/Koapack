import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Outlet,
  useLoaderData,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      const url = new URL(request.url);
      const shop = getShopFromRequest(request);
      const loginUrl = new URL("/auth/login", url.origin);

      if (shop) {
        loginUrl.searchParams.set("shop", shop);
      }

      throw topLevelRedirect(loginUrl.toString());
    }

    throw error;
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/options">Product Options</s-link>
        <s-link href="/app/options/assets">Assets</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 401) {
    return <EmbeddedAuthRedirect />;
  }

  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function EmbeddedAuthRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let shop = params.get("shop");

    if (!shop && params.get("host")) {
      try {
        const decodedHost = atob(params.get("host"));
        shop = decodedHost.split("/")[0];
      } catch {
        shop = "";
      }
    }

    if (!shop && document.referrer) {
      try {
        const referrer = new URL(document.referrer);
        const storeHandle = referrer.pathname.match(/\/store\/([^/]+)/)?.[1];

        if (storeHandle) {
          shop = `${storeHandle}.myshopify.com`;
        }
      } catch {
        shop = "";
      }
    }

    if (!shop) {
      window.open("/auth/login", "_top");
      return;
    }

    const target = new URL("/auth/login", window.location.origin);
    target.searchParams.set("shop", shop);
    window.open(target.toString(), "_top");
  }, []);

  return (
    <AppProvider embedded={false}>
      <p>Redirecting to Shopify authorization...</p>
    </AppProvider>
  );
}

function getShopFromRequest(request) {
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

function topLevelRedirect(url) {
  return new Response(
    `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <script>
            window.top.location.href = ${JSON.stringify(url)};
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
