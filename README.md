# Install markdown-indexer-cli

Go 1.27 or newer. The publisher lives in [markdown-indexer](https://github.com/dentropy/markdown-indexer), package `libs/markdown-tools-cli`. Build that package and name the binary `markdown-indexer-cli`. `go install` cannot build this module.

```sh
git clone https://github.com/dentropy/markdown-indexer.git
cd markdown-indexer/libs/markdown-tools-cli
go build -o markdown-indexer-cli .
install -m 755 markdown-indexer-cli "$(go env GOPATH)/bin/"
export PATH="$(go env GOPATH)/bin:$PATH"
```

# Run the example vault on port 8080

Node.js 20.19 or newer (or 22.12 or newer) and Python 3. From this repository, publish [examples/vault](./examples/vault) and start the reader:

```sh
mkdir -p /tmp/vault-site
markdown-indexer-cli -dir examples/vault -site-dir /tmp/vault-site
ln -sfn manifest.json /tmp/vault-site/directory.json
APP_PORT=8080 DATA_DIR=/tmp/vault-site ./dev.sh
```

Open http://127.0.0.1:8080/.
