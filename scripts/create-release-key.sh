#!/usr/bin/env bash
# Creates the owner's local release signing key, once, outside the repo:
#   key:       ~/.tradelab/tradelab-release.keystore
#   passwords: ~/.gradle/gradle.properties (TRADELAB_RELEASE_*), read by plugins/withReleaseSigning.js
# Back up both files: the password exists only in gradle.properties, and an app signed with this key
# can only be updated by builds signed with the same key.
set -euo pipefail
umask 077

KEY_DIR="$HOME/.tradelab"
KEY="$KEY_DIR/tradelab-release.keystore"
PROPS="$HOME/.gradle/gradle.properties"

if [ -e "$KEY" ]; then
  echo "A key already exists at $KEY; not overwriting it." >&2
  echo "If $PROPS has no TRADELAB_RELEASE_* entries, that key is unusable (an interrupted run): delete it and run this again." >&2
  exit 1
fi
if [ -f "$PROPS" ] && grep -q '^TRADELAB_RELEASE_' "$PROPS"; then
  echo "$PROPS already has TRADELAB_RELEASE_* entries; remove them first." >&2
  exit 1
fi

mkdir -p "$KEY_DIR" "$(dirname "$PROPS")"
chmod 700 "$KEY_DIR"
# Next to the key, so the final mv is an atomic rename on the same volume.
WORK="$(mktemp -d "$KEY_DIR/.tmp.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# Passed to keytool through a private file, not its arguments or environment.
PW="$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)"
printf '%s' "$PW" > "$WORK/pw"
keytool -genkeypair -storetype PKCS12 -keystore "$WORK/key" -alias tradelab -keyalg RSA -keysize 2048 \
  -validity 10000 -storepass:file "$WORK/pw" -keypass:file "$WORK/pw" -dname "CN=TradeLab, O=TradeLab" >/dev/null

BLOCK="$(printf '\n# TradeLab local release signing (key: %s)\nTRADELAB_RELEASE_STORE_FILE=%s\nTRADELAB_RELEASE_STORE_PASSWORD=%s\nTRADELAB_RELEASE_KEY_ALIAS=tradelab\nTRADELAB_RELEASE_KEY_PASSWORD=%s\n' "$KEY" "$KEY" "$PW" "$PW")"
unset PW

# Both land together at the end, so an interrupted run leaves neither behind.
[ -f "$PROPS" ] && chmod 600 "$PROPS"
mv "$WORK/key" "$KEY"
printf '%s\n' "$BLOCK" >> "$PROPS"
chmod 600 "$KEY" "$PROPS"
unset BLOCK

echo "Created $KEY and added its settings to $PROPS (passwords not shown)."
echo "Back up both files somewhere safe: the password exists only in $PROPS."
