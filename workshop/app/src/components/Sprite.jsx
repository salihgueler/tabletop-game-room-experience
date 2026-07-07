import { useState } from 'react'

// Pixel-art image with graceful fallback. If the source fails to load we hide
// the broken-image glyph and show a subtle placeholder box instead, so a missing
// asset never renders as a browser error icon.
export default function Sprite({ src, alt = '', style, className = '', fallbackLabel }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        className={className}
        title={alt}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1120',
          border: '2px dashed var(--panel-line)',
          borderRadius: 6,
          color: 'var(--text-dim)',
          fontSize: 12,
          fontFamily: 'var(--font-body)',
          ...style,
        }}
      >
        {fallbackLabel || (alt ? alt.slice(0, 2).toUpperCase() : '▪')}
      </span>
    )
  }

  return (
    <img
      className={`sprite ${className}`}
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
      style={style}
    />
  )
}
