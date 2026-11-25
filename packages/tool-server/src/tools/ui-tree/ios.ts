import type { DeviceInfo, Registry } from "@argent/registry";
import {
  axServiceRef,
  type AXDescribeResponse,
  type AXServiceApi,
  type AXTreeNode,
  type AXTreeResponse,
} from "../../blueprints/ax-service";
import type { DescribeFrame } from "../describe/contract";
import { mapNativeTraitsToDescribeRole } from "../describe/platforms/ios/ios-native-adapter";
import type { UiTree, UiTreeNode } from "./index";
import { isTurned, nativeFrameToUi, uiScreenSize } from "../../utils/ui-orientation";
import { noteUiOrientation } from "../../utils/ios-ui-orientation";

// What an ax-service older than `treeVersion` 2 does not send. `hidden`
// comes from frames, so every version reports it.
const LEGACY_UNSUPPORTED_FIELDS = [
  "type",
  "password",
  "placeholder",
  "hintShowing",
  "bundleId",
  "foregroundApp",
];

// XCUIElementType, by value, as XCTest names it.
const ELEMENT_TYPES = [
  "Any",
  "Other",
  "Application",
  "Group",
  "Window",
  "Sheet",
  "Drawer",
  "Alert",
  "Dialog",
  "Button",
  "RadioButton",
  "RadioGroup",
  "CheckBox",
  "DisclosureTriangle",
  "PopUpButton",
  "ComboBox",
  "MenuButton",
  "ToolbarButton",
  "Popover",
  "Keyboard",
  "Key",
  "NavigationBar",
  "TabBar",
  "TabGroup",
  "Toolbar",
  "StatusBar",
  "Table",
  "TableRow",
  "TableColumn",
  "Outline",
  "OutlineRow",
  "Browser",
  "CollectionView",
  "Slider",
  "PageIndicator",
  "ProgressIndicator",
  "ActivityIndicator",
  "SegmentedControl",
  "Picker",
  "PickerWheel",
  "Switch",
  "Toggle",
  "Link",
  "Image",
  "Icon",
  "SearchField",
  "ScrollView",
  "ScrollBar",
  "StaticText",
  "TextField",
  "SecureTextField",
  "DatePicker",
  "TextView",
  "Menu",
  "MenuItem",
  "MenuBar",
  "MenuBarItem",
  "Map",
  "WebView",
  "IncrementArrow",
  "DecrementArrow",
  "Timeline",
  "RatingIndicator",
  "ValueIndicator",
  "SplitGroup",
  "Splitter",
  "RelevanceIndicator",
  "ColorWell",
  "HelpTag",
  "Matte",
  "DockItem",
  "Ruler",
  "RulerMarker",
  "Grid",
  "LevelIndicator",
  "Cell",
  "LayoutArea",
  "LayoutItem",
  "Handle",
  "Stepper",
  "Tab",
  "TouchBar",
  "StatusItem",
];

const FULL_SCREEN: DescribeFrame = { x: 0, y: 0, width: 1, height: 1 };

function intersect(a: DescribeFrame, b: DescribeFrame): DescribeFrame | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}

/**
 * A node is hidden when no part of its frame is on screen inside every framed
 * ancestor: scrolled out, or clipped by a scroll view. AX's own visibility
 * attribute costs the app milliseconds per node, and it agrees with this.
 */
function markHidden(node: UiTreeNode, clip: DescribeFrame | undefined): void {
  let inner = clip;
  if (node.frame) {
    inner = clip && intersect(node.frame, clip);
    if (!inner) node.hidden = true;
  }
  for (const child of node.children) markHidden(child, inner);
}

// Both commands frame an element from the same AX answer, so a shared element's frames agree.
const SAME_FRAME = 1e-3;

function sameFrame(a: DescribeFrame | undefined, b: DescribeFrame): boolean {
  return (
    a !== undefined &&
    Math.abs(a.x - b.x) < SAME_FRAME &&
    Math.abs(a.y - b.y) < SAME_FRAME &&
    Math.abs(a.width - b.width) < SAME_FRAME &&
    Math.abs(a.height - b.height) < SAME_FRAME
  );
}

/**
 * The tree's nodes plus the on-screen `describe` elements the native walk
 * missed, such as a context menu's full-screen "Dismiss context menu" button,
 * as children of the front app's root after its own. Neither command orders
 * them by depth, so no node is marked covered by them. While a system alert
 * shows, an element could belong to either root, so nothing is added.
 */
