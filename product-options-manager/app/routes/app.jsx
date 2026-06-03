import { useEffect } from "react";
import {
  Link,
  Outlet,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { ensurePomCartTransform } from "../cart-transform.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  await ensurePomCartTransform(admin);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <WebComponentFallbacks />
      <nav style={navStyle}>
        <Link style={navLinkStyle} to="/app">
          Home
        </Link>
        <Link style={navLinkStyle} to="/app/options">
          Product Options
        </Link>
        <Link style={navLinkStyle} to="/app/options/assets">
          Assets
        </Link>
        <Link style={navLinkStyle} to="/app/additional">
          Additional page
        </Link>
      </nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function WebComponentFallbacks() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleClick = (event) => {
      const path = event.composedPath?.() || [];
      const clickable =
        path.find(
          (element) =>
            element?.getAttribute &&
            ["S-LINK", "S-BUTTON"].includes(element.tagName) &&
            element.getAttribute("href"),
        ) || event.target.closest?.("s-link[href], s-button[href]");

      if (!clickable) return;

      const href = clickable.getAttribute("href");

      if (!href) return;

      event.preventDefault();

      if (href.startsWith("/")) {
        navigate(href);
        return;
      }

      window.location.assign(href);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [navigate]);

  return (
    <style>{`
      :root {
        color-scheme: light;
      }

      html,
      body {
        background: #f6f6f7;
        color: #202223;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
      }

      a {
        color: #005bd3;
      }

      input,
      select,
      textarea,
      button {
        font-family: inherit;
      }

      input:focus,
      select:focus,
      textarea:focus,
      button:focus-visible,
      s-button:focus-visible {
        outline: 2px solid #005bd3;
        outline-offset: 2px;
      }

      s-page,
      s-section,
      s-stack,
      s-unordered-list,
      s-list-item,
      s-paragraph,
      s-link,
      s-button {
        box-sizing: border-box;
      }

      s-page {
      display: grid;
    grid-template-columns: minmax(0, 1060px) minmax(270px, 0);
    gap: 20px 24px;
    max-width: 1273px;
    padding: 28px 32px 40px;
      }

      s-page:not(:defined)::before {
        content: attr(heading);
        display: block;
        grid-column: 1 / -1;
        margin: 0 0 2px;
        font-size: 24px;
        font-weight: 700;
        line-height: 1.25;
        color: #202223;
      }

      s-section {
        display: block;
        grid-column: 1;
        margin: 0;
      }

      s-section:not(:defined)::before {
        content: attr(heading);
        display: block;
        margin: 0 0 14px;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
      }

      s-section[slot="aside"] {
        grid-column: 2;
        align-self: start;
      }

      s-page > form {
        display: grid;
        grid-column: 1;
        gap: 20px;
      }

      s-paragraph {
        display: block;
        margin: 0 0 14px;
        color: #4a4f55;
        line-height: 1.45;
      }

      s-stack {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      s-stack[direction="block"] {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
      }

      s-stack[direction="inline"] {
        display: flex;
        align-items: center;
      }

      s-stack[justifycontent="end"],
      s-stack[justifyContent="end"] {
        justify-content: flex-end;
      }

      s-link {
        display: inline-block;
        color: #005bd3;
        cursor: pointer;
        text-decoration: none;
        font-weight: 600;
      }

      s-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;

     
        border-radius: 6px;
        background: #fff;
        color: #202223;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        line-height: 1.2;
      }

      s-page > s-button[slot="primary-action"],
      s-page > s-button[slot="secondary-actions"] {
        grid-row: 1;
        justify-self: end;
        align-self: start;
      }

      s-page > s-button[slot="primary-action"] {
        grid-column: 2;
      }

      s-page > s-button[slot="secondary-actions"] {
        grid-column: 2;
        margin-right: 112px;
      }

      s-unordered-list {
        display: block;
        margin: 8px 0 0;
        padding-left: 18px;
      }

      s-list-item {
        display: list-item;
        margin: 6px 0;
        list-style: disc;
      }

      s-link[slot="breadcrumb"] {
        grid-column: 1 / -1;
        width: fit-content;
        margin: -8px 0 -8px;
        font-size: 13px;
      }

      table {
        background: #fff;
      }

      @media (max-width: 900px) {
        s-page {
          grid-template-columns: minmax(0, 1fr);
          padding: 20px 16px 32px;
        }

        s-section,
        s-section[slot="aside"],
        s-page:not(:defined)::before,
        s-link[slot="breadcrumb"],
        s-page > s-button[slot="primary-action"],
        s-page > s-button[slot="secondary-actions"] {
          grid-column: 1;
        }

        s-page > s-button[slot="primary-action"],
        s-page > s-button[slot="secondary-actions"] {
          grid-row: auto;
          justify-self: start;
          margin-right: 0;
        }
      }
    `}</style>
  );
}

const navStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  padding: "16px 32px 0",
  background: "#f6f6f7",
};

const navLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "32px",
  padding: "0 12px",
  borderRadius: "6px",
  border: "1px solid #dfe3e8",
  background: "#ffffff",
  color: "#202223",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "13px",
};
