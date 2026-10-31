import type { ReactElement, ReactNode } from 'react';
import { FlatList, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme, type Theme } from '../../theme';

interface ListScreenProps<T> {
  readonly data: readonly T[];
  readonly keyExtractor: (item: T) => string;
  readonly renderItem: (item: T, index: number) => ReactElement;
  /** Content above the list (title, actions, filters). */
  readonly header?: ReactNode;
  /** Content below the list (notes, limits). */
  readonly footer?: ReactNode;
  /** Shown instead of the list when `data` is empty. */
  readonly empty?: ReactNode;
  readonly testID?: string;
  /**
   * `group` (default): rows sit in one card-like group. `cards`: each item renders its own Card (e.g. one card per
   * day), stacked with the card gap.
   */
  readonly itemStyle?: 'group' | 'cards';
}

/**
 * A screen whose main content is a list that can grow (journal, glossary, data sets, runs): rows are
 * virtualised by FlatList with stable keys, instead of a ScrollView over a mapped array. Rows sit in one
 * card-like group so the screens look the same as the ScrollView ones.
 */
export function ListScreen<T>({ data, keyExtractor, renderItem, header, footer, empty, testID, itemStyle = 'group' }: ListScreenProps<T>) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const last = data.length - 1;
  return (
    <FlatList
      testID={testID}
      style={[styles.fill, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ padding: spacing.screen }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      data={data}
      keyExtractor={keyExtractor}
      initialNumToRender={20}
      windowSize={11}
      ListHeaderComponent={header ? <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>{header}</View> : undefined}
      ListEmptyComponent={empty ? <>{empty}</> : undefined}
      ListFooterComponent={footer ? <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>{footer}</View> : undefined}
      renderItem={({ item, index }) => (
        <View style={itemStyle === 'cards' ? { marginBottom: index === last ? 0 : spacing.lg } : listGroupItemStyle(theme, index, last)}>
          {renderItem(item, index)}
        </View>
      )}
    />
  );
}

/**
 * One row of the list's card-like group: radius 20 on the first and last rows. Light mode has no hard borders (the
 * white group stands on the tinted background, like Card); dark mode keeps a hairline, like Card.
 */
export function listGroupItemStyle(theme: Theme, index: number, last: number): ViewStyle {
  const { colors, radii, spacing, elevation } = theme;
  const line = elevation.cardBorder ? 1 : 0;
  const first = index === 0;
  const end = index === last;
  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderLeftWidth: line,
    borderRightWidth: line,
    borderTopWidth: first ? line : 0,
    borderBottomWidth: end ? line : 0,
    borderTopLeftRadius: first ? radii.card : 0,
    borderTopRightRadius: first ? radii.card : 0,
    borderBottomLeftRadius: end ? radii.card : 0,
    borderBottomRightRadius: end ? radii.card : 0,
    paddingHorizontal: spacing.lg,
  };
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
