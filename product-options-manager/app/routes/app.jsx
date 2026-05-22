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
  await authenticate.admin(request);

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
  return (
    <>
      <p>Redirecting to Shopify authorization...</p>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const params = new URLSearchParams(window.location.search);
              const shop = params.get("shop");

              if (!shop) return;

              const target = new URL("/auth/login", window.location.origin);
              target.searchParams.set("shop", shop);
              window.open(target.toString(), "_top");
            })();
          `,
        }}
      />
    </>
  );
}
