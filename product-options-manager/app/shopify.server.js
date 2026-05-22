import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

const pendingAdminAuth = new Map();

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = {
  ...shopify.authenticate,
  admin: async (request) => {
    const authKey = getAdminAuthKey(request);

    if (authKey && pendingAdminAuth.has(authKey)) {
      return pendingAdminAuth.get(authKey);
    }

    const authPromise = waitForSessionTokenClockSkew(request).then(() =>
      shopify.authenticate.admin(request),
    );

    if (!authKey) {
      return authPromise;
    }

    pendingAdminAuth.set(authKey, authPromise);

    try {
      return await authPromise;
    } finally {
      pendingAdminAuth.delete(authKey);
    }
  },
};
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

function getAdminAuthKey(request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization") || "";

  return (
    authHeader.match(/^Bearer (.+)$/i)?.[1] || url.searchParams.get("id_token")
  );
}

async function waitForSessionTokenClockSkew(request) {
  const token = getAdminAuthKey(request);
  const payload = decodeJwtPayload(token);
  const nbf = payload?.nbf;

  if (!nbf) return;

  const shopifyClockToleranceMs = 10_000;
  const nowMs = Date.now();
  const validAtMs = nbf * 1000 - shopifyClockToleranceMs;
  const waitMs = validAtMs - nowMs;

  if (waitMs <= 0) return;

  await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 15_000)));
}

function decodeJwtPayload(token) {
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
