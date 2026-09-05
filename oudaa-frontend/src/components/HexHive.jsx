import { useMemo } from 'react'

/**
 * Animated, blurred hex-grid background used behind the login brand panel.
 * Pure SVG + CSS animation — no external assets, cheap to render.
 */
export default function HexHive({ className = '', intensity = 'subtle' }) {
  const { cells, viewBox } = useMemo(() => {
    const HEX_R = 34
    const GAP = 3
    const w = HEX_R * 2
    const hStep = w * 0.75
    const vStep = HEX_R * Math.sqrt(3)
    const cols = 20
    const rows = 12
    const width = cols * hStep + w
    const height = rows * vStep + vStep

    const hexPath = (cx, cy, r) => {
      const pts = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i)
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
      }
      return `M${pts.join('L')}Z`
    }

    const list = []
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const cx = col * hStep + HEX_R
        const cy = row * vStep + (col % 2 ? vStep / 2 : 0) + vStep / 2
        list.push({
          d: hexPath(cx, cy, HEX_R - GAP),
          delay: (Math.random() * 7).toFixed(2),
          dur: (6 + Math.random() * 6).toFixed(2),
          peak: (0.2 + Math.random() * 0.3).toFixed(2),
        })
      }
    }

    return { cells: list, viewBox: `0 0 ${width} ${height}` }
  }, [])

  return (
    <svg
      className={`hex-hive-drift ${intensity === 'vivid' ? 'hex-hive-vivid' : ''} ${className}`}
      viewBox={viewBox}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: '-8%',
        width: '116%',
        height: '116%',
        filter: intensity === 'vivid' ? 'blur(0.5px)' : 'blur(2.5px)',
        opacity: intensity === 'vivid' ? 0.9 : 0.55,
      }}
    >
      {cells.map((c, i) => (
        <path
          key={i}
          d={c.d}
          className="hex-cell"
          style={{
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
            '--peak': c.peak,
          }}
        />
      ))}
    </svg>
  )
}
