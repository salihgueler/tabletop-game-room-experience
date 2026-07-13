import Sprite from './Sprite.jsx'

// Full-screen wooden cabinet: side icon-rails + a big framed interior, with a
// skull crest medallion floating on the top edge. This is the shell both the
// Guild Hall and Game Room render inside, matching the mockups.
export default function Cabinet({ children, leftRail, rightRail, crest = true }) {
  return (
    <div className="row cabinet-shell" style={{ height: '100vh', padding: '10px 8px', gap: 8 }}>
      <IconRail>{leftRail}</IconRail>

      <div className="cabinet grow" style={{ position: 'relative' }}>
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />

        {crest && (
          <Sprite
            src="/ui/crest.png"
            alt="crest"
            style={{
              position: 'absolute',
              top: -34,
              left: '50%',
              width: 92,
              height: 'auto',
              zIndex: 6,
              animation: 'floatFlame 2.4s ease-in-out infinite',
              filter: 'drop-shadow(0 0 10px #00ffff55)',
            }}
          />
        )}

        <div className="cabinet-inner">{children}</div>
      </div>

      <IconRail>{rightRail}</IconRail>
    </div>
  )
}

function IconRail({ children }) {
  return (
    <div className="col icon-rail" style={{ justifyContent: 'space-between', padding: '4px 0', flex: '0 0 auto' }}>
      {children}
    </div>
  )
}

export function RailBtn({ children, title, onClick }) {
  return (
    <button className="rail-btn" title={title} onClick={onClick} style={{ marginBottom: 8 }}>
      {children}
    </button>
  )
}
