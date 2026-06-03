# POM Variation Price

This Cart Transform function applies the exact selected variation price that the storefront script sends on the cart line.

The storefront sends:

- `_pom_price_source=exact_variation`
- `_pom_final_price`, the displayed total for the selected variation
- `_pom_unit_price`, the per-unit price Shopify needs for checkout
- `_pom_selected_quantity`, the quantity used for the displayed total

After deployment, activate the transform on the store:

```graphql
mutation {
  cartTransformCreate(functionHandle: "pom-variation-price") {
    cartTransform {
      id
      functionId
    }
    userErrors {
      field
      message
    }
  }
}
```

Shopify only applies `lineUpdate` price operations on development stores or eligible Shopify Plus stores. Line item properties are buyer-controlled data, so production pricing should validate the selected option combination before trusting the submitted price.
