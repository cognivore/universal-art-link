{
  description = "Flake for building LLM-SEO project with Rust, OpenSSL and multi-platform (Linux + macOS) support";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
    passveil.url = "github:doma-engineering/passveil";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      passveil,
      ...
    }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-darwin" "x86_64-darwin" ] (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
        lib = pkgs.lib;
      in
      {

        devShells.default = pkgs.mkShell {
          buildInputs =
            with pkgs;
            [
              rustc
              cargo
              rustfmt
              clippy
              rust-analyzer
              shellcheck
              sqlx-cli
              postgresql
              sqlite
              nodejs
              pnpm
              zip
              unzip
              rsync
              pkg-config
              openssl.dev
              openssl
              pwgen
              darcs
              gnupg
              rclone
              csvlens
              jq
              act
              jq
              curl
              git
              asciinema
              awscli2
              ssm-session-manager-plugin
              grafana-loki
              ansible
              terraform
              oils-for-unix  # YSH shell for deployment scripts
              hcloud         # Hetzner Cloud CLI
              dig            # DNS lookups
            ]
            ++ lib.optional (lib.hasAttr system passveil.packages) passveil.packages.${system}.passveil
            ++ lib.optionals stdenv.isLinux [
              chromedriver
              chromium
              xvfb-run
              docker
              docker-compose
              bmon
            ]
            ++ lib.optionals stdenv.isDarwin [
              pinentry-curses
              chromedriver
            ];

          # rust-analyzer needs the std source tree
          RUST_SRC_PATH = "${pkgs.rust.packages.stable.rustPlatform.rustLibSrc}";
        };

        devShell = self.devShells.${system}.default;
      }
    );
}
