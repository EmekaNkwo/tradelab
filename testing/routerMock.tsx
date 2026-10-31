/**
 * Test-only expo-router stand-in: records navigation and renders <Redirect>
 * as text so tests can assert where a screen sent the learner.
 */
import { Text } from 'react-native';

export const routerMock = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
export const searchParams: { current: Record<string, string> } = { current: {} };
/** The path `usePathname` returns; tests that care set it, and reset puts it back to Home. */
export const pathnameMock: { current: string } = { current: '/home' };
/** Whether the rendered screen is the focused one (`useIsFocused`); tests that blur a screen set it to false. */
export const focusMock: { current: boolean } = { current: true };

export function createRouterModule() {
  return {
    router: routerMock,
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    Stack: { Screen: () => null },
    useLocalSearchParams: () => searchParams.current,
    usePathname: () => pathnameMock.current,
    useIsFocused: () => focusMock.current,
    // A mounted navigator, so code that waits for navigation readiness (TaskNotificationTaps) can run.
    useRootNavigationState: () => ({ key: 'root' }),
  };
}

export function resetRouterMock() {
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
  routerMock.back.mockClear();
  searchParams.current = {};
  pathnameMock.current = '/home';
  focusMock.current = true;
}
