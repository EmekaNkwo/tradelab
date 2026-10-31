import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme';
import { accessibilityProblems, type HostNode } from '../../testing/a11y';
import { TextField } from '../ui/TextField';

/** A TextInput whose `focus` can be observed (the test renderer's own input has no imperative focus to spy on). */
const mockFocus = jest.fn();
jest.mock('react-native', () => {
  const rn = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  const Input = React.forwardRef<unknown, Record<string, unknown>>(function MockTextInput(props, ref) {
    React.useImperativeHandle(ref, () => ({ focus: mockFocus }));
    return React.createElement(rn.TextInput, props);
  });
  return new Proxy(rn, { get: (target, key) => (key === 'TextInput' ? Input : target[key as keyof typeof target]) });
});

describe('TextField box', () => {
  it('a tap on the unit or border focuses the input, without adding a control or a focus stop', async () => {
    await render(
      <ThemeProvider preference="light">
        <TextField label="Size (lots)" value="1" onChangeText={() => undefined} testID="size" suffix="lots" size="large" />
      </ThemeProvider>,
    );
    const box = screen.getByTestId('size-box');
    await fireEvent(box, 'responderRelease');
    expect(mockFocus).toHaveBeenCalledTimes(1);
    // Not a pressable, not accessible: the input stays the one stop, with the label and testID.
    expect(box.props.onPress).toBeUndefined();
    expect(box.props.accessible).toBeUndefined();
    expect(box.props.accessibilityRole).toBeUndefined();
    expect(box.props.onStartShouldSetResponder()).toBe(true);
    expect(screen.getByTestId('size').props.accessibilityLabel).toBe('Size (lots)');
    expect(accessibilityProblems(screen.container as unknown as HostNode)).toEqual([]);
  });
});
