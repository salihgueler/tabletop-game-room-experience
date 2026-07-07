// Wooden frame with golden corner studs. Wraps any region for the tabletop look.
export default function Frame({ children, className = '', style, innerClassName = '', innerStyle }) {
  return (
    <div className={`frame ${className}`} style={style}>
      <span className="stud tl" />
      <span className="stud tr" />
      <span className="stud bl" />
      <span className="stud br" />
      <div className={`frame-inner ${innerClassName}`} style={innerStyle}>
        {children}
      </div>
    </div>
  )
}
