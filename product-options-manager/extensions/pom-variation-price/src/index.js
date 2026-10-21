// Retained as a no-op for existing installations during migration. Pricing Sync
// stores prices on Shopify variants; client-supplied properties never set prices.
export function cartTransformRun() {
  return { operations: [] };
}
