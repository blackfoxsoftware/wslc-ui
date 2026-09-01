interface Props {
  data: number[]
  /** Cor CSS da série (ex.: var(--accent)). */
  color: string
  height?: number
  /** Máximo fixo do eixo (ex.: 100 para percentuais). */
  max?: number
}

const WIDTH = 100

/**
 * Mini gráfico de área para métricas ao vivo.
 * SVG puro com viewBox normalizado: escala para qualquer largura sem depender
 * de biblioteca de gráficos nem de medição de layout.
 */
export default function Sparkline({ data, color, height = 64, max }: Props): React.JSX.Element {
  const top = max ?? Math.max(1, ...data)
  const step = data.length > 1 ? WIDTH / (data.length - 1) : WIDTH
  const points = data.map((v, i) => {
    const x = i * step
    const y = 100 - Math.min(100, (v / top) * 100)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const line = points.join(' ')
  const area = `${line} ${WIDTH},100 0,100`

  return (
    <svg
      aria-hidden
      className="w-full"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${WIDTH} 100`}
    >
      <polygon fill={color} opacity={0.16} points={area} />
      <polyline
        fill="none"
        points={line}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
