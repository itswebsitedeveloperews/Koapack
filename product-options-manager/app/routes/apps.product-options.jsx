import db from "../db.server";
import { loadStorefrontOptions } from "../storefront-options.server.js";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const data = await loadStorefrontOptions(db, {
    id: url.searchParams.get("productId"),
    handle: url.searchParams.get("handle"),
  });
  return Response.json({ ok: true, ...data });
};
