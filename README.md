# 025 — Vault reader

Hash-routed React reader for a site directory published by
[markdown-tools-cli](https://github.com/dentropy/markdown-indexer/tree/main/libs/markdown-tools-cli)
from [github.com/dentropy/markdown-indexer](https://github.com/dentropy/markdown-indexer).
The app fetches `directory.json`, `articles/`, `frontmatter/`, `backlinks/`,
and `assets/`. It does not read the vault.

The file contract is [site-dir-spec.md](./site-dir-spec.md).

This guide starts at a machine with no CLI installed and ends with the vault's
markdown open in a browser.

## What you need

- Go 1.27 or newer (`go version`). The CLI module sets `go 1.27.0`.
- Node.js 20.19 or newer, or 22.12 or newer, plus npm. The app uses Vite 7.
- Python 3. `./dev.sh` serves the published JSON with `python3 -m http.server`.

## 1. Build the CLI

The publisher is the `main` package in `libs/markdown-tools-cli`. The binary
it produces is named `markdown-tools-cli`.

Build it from a clone. `go install github.com/dentropy/markdown-indexer/libs/markdown-tools-cli@latest`
is rejected: that module's `go.mod` contains `replace` directives for the
sibling libraries, and `go install` will not apply them.

```sh
git clone https://github.com/dentropy/markdown-indexer.git
cd markdown-indexer/libs/markdown-tools-cli
go build -o markdown-tools-cli .
```

Call it as `./markdown-tools-cli` from that directory, or copy it onto `PATH`:

```sh
install -m 755 markdown-tools-cli "$(go env GOPATH)/bin/markdown-tools-cli"
export PATH="$(go env GOPATH)/bin:$PATH"
markdown-tools-cli -h
```

`-h` prints the flags and exits 0. A missing command means `GOPATH/bin` is not
on `PATH`.

The tagged module `github.com/dentropy/markdown-indexer/libs/markdown-indexer-cli`
(binary `markdown-indexer-cli`, tags `v0.1.0` and `v0.2.0`) prints a JSON index
to stdout. It has no `-site-dir` and cannot feed this app. Use
`markdown-tools-cli` from the current `main` branch.

## 2. Publish a vault to a site directory

A published document is a markdown file with a non-empty `uuid` in its front
matter. By default the CLI then keeps only files whose `share` value is true
(`true`, `TRUE`, `1`, `t`, `T`). A missing `share` key, `false`, or `yes` is
left out. Files with no front matter, and files whose front matter does not
parse, are left out. The first unreadable front matter aborts the publish
unless you pass `-force` (or `-F`).

`-initfrontmatter` and `-setshare` rewrite the vault in place. Run them on a
copy, or from a checkout you can revert.

### A two-note vault you can publish immediately

```sh
mkdir -p /tmp/vault-demo
cat > /tmp/vault-demo/index.md << 'EOF'
---
uuid: 123e4567-e89b-12d3-a456-426614174000
title: Hello
share: true
---

# Hello

This note links to [[second-note]].
EOF
cat > /tmp/vault-demo/second-note.md << 'EOF'
---
uuid: 223e4567-e89b-12d3-a456-426614174000
title: Second note
share: true
---

# Second note

Published markdown, open in the browser.
EOF
mkdir -p /tmp/vault-site
markdown-tools-cli -dir /tmp/vault-demo -site-dir /tmp/vault-site
```

`/tmp/vault-site` then contains `manifest.json`, `articles/<uuid>.json`,
`frontmatter/<cid>.json`, and `backlinks/<uuid>.json`.

### An existing vault

Give every matched note a `uuid` when it lacks one. Missing `share` keys become
`false`. Existing `share` values stay as they are. `-force` skips a file whose
front matter does not parse.

```sh
markdown-tools-cli -dir /path/to/vault -initfrontmatter -force
```

Publish every identified document, including notes whose `share` is not true:

```sh
mkdir -p /path/to/site
markdown-tools-cli -dir /path/to/vault -include-unshared -force -site-dir /path/to/site
```

To publish only the shared notes, drop `-include-unshared`. To mark every note
shared first, which rewrites each file:

```sh
markdown-tools-cli -dir /path/to/vault -setshare -share=true -force
markdown-tools-cli -dir /path/to/vault -force -site-dir /path/to/site
```

`-setshare` requires `-share=true` or `-share=false`. It also fills in a missing
`uuid`.

Re-run the same `-site-dir` command after the vault changes. `-prune` defaults
to true and deletes published files from the previous run that this run did not
write.

## 3. Name the catalog `directory.json`

`markdown-tools-cli -site-dir` writes the catalog as `manifest.json`. This app
fetches `directory.json`. The two files are the same JSON
(`{"documents":[{"title","uuid","path"}, ...]}`).

Inside the site directory:

```sh
ln -sfn manifest.json directory.json
```

`test -f directory.json` should succeed. `-prune` does not delete that symlink,
so a later publish keeps it pointed at the new `manifest.json`. A copy works
too, and goes stale on the next publish until you copy again.

## 4. Open the reader in a browser

From this repository:

```sh
DATA_DIR=/tmp/vault-site ./dev.sh
```

`DATA_DIR` is the site directory, the folder that contains `directory.json`.
`./dev.sh` installs `app/node_modules` on the first run, serves the site
directory at <http://127.0.0.1:8000/>, and serves the Vite app at
<http://127.0.0.1:5173/>. The dev server proxies `/directory.json`, `/articles`,
`/frontmatter`, `/backlinks`, and `/assets` to port 8000. Open
<http://127.0.0.1:5173/>.

You should see a sidebar built from `directory.json`. The landing note is
`index.md` when that path was published, otherwise the first document. The main
pane renders that note's markdown. Click **Second note** (or another title) and
the body changes. A `[[wikilink]]` whose target name matches a published file
navigates to that note.

Routes are hashes: `#/<uuid>/` opens a document, `#/<uuid>/#<heading-slug>`
scrolls to a heading, and `#/directory` opens the directory page. The UUID is
the one in `directory.json`, not the file name.

Stop the script with Ctrl-C. It stops the Python data server as well.

`DATA_PORT` (default `8000`) and `APP_PORT` (default `5173`) change the two
ports. If `8000` or `5173` is already taken, pick free ports:

```sh
DATA_PORT=8010 APP_PORT=5174 DATA_DIR=/tmp/vault-site ./dev.sh
```

Then open <http://127.0.0.1:5174/>.

## 5. One process, after a production build

`./dev.sh` is the development server. To serve the built app and the site
directory from one process:

```sh
cd app
npm install
DATA_ROOT=/tmp/vault-site npm run serve
```

`npm run serve` runs `vite build` and then `node server.mjs`. It listens on
<http://127.0.0.1:4173/>. `PORT` changes that port. `DATA_ROOT` is required and
is the same folder as `DATA_DIR`: the site directory that contains
`directory.json`.

## When the browser does not show markdown

| What you see | What to fix |
| --- | --- |
| `./dev.sh` exits with `no directory.json` | `DATA_DIR` is not the `-site-dir` folder, or `manifest.json` was not linked to `directory.json`. |
| **Failed to load data**, and the message names `directory.json` | The app origin cannot fetch the catalog. Restart `./dev.sh` with `DATA_DIR` set, and confirm <http://127.0.0.1:8000/directory.json> returns JSON. |
| **Empty vault** | The publish wrote `documents: []`. Notes need a `uuid`. With the default filter they also need `share: true`, or pass `-include-unshared`. |
| The CLI exits on broken front matter | Re-run with `-force` to skip those files, or `-fix-frontmatter` (it prompts) to quote scalars the YAML parser rejected. |
| Sidebar lists notes, a note body fails to load | Republish. `articles/<uuid>.json` or `frontmatter/<cid>.json` is missing for that UUID. |
