#!/usr/bin/env bash
# Downloads the licensed typefaces (Satoshi, Cabinet Grotesk) from Fontshare into the app.
# They are free under the ITF Free Font License but may not be redistributed, so keep them out of
# public repositories and run this script after cloning. Files are copied unmodified.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for family in satoshi cabinet-grotesk; do
  curl -fsSL -o "$TMP/$family.zip" "https://api.fontshare.com/v2/fonts/download/$family"
  unzip -q -o "$TMP/$family.zip" -d "$TMP/$family"
done
S="$(find "$TMP/satoshi" -maxdepth 1 -type d -name '*_Complete')"
C="$(find "$TMP/cabinet-grotesk" -maxdepth 1 -type d -name '*_Complete')"

FE="$ROOT/frontend/app/fonts"
BE="$ROOT/backend/assets/fonts"
mkdir -p "$FE" "$BE"
cp "$S/Fonts/WEB/fonts/Satoshi-Variable.woff2" "$C/Fonts/WEB/fonts/CabinetGrotesk-Variable.woff2" "$FE/"
cp "$S/Fonts/WEB/fonts/"Satoshi-{Regular,Medium,Bold,Italic}.ttf "$C/Fonts/WEB/fonts/CabinetGrotesk-Extrabold.ttf" "$BE/"
cp "$S/License/FFL.txt" "$FE/LICENSE-ITF-FFL.txt"
cp "$S/License/FFL.txt" "$BE/LICENSE-ITF-FFL.txt"
echo "Fonts installed in $FE and $BE"
