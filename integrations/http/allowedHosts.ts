/**
 * The only hosts the app may contact (spec §32A.6). Each is used by one
 * optional, off-by-default integration with the learner's own key.
 * `scripts/check-network.ts` keeps this list identical to its own approved
 * list (with the reason for each host), so adding a host needs both changes.
 */
export const ALLOWED_HOSTS: readonly string[] = ['api.twelvedata.com', 'api.anthropic.com'];

export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // `port` is '' only for the default HTTPS port; any explicit other port is refused.
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.includes(parsed.hostname) && parsed.port === '' && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}
