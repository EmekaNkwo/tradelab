import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True while the system "reduce motion" setting is on; screens slow or drop automatic movement then. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((on) => {
        if (alive) setReduce(on === true);
      })
      .catch(() => undefined); // Unknown is treated as off; nothing else depends on it.
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on: boolean) => setReduce(on));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
