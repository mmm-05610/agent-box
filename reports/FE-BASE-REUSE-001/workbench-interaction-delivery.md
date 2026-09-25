# Workbench interaction delivery

Date: 2026-09-22. Source baseline: desktop-minimal, 668aecff41.

## Scope and implementation

Compact toolbar, left activity rail (utility entries at the bottom), panel headers and status bar replace the oversized initial layout. The Electron application menu is hidden by default and remains accessible with Alt.

The workbench privately reuses react-resizable-panels 4.13.2 (MIT): https://github.com/bvaughn/react-resizable-panels . Its license is copied alongside the built extension. Host API remains v2; layout behavior remains in the workbench extension.

- Pointer and keyboard resizing of horizontal and vertical regions.
- Collapse/reopen auxiliary regions, restoring their previous sizes; empty regions occupy no space.
- Double-click separators to restore default size; toolbar action resets layout.
- Drag view tabs between regions, including empty destinations; a Move menu provides an alternative.
- Stable portal containers preserve mounted component state when moving or folding a view.
- Navigation contributions optionally declare section and icon; settings uses the utility section without an ID-specific workbench exception.

## Verification

Typecheck, build, diff check and 42 unit tests passed. Real Electron foundation, nine extension regression cases and empty-host smoke passed.

Real Electron measurements: left width 255.203125 → pointer resize 335.203125 → keyboard resize 393.203125; collapsed width 0; reopened width 393.203125. Bottom height 175.921875 → 225.921875. All eight layout checks passed, including movement/reset preserving a counter value of 1.

Native Chromium dragstart and DataTransfer were exercised. Under Xvfb, CDP intercepts and completes the OS drag loop. This is not a claim of physical desktop input testing. An actual drag cancellation defect was found and fixed: defer target-overlay rendering until Chromium has created its drag preview.

Screenshot inspected: /tmp/ordessa-layout-final.png (temporary demonstration configuration, not installed into user settings).

## Boundaries

Layout state lasts for the current window only; no restart persistence, floating windows or arbitrary nested splits in this increment. Closing or switching the active view retains the existing unmount semantics. No backend changes, user configuration changes, credential access, publishing push, or user service restarts.

npm audit reports four advisories in existing Electron/extract-zip and Vitest/mocker dependency chains (two high, two moderate). The added panel library is not named in those findings. Existing dependencies were not force-upgraded; this is not a security-clearance claim.
