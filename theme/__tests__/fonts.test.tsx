import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AppText } from '../../components/ui/AppText';
import { resolveFontFamily } from '../fonts';
import { lightTheme } from '../palettes';
import { textStyle } from '../textStyles';
import { ThemeProvider } from '../ThemeContext';

describe('bundled font', () => {
  it('uses the embedded family when the build has it (Android or iOS name)', () => {
    expect(resolveFontFamily(() => ['Roboto', 'PlusJakartaSans'])).toBe('PlusJakartaSans');
    expect(resolveFontFamily(() => ['Plus Jakarta Sans'])).toBe('Plus Jakarta Sans');
  });

  it('falls back to the system font when it is not embedded (Expo Go, tests)', () => {
    expect(resolveFontFamily(() => [])).toBeUndefined();
    expect(resolveFontFamily()).toBeUndefined();
  });

  it('adds the family to a typography variant only when there is one', () => {
    expect(textStyle(lightTheme, 'body')).toEqual({ fontSize: 15, lineHeight: 22, fontWeight: '400' });
    expect(textStyle({ ...lightTheme, fontFamily: 'PlusJakartaSans' }, 'display')).toEqual({ fontSize: 32, lineHeight: 40, fontWeight: '700', fontFamily: 'PlusJakartaSans' });
  });

  it('AppText draws in the theme family, with tabular digits on request', async () => {
    await render(
      <ThemeProvider preference="light" fontFamily="PlusJakartaSans">
        <AppText tabular>42</AppText>
      </ThemeProvider>,
    );
    const style = StyleSheet.flatten(screen.getByText('42').props.style);
    expect(style.fontFamily).toBe('PlusJakartaSans');
    expect(style.fontVariant).toEqual(['tabular-nums']);
  });
});
