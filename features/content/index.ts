import { useMemo } from 'react';
import type { Disclosure, DisclosureStatistic, DisclosureTrigger, Source } from '../../domain/models/content';
import { useContainer } from '../app';

export type { Disclosure, DisclosureStatistic, Source } from '../../domain/models/content';

export function useDisclosures(trigger: DisclosureTrigger): readonly Disclosure[] {
  const { content } = useContainer();
  return useMemo(() => content.disclosuresFor(trigger), [content, trigger]);
}

export function useContentInfo() {
  const { content } = useContainer();
  return useMemo(() => ({ version: content.version, hash: content.hash, counts: content.counts() }), [content]);
}

/** A disclosure statistic with the source it cites (spec §3: every statistic shows where it is from). */
export interface CitedStatistic {
  readonly statistic: DisclosureStatistic;
  readonly source: Source;
}

/**
 * The disclosure's statistics paired with their sources. A statistic whose source is not in the bundle is left
 * out, so no figure is ever shown without its citation.
 */
export function useCitedStatistics(disclosure: Disclosure): readonly CitedStatistic[] {
  const { content } = useContainer();
  return useMemo(
    () =>
      disclosure.statistics.flatMap((statistic) => {
        const source = content.source(statistic.sourceId);
        return source ? [{ statistic, source }] : [];
      }),
    [content, disclosure],
  );
}
