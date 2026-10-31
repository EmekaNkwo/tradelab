import { openApplication } from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import { createAppLauncher, isPackageNotFound } from '../expoAppLauncher';

jest.mock('expo-intent-launcher', () => ({ openApplication: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openURL: jest.fn() } }));

const launch = openApplication as jest.Mock;
const openURL = Linking.openURL as jest.Mock;

beforeEach(() => {
  launch.mockReset();
  openURL.mockReset();
  (Platform as { OS: string }).OS = 'android';
});

describe('MetaTrader launcher', () => {
  it('opens MetaTrader 5 by its package name', async () => {
    expect(await createAppLauncher().openApp('mt5')).toEqual({ ok: true, value: 'opened' });
    expect(launch).toHaveBeenCalledWith('net.metaquotes.metatrader5');
  });

  it('reports not installed only for the package-not-found error', async () => {
    launch.mockImplementationOnce(() => {
      throw Object.assign(new Error('Package not found: net.metaquotes.metatrader4'), { code: 'ERR_PACKAGE_NOT_FOUND' });
    });
    expect(await createAppLauncher().openApp('mt4')).toEqual({ ok: true, value: 'not_installed' });
    launch.mockImplementationOnce(() => {
      throw new Error('ActivityNotFoundException: No Activity found');
    });
    const other = await createAppLauncher().openApp('mt4');
    expect(!other.ok && other.error.kind).toBe('ProviderUnavailable');
    expect(isPackageNotFound(null)).toBe(false);
  });

  it('reports not installed for the error a minified release build throws', async () => {
    // Device finding (Xiaomi, release APK): R8 merges PackageNotFoundException into an
    // obfuscated class, so the inferred code is not ERR_PACKAGE_NOT_FOUND, and the sync
    // function wraps the message in "Call to function ... has been rejected."
    launch.mockImplementationOnce(() => {
      throw Object.assign(
        new Error(
          "Call to function 'ExpoIntentLauncher.openApplication' has been rejected.\n→ Caused by: Package not found: net.metaquotes.metatrader5",
        ),
        { code: 'ERR_QL1' },
      );
    });
    expect(await createAppLauncher().openApp('mt5')).toEqual({ ok: true, value: 'not_installed' });
  });

  it('still reports other release-build launch failures as failures', async () => {
    launch.mockImplementationOnce(() => {
      throw Object.assign(
        new Error("Call to function 'ExpoIntentLauncher.openApplication' has been rejected.\n→ Caused by: Activity not found"),
        { code: 'ERR_QL1' },
      );
    });
    const res = await createAppLauncher().openApp('mt5');
    expect(!res.ok && res.error.kind).toBe('ProviderUnavailable');
  });

  it('reports not installed when the native error is only a nested cause', () => {
    const nested = Object.assign(new Error('Call rejected'), { cause: new Error('Package not found: net.metaquotes.metatrader5') });
    expect(isPackageNotFound(nested)).toBe(true);
    expect(isPackageNotFound(Object.assign(new Error('Call rejected'), { cause: new Error('Activity not found') }))).toBe(false);
  });

  it('treats throwables that are not errors as failures, not as not installed', async () => {
    for (const thrown of ['Package not found: x', { message: 'Activity not found' }, undefined]) {
      launch.mockImplementationOnce(() => {
        throw thrown;
      });
      const res = await createAppLauncher().openApp('mt5');
      expect(!res.ok && res.error.kind).toBe('ProviderUnavailable');
    }
    // A plain object with the message is still recognised (Expo errors are not always Error instances).
    expect(isPackageNotFound({ message: 'Package not found: x' })).toBe(true);
  });

  it('does not loop on a self-referencing cause', () => {
    const loop: { message: string; cause?: unknown } = { message: 'wrapped' };
    loop.cause = loop;
    expect(isPackageNotFound(loop)).toBe(false);
  });

  it('does not try to launch apps outside Android', async () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(await createAppLauncher().openApp('mt5')).toEqual({ ok: true, value: 'unsupported' });
    expect(launch).not.toHaveBeenCalled();
  });

  it('opens the Play Store, falling back to the web listing', async () => {
    expect((await createAppLauncher().openStoreListing('mt5')).ok).toBe(true);
    expect(openURL).toHaveBeenCalledWith('market://details?id=net.metaquotes.metatrader5');
    openURL.mockRejectedValueOnce(new Error('no market app'));
    expect((await createAppLauncher().openStoreListing('mt4')).ok).toBe(true);
    expect(openURL).toHaveBeenLastCalledWith('https://play.google.com/store/apps/details?id=net.metaquotes.metatrader4');
    openURL.mockRejectedValue(new Error('nothing'));
    expect((await createAppLauncher().openStoreListing('mt4')).ok).toBe(false);
  });
});
