import { useRef } from 'react';
import { TextInput, View, type TextInputInstance } from 'react-native';
import { textStyle, touchTarget, useTheme } from '../../theme';
import { AppText } from './AppText';

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly error?: string | null;
  readonly testID?: string;
  /** Extra guidance read by screen readers with the field. */
  readonly hint?: string;
  readonly keyboardType?: 'default' | 'decimal-pad' | 'numbers-and-punctuation';
  readonly autoCapitalize?: 'none' | 'characters' | 'sentences';
  /** Hides what is typed and turns off autocorrect and suggestions, e.g. for API keys. */
  readonly secret?: boolean;
  /** A unit shown inside the field on the right, e.g. "lots" or "%". Screen readers hear it in the hint. */
  readonly suffix?: string | null;
  /** `large`: a taller field with heading-size text (calculator inputs, brief §5.7). */
  readonly size?: 'regular' | 'large';
}

/** The spoken hint: the guidance, then the unit when the field shows one. */
export function fieldHint(hint: string | undefined, suffix: string | null | undefined): string | undefined {
  if (!suffix) return hint;
  const unit = `Unit: ${suffix}.`;
  return hint ? `${hint}. ${unit}` : unit;
}

const LARGE_FIELD_HEIGHT = 56;

export function TextField({ label, value, onChangeText, placeholder, multiline = false, maxLength, error, testID, keyboardType = 'default', autoCapitalize, hint, secret = false, suffix, size = 'regular' }: TextFieldProps) {
  const theme = useTheme();
  const { colors, radii, spacing } = theme;
  const large = size === 'large';
  const input = useRef<TextInputInstance>(null);
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      {/*
        The box takes taps on the unit and the border and focuses the input. A responder, not a Pressable: it is
        not a control of its own, so it adds no focus stop or role, and taps on the input itself go to the input
        (the deepest responder wins). A drag that becomes a scroll is handed to the ScrollView and focuses nothing.
      */}
      <View
        testID={testID ? `${testID}-box` : undefined}
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => input.current?.focus()}
        style={[
          {
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            backgroundColor: colors.surfaceMuted,
            borderColor: error ? colors.lossText : colors.border,
            borderWidth: 1,
            borderRadius: radii.md,
          },
        ]}
      >
        <TextInput
          ref={input}
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={fieldHint(hint, suffix)}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          maxLength={maxLength}
          keyboardType={keyboardType}
          autoCapitalize={secret ? 'none' : autoCapitalize}
          secureTextEntry={secret}
          autoCorrect={secret ? false : undefined}
          autoComplete={secret ? 'off' : undefined}
          importantForAutofill={secret ? 'no' : undefined}
          maxFontSizeMultiplier={2}
          style={[
            textStyle(theme, large ? 'heading' : 'body'),
            {
              flex: 1,
              color: colors.textPrimary,
              padding: spacing.md,
              minHeight: multiline ? touchTarget * 2 : large ? LARGE_FIELD_HEIGHT : touchTarget,
              textAlignVertical: multiline ? 'top' : 'center',
            },
          ]}
        />
        {suffix ? (
          <AppText variant={large ? 'label' : 'caption'} color="textSecondary" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ paddingRight: spacing.md }}>
            {suffix}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="lossText" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
