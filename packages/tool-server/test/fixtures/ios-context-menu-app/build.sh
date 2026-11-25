#!/bin/sh
# Builds the app with swiftc (no Xcode project) and installs it on a booted
# simulator. Usage: ./build.sh <simulator-udid>
set -eu
udid="${1:?usage: build.sh <simulator-udid>}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)/MenuFixture.app"
mkdir -p "$out"
cp "$here/Info.plist" "$out/Info.plist"
xcrun -sdk iphonesimulator swiftc -parse-as-library \
  -target arm64-apple-ios26.0-simulator "$here/main.swift" -o "$out/MenuFixture"
codesign -s - --force "$out"
xcrun simctl install "$udid" "$out"
echo "Installed com.argent.menufixture on $udid"
