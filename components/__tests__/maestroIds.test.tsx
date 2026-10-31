import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme';
import { QuestionCard } from '../learning/QuestionCard';
import { OrderTicket } from '../practice/OrderTicket';
import { Notice } from '../ui/Notice';

/** The stable ids the Maestro flows in .maestro/ tap and read (docs/e2e.md). */
const inTheme = (ui: React.ReactElement) => render(<ThemeProvider preference="light">{ui}</ThemeProvider>);

describe('ids the device flows rely on', () => {
  it('names quiz options option-<questionId>-<optionId>', async () => {
    await inTheme(
      <QuestionCard
        question={{ id: 'q1', prompt: 'Pick one', multiple: false, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } as never}
        grade={() => ({ correct: true, feedback: [] }) as never}
        onFirstAttempt={() => undefined}
        onMastered={() => undefined}
      />,
    );
    expect(screen.getByTestId('option-q1-a')).toBeTruthy();
    expect(screen.getByTestId('option-q1-b')).toBeTruthy();
  });

  it('holds just the number in last-close', async () => {
    await inTheme(<OrderTicket lastPrice="1.23456" onPlace={() => true} />);
    expect(screen.getByTestId('last-close')).toHaveTextContent('1.23456', { exact: true });
  });

  it('passes a testID through Notice', async () => {
    await inTheme(<Notice title="x" testID="mt-launch-failed">y</Notice>);
    expect(screen.getByTestId('mt-launch-failed')).toBeTruthy();
  });
});
