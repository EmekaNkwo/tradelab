import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { ChoiceChips } from '../ChoiceChips';
import { SegmentedControl } from '../SegmentedControl';
import { EmotionPicker } from '../../journal/EmotionPicker';
import { ThemeProvider } from '../../../theme';
import { accessibilityProblems, type HostNode } from '../../../testing/a11y';

const OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

const renderUi = (ui: React.ReactElement) => render(<ThemeProvider preference="light">{ui}</ThemeProvider>);

describe.each([
  ['ChoiceChips', (hideLabel?: boolean) => <ChoiceChips label="Did you follow your rules?" single options={OPTIONS} selected={['yes']} onChange={() => undefined} hideLabel={hideLabel} testIDPrefix="followed" />, 'radio'],
  ['ChoiceChips (multiple)', (hideLabel?: boolean) => <ChoiceChips label="Did you follow your rules?" options={OPTIONS} selected={[]} onChange={() => undefined} hideLabel={hideLabel} />, 'checkbox'],
  ['SegmentedControl', (hideLabel?: boolean) => <SegmentedControl label="Did you follow your rules?" options={OPTIONS} value="yes" onChange={() => undefined} hideLabel={hideLabel} />, 'radio'],
] as const)('%s label', (_name, make, role) => {
  it('is shown as text by default, with no accessibility problems', async () => {
    const view = await renderUi(make());
    expect(screen.getByText('Did you follow your rules?')).toBeTruthy();
    expect(accessibilityProblems(view.container as unknown as HostNode)).toEqual([]);
  });

  it('uses no "list" role: TalkBack maps it to a list it announces but cannot navigate', async () => {
    await renderUi(make());
    expect(screen.container.queryAll((n) => n.props.accessibilityRole === 'list' || n.props.role === 'list')).toEqual([]);
  });

  it('names the group and tells each option which group it is in (TalkBack does not read a plain View’s label)', async () => {
    await renderUi(make());
    expect(screen.getByLabelText('Did you follow your rules?', { exact: true })).toBeTruthy();
    const options = screen.getAllByRole(role);
    expect(options.map((o) => o.props.accessibilityLabel)).toEqual(['Yes', 'No']);
    for (const o of options) expect(o.props.accessibilityHint).toBe('Did you follow your rules?');
  });

  it('hideLabel keeps the label for screen readers only', async () => {
    const view = await renderUi(make(true));
    expect(screen.queryByText('Did you follow your rules?')).toBeNull();
    for (const o of screen.getAllByRole(role)) expect(o.props.accessibilityHint).toBe('Did you follow your rules?');
    expect(accessibilityProblems(view.container as unknown as HostNode)).toEqual([]);
  });
});

it('keeps the option testIDs and still reports changes', async () => {
  const onChange = jest.fn();
  await renderUi(<ChoiceChips label="Followed" single options={OPTIONS} selected={[]} onChange={onChange} testIDPrefix="followed" />);
  await fireEvent.press(screen.getByTestId('followed-no'));
  expect(onChange).toHaveBeenCalledWith(['no']);
});

it('names the three 1–5 rating rows on screen (device test: they had no names)', async () => {
  await renderUi(<EmotionPicker value={null} onChange={() => undefined} />);
  for (const name of ['Confidence', 'Stress', 'Patience']) expect(screen.getByText(`${name} (1 low, 5 high)`)).toBeTruthy();
});

describe('ChoiceChips layout', () => {
  const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {};

  it('keeps short options as pills and makes a long option a full-width rounded row with room to wrap', async () => {
    await render(
      <ThemeProvider preference="light">
        <ChoiceChips
          label="Market"
          single
          options={[
            { value: 'fx', label: 'Forex' },
            { value: 'long', label: 'I understand this is simulated practice only' },
          ]}
          selected={['fx']}
          onChange={() => undefined}
          testIDPrefix="m"
        />
      </ThemeProvider>,
    );
    const short = flat(screen.getByTestId('m-fx'));
    const long = flat(screen.getByTestId('m-long'));
    expect(short.borderRadius).toBe(999);
    expect(short.paddingVertical).toBeGreaterThan(0);
    expect(long.borderRadius).toBe(16);
    expect(long.width).toBe('100%');
    expect(long.paddingVertical).toBeGreaterThanOrEqual(12);
    expect(screen.getByText('✓ Forex')).toBeTruthy();
  });
});
