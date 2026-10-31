import { Pressable, StyleSheet, View } from 'react-native';
import { latestViewport, pan, zoom, type Viewport } from '../../features/practice';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from '../ui';

interface ChartControlsProps {
  readonly viewport: Viewport;
  readonly total: number;
  readonly onChange: (v: Viewport) => void;
}

/** Zoom and pan by button (pill buttons on the muted surface, brief §5.4): large targets, and usable with a screen reader where gestures are not. */
export function ChartControls({ viewport, total, onChange }: ChartControlsProps) {
  const { colors, spacing, radii } = useTheme();
  const step = Math.max(1, Math.round(viewport.count / 4));
  const centre = viewport.start + viewport.count / 2;
  const buttons = [
    { label: 'Older', a11y: 'Show older candles', run: () => pan(viewport, -step, total) },
    { label: 'Zoom out', a11y: 'Zoom out', run: () => zoom(viewport, 0.66, centre, total) },
    { label: 'Zoom in', a11y: 'Zoom in', run: () => zoom(viewport, 1.5, centre, total) },
    { label: 'Newer', a11y: 'Show newer candles', run: () => pan(viewport, step, total) },
    { label: 'Latest', a11y: 'Jump to the latest candle', run: () => latestViewport(total, viewport.count) },
  ];
  return (
    <View style={[styles.row, { gap: spacing.xs }]}>
      {buttons.map((b) => (
        <Pressable
          key={b.label}
          accessibilityRole="button"
          accessibilityLabel={b.a11y}
          onPress={() => onChange(b.run())}
          style={({ pressed }) => [styles.button, { borderRadius: radii.pill, backgroundColor: pressed ? colors.brandTint : colors.surfaceMuted }]}
        >
          <AppText variant="caption" color="textPrimary">
            {b.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  button: { minHeight: touchTarget, minWidth: 56, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
});
