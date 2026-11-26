# Install markdown-indexer-cli

Go 1.27 or newer. `go install` cannot build this module. From any directory:

```sh
git clone https://github.com/dentropy/markdown-indexer.git
(
  cd markdown-indexer/libs/markdown-tools-cli
  go build -o "$(go env GOPATH)/bin/markdown-indexer-cli" .
)
export PATH="$(go env GOPATH)/bin:$PATH"
markdown-indexer-cli -h
```

The binary is `$(go env GOPATH)/bin/markdown-indexer-cli`. A new shell needs the `export PATH` line again. `-h` prints the flags.

# Run the example vault on port 8080

Node.js 20.19 or newer (or 22.12 or newer) and Python 3. Run this from the root of this repository, the directory that contains `dev.sh`. Stop an earlier `./dev.sh` with Ctrl-C first. Port 8000 has to be free.

```sh
export PATH="$(go env GOPATH)/bin:$PATH"
mkdir -p /tmp/vault-site
markdown-indexer-cli -dir examples/vault -site-dir /tmp/vault-site
APP_PORT=8080 DATA_DIR=/tmp/vault-site ./dev.sh
```

The publisher writes `/tmp/vault-site/directory.json`. Open http://127.0.0.1:8080/. The sidebar lists Hello and Second note.

# docker

Turn a raw markdown folder into the JSON site. The first mount is the markdown. The second mount is the output.

```sh
docker run --rm -v "$PWD/examples/vault:/vault:ro" -v /tmp/vault-site:/site $(docker build -q --target cli .) -dir /vault -site-dir /site
```

```sh
docker compose up --build
```

Open http://127.0.0.1:8081/.
