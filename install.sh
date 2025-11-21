#!/usr/bin/env bash
set -e

# UAL installer script
# Installs the CLI to ~/.local/bin (XDG standard)

INSTALL_DIR="${HOME}/.local/bin"
UAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing Universal Artistic Link..."

# Ensure build exists
if [ ! -d "$UAL_ROOT/build" ]; then
  echo "Error: build/ directory not found."
  echo "Please run: pnpm build"
  exit 1
fi

# Create install directory
mkdir -p "$INSTALL_DIR"

# Find node (prefer nix, fallback to system)
if command -v nix > /dev/null 2>&1; then
  NODE_PATH="$(nix eval --raw nixpkgs#nodejs.outPath)/bin/node"
elif command -v node > /dev/null 2>&1; then
  NODE_PATH="$(command -v node)"
else
  echo "Error: node not found. Install nodejs."
  exit 1
fi

# Create wrapper script
cat > "$INSTALL_DIR/universal-art-link" << EOF
#!/usr/bin/env bash
exec "$NODE_PATH" "$UAL_ROOT/build/cli.js" "\$@"
EOF

chmod +x "$INSTALL_DIR/universal-art-link"

echo "✓ Installed to $INSTALL_DIR/universal-art-link"
echo ""

# Check if in PATH
if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
  echo "✓ $INSTALL_DIR is already in your PATH"
else
  echo "⚠ Add $INSTALL_DIR to your PATH:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
  echo "Add to ~/.zshrc to make it permanent"
fi

echo ""
echo "Test it:"
echo "  universal-art-link --version"

