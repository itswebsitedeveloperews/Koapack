# TODO

## Scope fix: Missing Shopify Files permission

- [x] Update `shopify.app.toml` to request `read_files` and `write_files` access scopes (in addition to existing product/metaobject scopes).

- [ ] Redeploy the app (or restart dev tunnel) so Shopify receives the updated scopes.
- [ ] Reauthorize the app on the target Shopify store by uninstalling/reinstalling (or using the CLI reauth flow if available).
- [ ] Re-test the Assets upload endpoint to confirm the 403 permission error is resolved.
