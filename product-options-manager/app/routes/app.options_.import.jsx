/* eslint-disable react/prop-types */
import { Buffer } from "node:buffer";
import process from "node:process";
import { Form, useActionData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncProductNativeVariants } from "../native-variant-pricing.server";
import {
  createImportToken,
  MAX_SPREADSHEET_BYTES,
  parseRateUpload,
  readImportToken,
  serializeImportedField,
} from "../spreadsheet-import.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "preview");

  if (intent === "create") {
    return createGroupsFromPreview({
      admin,
      session,
      token: formData.get("importToken"),
    });
  }

  if (intent !== "preview") {
    return { ok: false, error: "Unsupported spreadsheet action." };
  }

  const file = formData.get("spreadsheet");

  if (!file || typeof file.arrayBuffer !== "function") {
    return { ok: false, error: "Choose an .xlsx or .csv spreadsheet to preview." };
  }

  const filename = String(file.name || "");
  if (!/\.(?:xlsx|csv)$/i.test(filename)) {
    return { ok: false, error: "Upload an .xlsx or .csv file. Legacy .xls files are not supported." };
  }

  if (Number(file.size || 0) > MAX_SPREADSHEET_BYTES) {
    return { ok: false, error: "The spreadsheet is larger than 10 MB." };
  }

  try {
    const parsedSheets = await parseRateUpload(
      Buffer.from(await file.arrayBuffer()),
      filename,
    );
    const preview = [];
    const validItems = [];
    const seenProductIds = new Set();

    for (const sheet of parsedSheets) {
      const item = publicSheetPreview(sheet);

      if (!sheet.errors.length) {
        const resolvedTargets = [];

        for (let index = 0; index < sheet.products.length; index += 1) {
          const productReference = sheet.products[index];

          try {
            const target = await loadProductByHandle(admin, productReference.handle);

            if (
              !target ||
              String(target.handle || "").toLowerCase() !==
                String(productReference.handle || "").toLowerCase()
            ) {
              item.errors.push(`Shopify product “${productReference.handle}” was not found.`);
              continue;
            }

            item.products[index].title = target.title;

            if (seenProductIds.has(target.id)) {
              item.errors.push(
                `Product “${target.title}” is also targeted by another valid worksheet in this file.`,
              );
              continue;
            }

            const existingTarget = await findExistingTarget(target);

            if (existingTarget) {
              item.errors.push(
                `Product “${target.title}” is already assigned to “${existingTarget.optionGroup.name}”. Remove it there before importing.`,
              );
              continue;
            }

            resolvedTargets.push({
              id: target.id,
              title: target.title,
              handle: target.handle,
            });
          } catch (error) {
            item.errors.push(
              `${productReference.handle}: ${errorMessage(error, "Shopify could not verify this product.")}`,
            );
          }
        }

        if (!item.errors.length && resolvedTargets.length === sheet.products.length) {
          resolvedTargets.forEach((target) => seenProductIds.add(target.id));
          validItems.push({
            sheetName: sheet.sheetName,
            groupName: sheet.groupName || resolvedTargets[0].title,
            targets: resolvedTargets,
            fields: sheet.fields,
          });
        }
      }

      preview.push(item);
    }

    const secret = process.env.SHOPIFY_API_SECRET || "";
    const importToken = validItems.length
      ? createImportToken(
          {
            shop: session.shop,
            createdAt: Date.now(),
            items: validItems,
          },
          secret,
        )
      : "";

    return {
      ok: true,
      filename,
      preview,
      importToken,
      validCount: validItems.length,
      validProductCount: validItems.reduce(
        (total, item) => total + item.targets.length,
        0,
      ),
      invalidCount: preview.length - validItems.length,
    };
  } catch (error) {
    console.error("Spreadsheet preview failed", error);
    return {
      ok: false,
      error: errorMessage(error, "The spreadsheet could not be read."),
    };
  }
};

