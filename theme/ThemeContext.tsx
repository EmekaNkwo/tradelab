import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemePreference } from '../shared/types';
import { resolveFontFamily } from './fonts';
import { darkTheme, lightTheme } from './palettes';
import type { Theme } from './tokens';

const ThemeContext = createContext<Theme>(lightTheme);

export function resolveTheme(preference: ThemePreference, systemScheme: 'light' | 'dark' | null | undefined): Theme {
  const scheme = preference === 'system' ? (systemScheme ?? 'light') : preference;
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** Read once: embedded fonts are registered before JS starts, and the answer cannot change while running. */
const bundledFontFamily = resolveFontFamily();

interface ThemeProviderProps {
  readonly preference: ThemePreference;
  readonly children: ReactNode;
  /** Tests and the component gallery pass a family (or undefined) instead of asking the native font module. */
  readonly fontFamily?: string | undefined;
}

export function ThemeProvider({ preference, children, ...rest }: ThemeProviderProps) {
  const system = useColorScheme();
  const fontFamily = 'fontFamily' in rest ? rest.fontFamily : bundledFontFamily;
  const theme = useMemo(() => ({ ...resolveTheme(preference, system), fontFamily }), [preference, system, fontFamily]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
