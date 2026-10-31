import { router } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { isRouteEnabled, routePathFromName } from '../../shared/routeAccess';
import { EmptyState, Screen } from '../ui';

interface RouteGateProps {
  /** URL path of the screen, e.g. `/labs/concept/[id]`. */
  readonly path: string;
  readonly children: ReactNode;
}

/** Shown in place of a screen whose feature is off in this build (spec §37.1), including after a deep link. */
export function FeatureUnavailable() {
  return (
    <Screen testID="feature-unavailable">
      <EmptyState
        title="Not available"
        body="This part of TradeLab is not in this version of the app."
        actionLabel="Go to Home"
        onAction={() => router.replace('/home')}
      />
    </Screen>
  );
}

/** Renders the screen only when every feature its route needs is on. */
export function RouteGate({ path, children }: RouteGateProps) {
  return isRouteEnabled(path) ? <>{children}</> : <FeatureUnavailable />;
}

interface ScreenLayoutArgs {
  readonly route: { readonly name: string };
  readonly children: ReactElement;
}

/**
 * One gate for every screen of a navigator: pass the result as the navigator's `screenLayout`.
 * `base` is the URL path the navigator lives under (`''` for the root stack, `/more` for the More tab).
 */
export function gatedScreenLayout(base: string): (args: ScreenLayoutArgs) => ReactElement {
  return function GatedScreen({ route, children }: ScreenLayoutArgs) {
    return <RouteGate path={routePathFromName(base, route.name)}>{children}</RouteGate>;
  };
}