export default function SpreadsheetImportPage() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const submittingIntent = String(navigation.formData?.get("intent") || "");
  const previewing = navigation.state === "submitting" && submittingIntent === "preview";
  const creating = navigation.state === "submitting" && submittingIntent === "create";

  return (
    <s-page heading="Import product options">
      <s-link slot="breadcrumb" href="/app/options">
        Product Options
      </s-link>

      <s-section heading="Upload rate spreadsheet">
        <p style={introStyle}>
          Create one option group per worksheet or CSV file. Add one or more product
          URLs above the table to assign the same options and prices to every listed
          product. Each saved variation price is calculated as quantity × rate.
        </p>

        <Form method="post" encType="multipart/form-data" style={uploadFormStyle}>
          <input type="hidden" name="intent" value="preview" />
          <label htmlFor="option-spreadsheet" style={labelStyle}>
            Rate spreadsheet (.xlsx or .csv)
          </label>
          <input
            id="option-spreadsheet"
            name="spreadsheet"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            required
            style={fileInputStyle}
          />
          <div style={helpStyle}>Maximum file size: 10 MB.</div>
          <button type="submit" disabled={previewing || creating} style={primaryButtonStyle}>
            {previewing ? "Reading workbook…" : "Preview import"}
          </button>
        </Form>

        {actionData?.error ? (
          <div role="alert" style={errorBannerStyle}>
            {actionData.error}
          </div>
        ) : null}
      </s-section>

      <s-section heading="Expected spreadsheet layout">
        <div style={formatGridStyle}>
          <div>
            <strong>Required</strong>
            <ul style={listStyle}>
              <li>One or more product URLs containing /products/product-handle</li>
              <li>A header row with Size, Color, or another option name</li>
              <li>Numeric quantity headers such as 1, 10, 50, 100</li>
              <li>Per-piece rates in the matrix</li>
            </ul>
          </div>
          <div>
            <strong>Created in Shopify</strong>
            <ul style={listStyle}>
              <li>One active Product Options group per valid worksheet or CSV file</li>
              <li>Required Quantity and option fields</li>
              <li>Exact variation totals and native Shopify price variants</li>
              <li>All product assignments from the URLs above the table</li>
            </ul>
          </div>
        </div>
      </s-section>

      {Array.isArray(actionData?.preview) ? (
        <PreviewSection
          data={actionData}
          creating={creating}
          previewing={previewing}
        />
      ) : null}

      {Array.isArray(actionData?.results) ? <ResultsSection results={actionData.results} /> : null}
    </s-page>
  );
}

