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

export const loader = async ({ request }) => {
  await authenticate.admin(request);

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
        display: block;
        max-width: 1040px;
        padding: 24px;
      }

      s-page::before {
        content: attr(heading);
        display: block;
        margin: 0 0 18px;
        font-size: 24px;
        font-weight: 650;
        line-height: 1.25;
      }

      s-section {
        display: block;
        margin: 0 0 20px;
        padding: 18px;
        border: 1px solid #dfe3e8;
        border-radius: 8px;
        background: #fff;
      }

      s-section::before {
        content: attr(heading);
        display: block;
        margin: 0 0 10px;
        font-size: 16px;
        font-weight: 650;
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

      s-link {
        display: inline-block;
        color: #005bd3;
        cursor: pointer;
        text-decoration: none;
      }

      s-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        padding: 7px 12px;
        border: 1px solid #8c9196;
        border-radius: 6px;
        background: #fff;
        color: #202223;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
      }

      s-button[variant="primary"] {
        border-color: #202223;
        background: #202223;
        color: #fff;
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
    `}</style>
  );
}

const navStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  padding: "16px 24px 0",
};

const navLinkStyle = {
  color: "#005bd3",
  textDecoration: "none",
  fontWeight: 600,
};
