# 025 — Vault reader

Hash-routed React reader for a directory produced by
[markdown-tools-cli](https://github.com/dentropy/markdown-indexer)
`-site-dir`. The app fetches `directory.json`, `articles/`, `frontmatter/`,
`backlinks/`, and `assets/`. It does not read the vault.

The file contract is [site-dir-spec.md](./site-dir-spec.md).

## Run

Point `DATA_DIR` at a site directory (`directory.json` must be in that folder):

```bash
cd app && npm install
DATA_DIR=/path/to/site ./dev.sh
```

`./dev.sh` serves that folder on port 8000 and the Vite app on port 5173.
The dev server proxies the data paths. Open http://127.0.0.1:5173/.

```bash
cd app && npm test
cd app && npm run serve
```

Routes are hashes: `#/<uuid>/` and `#/<uuid>/#<heading-slug>`.
