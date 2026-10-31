import type { ComponentType } from 'react';

/**
 * Development builds only. The route gate closes `/dev/gallery` when `__DEV__` is false (shared/routeAccess.ts),
 * and in a release bundle this screen folds to `return null`. The gallery is required lazily inside the `__DEV__`
 * branch, so it is never evaluated in release. Metro still lists the module as a dependency (it collects
 * dependencies before minification folds `__DEV__`), so its code ships but is unreachable: checked with
 * `npx expo export --platform android`.
 */
export default function GalleryScreen() {
  if (!__DEV__) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ComponentGallery } = require('../../components/gallery/ComponentGallery') as { ComponentGallery: ComponentType };
  return <ComponentGallery />;
}
