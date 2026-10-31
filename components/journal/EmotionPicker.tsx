import { useState } from 'react';
import type { EmotionRatings } from '../../features/journal';
import { AppText, Button, ChoiceChips, TextField } from '../ui';

const SCALE = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));
const DEFAULT: EmotionRatings = { confidence: 3, stress: 3, patience: 3, feeling: null };

/**
 * Self-ratings for a trade (spec §21). A learning aid to spot patterns, not a
 * mental-health assessment.
 */
interface EmotionPickerProps {
  readonly value: EmotionRatings | null;
  readonly onChange: (v: EmotionRatings) => void;
  /** Report every change at once (inside a larger form) instead of waiting for "Save ratings". */
  readonly live?: boolean;
}

export function EmotionPicker({ value, onChange, live = false }: EmotionPickerProps) {
  const [draft, setDraft] = useState<EmotionRatings>(value ?? DEFAULT);
  const [feeling, setFeeling] = useState(value?.feeling ?? '');
  const update = (next: EmotionRatings, nextFeeling: string) => {
    setDraft(next);
    setFeeling(nextFeeling);
    if (live) onChange({ ...next, feeling: nextFeeling.trim() || null });
  };
  const rate = (key: 'confidence' | 'stress' | 'patience', label: string) => (
    <ChoiceChips label={`${label} (1 low, 5 high)`} single options={SCALE} selected={[draft[key]]} onChange={(v) => v[0] && update({ ...draft, [key]: v[0] }, feeling)} />
  );
  return (
    <>
      <AppText color="textSecondary">How did the trade feel? This helps you spot patterns; it is not an assessment.</AppText>
      {rate('confidence', 'Confidence')}
      {rate('stress', 'Stress')}
      {rate('patience', 'Patience')}
      <TextField label="One word for how you felt (optional)" value={feeling} onChangeText={(t) => update(draft, t)} maxLength={60} />
      {live ? null : <Button label="Save ratings" variant="secondary" onPress={() => onChange({ ...draft, feeling: feeling.trim() || null })} />}
    </>
  );
}
