import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { END_DOT_RADIUS, FLASK_PATH, LINE_WIDTH, LIP, LIQUID_PATH, MARK_COLORS, PRICE_LINE_PATH, PRICE_POINTS } from '../../theme/brandMark';

interface BrandMarkProps {
  readonly size: number;
  readonly testID?: string;
}

/** The TradeLab mark in its green circle, exactly as the native splash draws it (theme/brandMark.ts). Decorative. */
export function BrandMark({ size, testID }: BrandMarkProps) {
  const [endX, endY] = PRICE_POINTS[PRICE_POINTS.length - 1]!;
  // The splash draws the mark at 5.4 px/unit inside a 660 px circle; the same ratio here.
  const mark = 100 * (5.4 / 6.6);
  const offset = (100 - mark) / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" testID={testID} accessible={false} importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={MARK_COLORS.tileStart} />
          <Stop offset="1" stopColor={MARK_COLORS.tileEnd} />
        </LinearGradient>
        <ClipPath id="circle">
          <Circle cx="50" cy="50" r="50" />
        </ClipPath>
        <ClipPath id="flask">
          <Path d={FLASK_PATH} />
        </ClipPath>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill="url(#tile)" />
      <Circle cx="92" cy="98" r="46" fill="#000000" fillOpacity={0.08} clipPath="url(#circle)" />
      <G transform={`translate(${offset} ${offset}) scale(${mark / 100})`}>
        <Path d={FLASK_PATH} fill={MARK_COLORS.glass} />
        <Rect x={LIP.x} y={LIP.y} width={LIP.width} height={LIP.height} rx={LIP.height / 2} fill={MARK_COLORS.glass} />
        <Path d={LIQUID_PATH} fill={MARK_COLORS.liquid} clipPath="url(#flask)" />
        <Path d={PRICE_LINE_PATH} stroke={MARK_COLORS.line} strokeWidth={LINE_WIDTH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Circle cx={endX} cy={endY} r={END_DOT_RADIUS} fill={MARK_COLORS.line} />
      </G>
    </Svg>
  );
}
