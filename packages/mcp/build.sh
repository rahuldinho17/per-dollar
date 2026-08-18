#!/usr/bin/env bash
# Assemble the publishable npm package from the repo sources.
set -e
cd "$(dirname "$0")"
cp ../../router/mcp-server.mjs bin.mjs
cp ../../router/engine.mjs ../../router/ledger.mjs .
cp ../../feed/prices.json ../../data/eu-hosts.json .
# the packaged server reads its bundled copies, not repo-relative paths
sed -i.bak 's|join(HERE, "..", "feed", "prices.json")|join(HERE, "prices.json")|; s|join(HERE, "..", "data", "eu-hosts.json")|join(HERE, "eu-hosts.json")|' bin.mjs && rm -f bin.mjs.bak
# mcp-server.mjs already carries a shebang; adding another breaks the module
grep -q '^#!/usr/bin/env node' bin.mjs || sed -i.bak '1s|^|#!/usr/bin/env node\n|' bin.mjs
rm -f bin.mjs.bak
chmod +x bin.mjs
echo "built. publish with: npm publish --access public"
