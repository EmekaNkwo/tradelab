import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme';
import { Button } from '../Button';
import { Notice } from '../Notice';

const inTheme = (ui: React.ReactElement) => render(<ThemeProvider preference="light">{ui}</ThemeProvider>);
/** The Notice container is a plain View with a role (not focusable on its own), so query the host tree. */
const roleView = (role: string) => screen.container.queryAll((n) => n.props.accessibilityRole === role)[0]!;

describe('Notice live region', () => {
  it('is quiet by default, so static disclosures and warnings do not speak on mount', async () => {
    await inTheme(
      <Notice title="Risk warning" tone="warning">
        Static text
      </Notice>,
    );
    expect(roleView('alert')).not.toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('announces when marked live, for the result of an action', async () => {
    await inTheme(
      <Notice title="Backup created" tone="success" live>
        Saved
      </Notice>,
    );
    expect(roleView('summary')).toHaveProp('accessibilityLiveRegion', 'polite');
  });
});

describe('Notice look', () => {
  it.each(['info', 'warning', 'success'] as const)('is a tinted box with a tone icon and no side stripe (%s)', async (tone) => {
    await inTheme(
      <Notice title="Heads up" tone={tone}>
        Body
      </Notice>,
    );
    const box = roleView(tone === 'warning' ? 'alert' : 'summary');
    const style = Array.isArray(box.props.style) ? Object.assign({}, ...box.props.style) : box.props.style;
    expect(style.borderLeftWidth).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
    expect(style.flexDirection).toBe('row');
    // The icon is decoration: hidden from screen readers, so the title is still read first.
    const icons = screen.container.queryAll((n) => n.props.importantForAccessibility === 'no-hide-descendants');
    expect(icons.length).toBeGreaterThan(0);
    expect(screen.getByText('Heads up')).toBeTruthy();
  });
});

describe('Button disabled reason', () => {
  it('shows the reason once, as visible text a screen reader reaches next to the button, not repeated as a hint', async () => {
    await inTheme(<Button label="Save" onPress={() => undefined} disabled disabledReason="Write a note first." />);
    const button = screen.getByRole('button');
    expect(button).toHaveProp('accessibilityLabel', 'Save');
    expect(button.props.accessibilityHint).toBeUndefined();
    const caption = screen.getByText('Write a note first.');
    expect(caption).not.toHaveProp('importantForAccessibility', 'no');
    expect(caption).not.toHaveProp('accessibilityElementsHidden', true);
  });

  it('keeps its own hint and label when enabled or only busy', async () => {
    await inTheme(<Button label="Save" onPress={() => undefined} busy disabledReason="Write a note first." accessibilityHint="Saves it" />);
    expect(screen.getByRole('button')).toHaveProp('accessibilityLabel', 'Save');
    expect(screen.getByRole('button')).toHaveProp('accessibilityHint', 'Saves it');
    expect(screen.queryByText('Write a note first.')).toBeNull();
  });
});
