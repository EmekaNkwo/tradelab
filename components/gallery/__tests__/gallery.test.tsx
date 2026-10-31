import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme';
import GalleryScreen from '../../../app/dev/gallery';
import type { HostNode } from '../../../testing/a11y';
import { expectSimulatedFiguresBadged } from '../../../testing/simulatedFigures';

describe('component gallery (dev builds)', () => {
  it('shows every component in light and dark side by side', async () => {
    await render(
      <ThemeProvider preference="light">
        <GalleryScreen />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('gallery-light')).toBeTruthy();
    expect(screen.getByTestId('gallery-dark')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    // Sample values are labelled as samples in both columns.
    expect(screen.getAllByText('Sample data')).toHaveLength(2);
    expect(screen.getAllByRole('adjustable')).toHaveLength(4);
    // The gallery follows its own rule: every money figure is badged on its card.
    expectSimulatedFiguresBadged(screen.container as unknown as HostNode);
  });
});
