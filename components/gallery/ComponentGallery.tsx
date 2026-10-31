import { ScrollView, View } from 'react-native';
import { ThemeProvider, useTheme } from '../../theme';
import { GallerySections } from './GallerySections';

export const GALLERY_COLUMN_WIDTH = 380;

/**
 * Dev-only gallery: every shared component in light and dark side by side. Scroll down for components and
 * sideways to compare the two themes.
 */
export function ComponentGallery() {
  const { colors } = useTheme();
  return (
    <ScrollView testID="component-gallery" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView horizontal>
        <View style={{ flexDirection: 'row' }}>
          {(['light', 'dark'] as const).map((scheme) => (
            <View key={scheme} testID={`gallery-${scheme}`} style={{ width: GALLERY_COLUMN_WIDTH }}>
              <ThemeProvider preference={scheme}>
                <GallerySections />
              </ThemeProvider>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
