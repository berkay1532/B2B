{
  description = "Stellar Pro Hackathon";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    crane.url = "github:ipetkov/crane";

    flake-utils.url = "github:numtide/flake-utils";

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      crane,
      flake-utils,
      rust-overlay,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        inherit (pkgs) lib;

        craneLib = (crane.mkLib pkgs).overrideToolchain (p: p.rust-bin.stable.latest.default.override {
          # extensions = [ "rust-src" ];
          targets = [ "wasm32v1-none" ];
        });
        src = craneLib.cleanCargoSource ./.;

        commonArgs = {
          inherit src;
          strictDeps = true;

          cargoExtraArgs = "-p stellar-cli -p soroban-cli";
        };

        cargoArtifacts = craneLib.buildDepsOnly commonArgs;

        orbital-soroban = craneLib.buildPackage (
          commonArgs
          // {
            inherit cargoArtifacts;
          }
        );

        stellar-cli = craneLib.buildPackage {
          src = pkgs.fetchgit {
            url = "https://github.com/stellar/stellar-cli";
            hash = "sha256-NTEwTJZ7HGxdRYRi7xvmrrPYV57JeUL26L8xJnKyDfo=";
          };

          nativeBuildInputs = [
            pkgs.pkg-config
          ];

          buildInputs = [
            # pkgs.dbus.lib
            pkgs.dbus
            pkgs.udev
          ];

          doCheck = false;

          GIT_REVISION="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        };
      in
      {
        checks = {
          inherit orbital-soroban;

          orbital-soroban-toml-fmt = craneLib.taploFmt {
            src = pkgs.lib.sources.sourceFilesBySuffices src [ ".toml" ];
          };

          orbital-soroban-nextest = craneLib.cargoNextest (
            commonArgs
            // {
              inherit cargoArtifacts;
              partitions = 1;
              partitionType = "count";
              cargoNextestPartitionsExtraArgs = "--no-tests=pass";
            }
          );
        };

        packages = {
          inherit stellar-cli;
          default = orbital-soroban;
        };

        devShells.default = craneLib.devShell {
          checks = self.checks.${system};

          packages = [
            stellar-cli
            (pkgs.rust-bin.stable.latest.default.override {
              extensions = [ "rustc" "clippy" "rust-src" "rust-analyzer" ];
              targets = [ "wasm32v1-none" ];
            })
          ];
        };
      }
    );
}