function withDescribeOnly(response: AXTreeResponse, described: AXDescribeResponse): AXTreeNode[] {
  const { nodes } = response;
  const app =
    nodes.find((n) => n.bundleId !== undefined && n.bundleId === response.foregroundApp) ??
    nodes[0];
  if (!app || response.alertVisible) return nodes;
  const role = (traits: string[] | undefined) => mapNativeTraitsToDescribeRole(traits ?? []);
  let index = nodes.reduce((max, n) => Math.max(max, n.index), 0);
  const added = described.elements.flatMap(({ hint: _hint, ...el }) => {
    const { frame } = el;
    if (!frame || frame.width <= 0 || frame.height <= 0) return [];
    const inTree = nodes.some(
      (n) => n.label === el.label && role(n.traits) === role(el.traits) && sameFrame(n.frame, frame)
    );
    return inTree ? [] : [{ ...el, index: ++index, parentIndex: app.index }];
  });
  return added.length > 0 ? [...nodes, ...added] : nodes;
}

/**
 * Nests the daemon's document-order nodes by `parentIndex`; a node whose parent is missing becomes a root.
 *
 * The daemon frames on the screen's portrait-native axes; the tree comes out in
 * the UI's upright space, as `describe` does (`utils/ios-ui-orientation.ts`),
 * turned by the orientation the daemon reported with it, and the screen size
 * with it. A daemon that predates the orientation leaves both native.
 * `described`, the same screen's `describe` answer, fills in what the walk missed.
 */
export function adaptAxTree(response: AXTreeResponse, described?: AXDescribeResponse): UiTree {
  const orientation = response.interfaceOrientation;
  const turn = (frame: DescribeFrame | undefined): DescribeFrame | undefined =>
    frame && isTurned(orientation) ? nativeFrameToUi(frame, orientation) : frame;
  const byIndex = new Map<number, UiTreeNode>();
  const roots: UiTreeNode[] = [];
  let keyboardVisible = false;
  const nodes = described ? withDescribeOnly(response, described) : response.nodes;
  for (const raw of nodes) {
    const traits = raw.traits ?? [];
    const has = (name: string) => traits.includes(name);
    if (has("keyboardKey")) keyboardVisible = true;
    const node: UiTreeNode = {
      role: mapNativeTraitsToDescribeRole(traits),
      label: raw.label,
      // AX answers an empty input's placeholder as its value.
      value: raw.hintShowing ? undefined : raw.value,
      identifier: raw.identifier,
      roleDescription: raw.roleDescription,
      frame: turn(raw.frame),
      children: [],
    };
    // AX answers 0 (Any, a query wildcard) for a plain container; XCTest reports it as Other.
    if (raw.elementType !== undefined)
      node.type =
        raw.elementType === 0
          ? "Other"
          : (ELEMENT_TYPES[raw.elementType] ?? String(raw.elementType));
    if (traits.length > 0) node.traits = traits;
    if (raw.bundleId) node.bundleId = raw.bundleId;
    if (has("header")) node.heading = true;
    if (has("notEnabled")) node.disabled = true;
    if (has("selected")) node.selected = true;
    if (has("isEditing")) node.focused = true;
    if (has("textEntry") || has("searchField")) node.editable = true;
    if (has("secureTextEntry")) node.password = true;
    if (raw.placeholder) node.placeholder = raw.placeholder;
    if (raw.hintShowing) node.hintShowing = true;
    if (has("toggleButton") && (raw.value === "1" || raw.value === "0")) {
      node.checked = raw.value === "1";
    }
    if (raw.covered) node.covered = true;
    const parent = raw.parentIndex === undefined ? undefined : byIndex.get(raw.parentIndex);
    byIndex.set(raw.index, node);
    (parent ? parent.children : roots).push(node);
  }
  for (const root of roots) markHidden(root, FULL_SCREEN);
  return {
    schemaVersion: 1,
    source: "ax-service",
    screen: response.screenFrame && uiScreenSize(response.screenFrame, orientation),
    roots,
    truncated: response.truncated,
    alertVisible: response.alertVisible,
    // A truncated walk may have cut the keyboard, so absence is unknown there.
    keyboardVisible: keyboardVisible || (response.truncated ? undefined : false),
    foregroundApp: response.foregroundApp,
    unsupportedFields: (response.treeVersion ?? 1) >= 2 ? [] : LEGACY_UNSUPPORTED_FIELDS,
  };
}

export async function readIosUiTree(registry: Registry, device: DeviceInfo): Promise<UiTree> {
  const ref = axServiceRef(device);
  const ax = await registry.resolveService<AXServiceApi>(ref.urn, ref.options);
  const response = await ax.tree();
  noteUiOrientation(device.id, response.interfaceOrientation, response.screenFrame);
  // The tree stands without it: a failed describe adds nothing.
  const described = await ax.describe().catch(() => undefined);
  return adaptAxTree(response, described);
}
