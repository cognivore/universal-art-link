{
  description = "UAL v2: Multi-tenant browser-only CMS platform";

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
              nodejs_22
              pnpm
              typescript
              postgresql_16
              caddy
              jq
              curl
              git
              shellcheck
              pwgen
              gnupg
              rclone
              dig
              openssl.dev
              openssl
              pkg-config
            ]
            ++ lib.optional (lib.hasAttr system passveil.packages) passveil.packages.${system}.passveil
            ++ lib.optionals stdenv.isLinux [
              docker
              docker-compose
            ]
            ++ lib.optionals stdenv.isDarwin [
              pinentry-curses
            ];
        };

        devShell = self.devShells.${system}.default;
      }
    );
}
