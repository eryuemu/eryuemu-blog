## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Network & Git Environment in WSL2

See [`WSL_NETWORK_PROXY_GUIDE.md`](../WSL_NETWORK_PROXY_GUIDE.md) for details on WSL2 networking and Git proxy guidelines.
**Crucial Rule**: Do NOT set global `http.proxy` or `https.proxy` in Git config, as it triggers GnuTLS TLS 1.3 handshake failures (`fatal: unable to access ...: GnuTLS, handshake failed`). Keep proxy unset to use direct routing.
