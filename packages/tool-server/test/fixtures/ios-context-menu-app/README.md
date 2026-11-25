# iOS context menu: `ui-tree` misses an element `describe` lists

A one-screen iOS app that reproduces a gap between the ax-service's `tree`
and `describe` commands. With a native context menu open, `describe` lists a
full-screen `AXButton "Dismiss context menu"`. The `tree` answer, and so
`ui-tree`, has no node for it. The menu's own items are in both.

The app has two menus that behave the same way:

- **UIKit menu**: a `UIButton` with `showsMenuAsPrimaryAction`.
- **More actions**: a SwiftUI `Menu` in a `UIHostingController`. This is what
  `@expo/ui`'s `ContextMenu` renders in a React Native app.

## Reproduce

Needs Xcode and a booted iOS simulator. Recorded on iOS 27.0, iPhone 18 Pro,
Argent 0.34.0 and `main` at f0dea93a2.

```sh
./build.sh <udid>
argent run launch-app --udid <udid> --bundleId com.argent.menufixture
argent run describe --udid <udid>          # frame of "More actions"
argent run gesture-tap --udid <udid> --x <centre x> --y <centre y>
argent run describe --udid <udid>          # lists "Dismiss context menu"
argent run ui-tree --udid <udid> --json    # no "Dismiss context menu" node
```

## Recorded answers

With the SwiftUI menu open, the raw ax-service answers:

- `tree-menu-open.json`: `tree`, 50 nodes in one root (`com.argent.menufixture`).
  The menu's items are under the app's `Application` node.
- `describe-menu-open.json`: `describe`, 15 elements. "Dismiss context menu"
  (`traits: ["button"]`, frame `0,0,1,1`) is the only one with no node in `tree`.
  Every other element has a node with the same label, traits, identifier and frame.