function PreviewSection({ data, creating, previewing }) {
  return (
    <s-section heading="Import preview">
      <div style={summaryStyle}>
        <strong>{data.filename}</strong>
        <span>
          {data.validCount} groups ready for {data.validProductCount} products · {data.invalidCount} need attention
        </span>
      </div>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Worksheet</th>
              <th style={headerCellStyle}>Products</th>
              <th style={headerCellStyle}>Options</th>
              <th style={headerCellStyle}>Quantities</th>
              <th style={headerCellStyle}>Prices</th>
              <th style={headerCellStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.preview.map((sheet) => {
              const valid = sheet.errors.length === 0;
              return (
                <tr key={sheet.sheetName}>
                  <td style={bodyCellStyle}>
                    <strong>{sheet.sheetName}</strong>
                    <div style={mutedStyle}>{sheet.groupName}</div>
                  </td>
                  <td style={bodyCellStyle}>
                    {sheet.products.length ? (
                      <ul style={productListStyle}>
                        {sheet.products.map((product) => (
                          <li key={product.handle}>
                            {product.title || product.handle}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "Missing product URL"
                    )}
                  </td>
                  <td style={bodyCellStyle}>
                    {sheet.optionValueCounts.length
                      ? sheet.optionValueCounts
                          .map((option) => `${option.label}: ${option.count}`)
                          .join(", ")
                      : "—"}
                  </td>
                  <td style={bodyCellStyle}>
                    {sheet.quantities.length ? sheet.quantities.join(", ") : "—"}
                  </td>
                  <td style={bodyCellStyle}>
                    {sheet.variationCount
                      ? `${sheet.variationCount} totals · ${money(sheet.minTotal)}–${money(sheet.maxTotal)}`
                      : "—"}
                  </td>
                  <td style={bodyCellStyle}>
                    <span style={statusStyle(valid)}>{valid ? "Ready" : "Needs attention"}</span>
                    {sheet.errors.map((error) => (
                      <div key={error} style={messageStyle(false)}>
                        {error}
                      </div>
                    ))}
                    {sheet.warnings.map((warning) => (
                      <div key={warning} style={messageStyle(true)}>
                        {warning}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.importToken ? (
        <Form method="post" style={createFormStyle}>
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="importToken" value={data.importToken} />
          <div style={helpStyle}>
            Import creates active groups and immediately syncs native Shopify variants so product,
            cart, and checkout totals match.
          </div>
          <button type="submit" disabled={creating || previewing} style={primaryButtonStyle}>
            {creating
              ? "Creating and syncing…"
              : `Import ${data.validCount} group${data.validCount === 1 ? "" : "s"} for ${data.validProductCount} product${data.validProductCount === 1 ? "" : "s"}`}
          </button>
        </Form>
      ) : null}
    </s-section>
  );
}

function ResultsSection({ results }) {
  const successCount = results.filter((result) => result.ok).length;

  return (
    <s-section heading="Import results">
      <div role="status" style={successCount ? successBannerStyle : errorBannerStyle}>
        {successCount} of {results.length} product option groups imported and synced.
      </div>
      <div style={resultListStyle}>
        {results.map((result) => (
          <div key={`${result.sheetName}-${result.groupName}`} style={resultCardStyle}>
            <strong>{result.groupName}</strong>
            <div style={mutedStyle}>{result.productTitles.join(", ")}</div>
            <div style={messageStyle(result.ok)}>
              {result.ok
                ? `${result.variantCount} Shopify price variants synced.`
                : result.error}
            </div>
            {result.groupId ? (
              <s-link href={`/app/options/${result.groupId}`}>Open option group</s-link>
            ) : null}
          </div>
        ))}
      </div>
    </s-section>
  );
}

async function createGroupsFromPreview({ admin, session, token }) {
  try {
    const plan = readImportToken(token, process.env.SHOPIFY_API_SECRET || "");

    if (plan.shop !== session.shop) {
      return { ok: false, error: "This import preview belongs to a different Shopify store." };
    }

    if (Date.now() - Number(plan.createdAt || 0) > 30 * 60 * 1000) {
      return { ok: false, error: "This import preview is more than 30 minutes old. Upload the workbook again." };
    }

    const results = [];

    for (const item of plan.items) {
      let existingTarget = null;

      for (const target of item.targets) {
        existingTarget = await findExistingTarget(target);
        if (existingTarget) break;
      }

      if (existingTarget) {
        results.push({
          ok: false,
          sheetName: item.sheetName,
          groupName: item.groupName,
          productTitles: item.targets.map((target) => target.title),
          error: `Skipped because one of these products is already assigned to “${existingTarget.optionGroup.name}”.`,
        });
        continue;
      }

      const group = await db.optionGroup.create({
        data: {
          name: item.groupName,
          status: "active",
          fields: {
            create: item.fields.map(serializeImportedField),
          },
          targets: {
            create: item.targets.map((target) => ({
              productId: target.id,
              productTitle: target.title,
            })),
          },
        },
      });

      try {
        const sync = await syncProductNativeVariants(
          admin,
          item.fields,
          item.targets,
          { shop: session.shop },
        );

        if (!sync.synced) throw new Error("Shopify did not return any products to sync.");

        results.push({
          ok: true,
          sheetName: item.sheetName,
          groupName: item.groupName,
          productTitles: item.targets.map((target) => target.title),
          groupId: group.id,
          variantCount: sync.variantCount || 0,
        });
      } catch (error) {
        await db.optionGroup.update({
          where: { id: group.id },
          data: { status: "draft" },
        });

        results.push({
          ok: false,
          sheetName: item.sheetName,
          groupName: item.groupName,
          productTitles: item.targets.map((target) => target.title),
          groupId: group.id,
          error: `${errorMessage(error, "Shopify price sync failed.")} The group was saved as draft.`,
        });
      }
    }

    return { ok: results.every((result) => result.ok), results };
  } catch (error) {
    console.error("Spreadsheet import failed", error);
    return { ok: false, error: errorMessage(error, "The spreadsheet import failed.") };
  }
}

async function loadProductByHandle(admin, handle) {
  const escapedHandle = String(handle || "").replace(/['\\]/g, "");
  const response = await admin.graphql(
    `#graphql
      query SpreadsheetImportProduct($query: String!) {
        products(first: 1, query: $query) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `,
    { variables: { query: `handle:'${escapedHandle}'` } },
  );
  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data?.products?.nodes?.[0] || null;
}

async function findExistingTarget(target) {
  const numericId = String(target.id || "").split("/").pop();
  const references = [target.id, target.handle, numericId].filter(Boolean);

  return db.productTarget.findFirst({
    where: {
      OR: references.map((productId) => ({ productId })),
    },
    include: { optionGroup: { select: { name: true } } },
  });
}

function publicSheetPreview(sheet) {
  return {
    sheetName: sheet.sheetName,
    groupName: sheet.groupName,
    products: sheet.products.map((product) => ({
      handle: product.handle,
      title: "",
    })),
    quantities: sheet.quantities,
    optionValueCounts: sheet.optionValueCounts,
    variationCount: sheet.variationCount,
    minTotal: sheet.minTotal,
    maxTotal: sheet.maxTotal,
    warnings: [...sheet.warnings],
    errors: [...sheet.errors],
  };
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function money(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return `Rs. ${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const introStyle = { maxWidth: 780, margin: "0 0 18px", lineHeight: 1.55, color: "#4a4f55" };
const uploadFormStyle = { display: "grid", gap: 10, maxWidth: 620 };
const labelStyle = { fontWeight: 650, color: "#202223" };
const fileInputStyle = { padding: 12, border: "1px solid #8c9196", borderRadius: 8, background: "#fff" };
const helpStyle = { color: "#616161", fontSize: 13, lineHeight: 1.45 };
const primaryButtonStyle = {
  width: "fit-content",
  border: 0,
  borderRadius: 8,
  padding: "11px 18px",
  background: "#202223",
  color: "#fff",
  fontWeight: 650,
  cursor: "pointer",
};
const errorBannerStyle = { marginTop: 16, padding: "12px 14px", border: "1px solid #e0a4a4", borderRadius: 8, background: "#fff4f4", color: "#8e1f1f" };
const successBannerStyle = { marginTop: 12, padding: "12px 14px", border: "1px solid #8fc89e", borderRadius: 8, background: "#edf9f0", color: "#174d27" };
const formatGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 };
const listStyle = { margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.7 };
const productListStyle = { margin: 0, paddingLeft: 18, lineHeight: 1.5 };
const summaryStyle = { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 14 };
const tableWrapStyle = { overflowX: "auto", border: "1px solid #dfe3e8", borderRadius: 10 };
const tableStyle = { width: "100%", minWidth: 980, borderCollapse: "collapse" };
const headerCellStyle = { padding: "12px 14px", textAlign: "left", fontSize: 13, borderBottom: "1px solid #dfe3e8", background: "#f6f6f7" };
const bodyCellStyle = { padding: "14px", verticalAlign: "top", borderBottom: "1px solid #ebecef", lineHeight: 1.45 };
const mutedStyle = { marginTop: 4, color: "#616161", fontSize: 13 };
const statusStyle = (valid) => ({ display: "inline-flex", padding: "3px 8px", borderRadius: 999, background: valid ? "#dff7e5" : "#ffe8e5", color: valid ? "#174d27" : "#8e1f1f", fontSize: 12, fontWeight: 650 });
const messageStyle = (warningOrSuccess) => ({ marginTop: 7, color: warningOrSuccess ? "#6d4c00" : "#8e1f1f", fontSize: 12, lineHeight: 1.4 });
const createFormStyle = { display: "grid", gap: 12, marginTop: 18, justifyItems: "start" };
const resultListStyle = { display: "grid", gap: 12, marginTop: 16 };
const resultCardStyle = { padding: 16, border: "1px solid #dfe3e8", borderRadius: 10, background: "#fff" };
