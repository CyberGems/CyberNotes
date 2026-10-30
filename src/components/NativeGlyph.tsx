import { measureNativeGlyph } from '../utils/glyphSupport';

/** Native Unicode text positioned by its ink bounds, independent of font leading. */
export default function NativeGlyph({ value, fontFamily, className = '' }: {
  value: string;
  fontFamily: string;
  className?: string;
}) {
  const metrics = measureNativeGlyph(value, fontFamily);
  const padding = 2;
  const width = metrics.width + padding * 2;
  const height = metrics.height + padding * 2;
  return (
    <svg
      className={`picker-glyph ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: `${width / 32}em`, height: `${height / 32}em` }}
      aria-hidden="true"
      focusable="false"
    >
      <text
        x={metrics.left + padding}
        y={metrics.ascent + padding}
        style={{ fontFamily, fontSize: 32, fontWeight: 400, direction: 'ltr' }}
      >{value}</text>
    </svg>
  );
}
