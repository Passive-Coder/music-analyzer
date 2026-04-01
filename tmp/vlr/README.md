# Visualizer + Lyrics Reuse Bundle

This folder is a portability snapshot of the current music visualizer and lyrics flow, extracted so it can be copied back into the fork after you sync from the main repo.

Contents:

- `NoteScene.tsx`
  Current 3D scene component. This is the present implementation that contains the note scene plus the sphere/particle visualizer scaffolding.
- `LyricsOverlay.tsx`
  Time-synced lyrics overlay UI.
- `lyrics.ts`
  LRCLIB fetch + parse helpers for synced lyrics.
- `audioManager.ts`
  Minimal audio manager dependency used by the overlay and the example flow.
- `VisualizeExperience.tsx`
  A small reusable controller example showing how the scene, audio manager, and lyrics flow fit together.
- `visualizer-lyrics.css`
  The CSS slice these pieces rely on.

Suggested re-import order after sync:

1. Copy `audioManager.ts`
2. Copy `lyrics.ts`
3. Copy `LyricsOverlay.tsx`
4. Copy `NoteScene.tsx`
5. Merge `visualizer-lyrics.css` into your stylesheet
6. Use `VisualizeExperience.tsx` as a reference when wiring the new fork

Notes:

- This is an extraction of the current implementation, not a cleaned library package.
- `NoteScene.tsx` is intentionally preserved close to the current app state so you do not lose any visual behavior while syncing.
- If you want, after the sync I can help split `NoteScene.tsx` into a true `SphereVisualizerScene` plus smaller helpers.
