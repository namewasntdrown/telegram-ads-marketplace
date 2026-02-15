import { useMemo } from 'react';

interface HistoryDataPoint {
  date: string;
  value: number;
}

/**
 * Format large numbers with K/M suffixes
 */
function formatNumber(num: number): string {
  const absNum = Math.abs(num);
  if (absNum >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (absNum >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

interface MiniLineChartProps {
  data: HistoryDataPoint[];
  color?: string;
  height?: number;
  showArea?: boolean;
  showDots?: boolean;
  /** Override the displayed "current" value (bottom-right) */
  currentValue?: number;
}

export function MiniLineChart({
  data,
  color = '#3B82F6',
  height = 80,
  showArea = true,
  showDots = false,
  currentValue,
}: MiniLineChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Take last 30 days for cleaner visualization
    const recentData = data.slice(-30);
    const values = recentData.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    // Get start and end values for display (logical time order: left=past, right=present)
    const startVal = recentData[0].value;
    const endVal = recentData[recentData.length - 1].value;

    const width = 100;
    const padding = 4;
    const chartHeight = height - padding * 2;

    const points = recentData.map((d, i) => {
      const x = (i / (recentData.length - 1)) * width;
      const y = chartHeight - ((d.value - minVal) / range) * chartHeight + padding;
      return { x, y, value: d.value, date: d.date };
    });

    const pathD = points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

    // Y positions for min/max grid lines
    const minY = chartHeight + padding; // bottom
    const maxY = padding; // top

    return { points, pathD, areaD, minVal, maxVal, startVal, endVal, minY, maxY };
  }, [data, height]);

  if (!chartData) {
    return (
      <div className="h-20 flex items-center justify-center text-tg-hint text-sm">
        No data
      </div>
    );
  }

  const trend = chartData.points.length >= 2
    ? chartData.points[chartData.points.length - 1].value - chartData.points[0].value
    : 0;

  return (
    <div className="relative">
      {/* Trend indicator at top-left */}
      <div className="absolute top-0 left-0 z-10">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${trend >= 0 ? 'text-green-600 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>
          {trend >= 0 ? '+' : ''}{formatNumber(trend)}
        </span>
      </div>

      <div className="flex">
        {/* Chart area */}
        <div className="flex-1 min-w-0">
          <svg
            viewBox={`0 0 100 ${height}`}
            className="w-full"
            style={{ height }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Horizontal grid lines for min/max */}
            <line
              x1="0"
              y1={chartData.maxY}
              x2="100"
              y2={chartData.maxY}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4 4"
            />
            <line
              x1="0"
              y1={chartData.minY}
              x2="100"
              y2={chartData.minY}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4 4"
            />
            {showArea && (
              <path d={chartData.areaD} fill={`url(#gradient-${color})`} />
            )}
            <path
              d={chartData.pathD}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {showDots && chartData.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="2"
                fill={color}
                className="opacity-50"
              />
            ))}
            {/* Last point dot */}
            <circle
              cx={chartData.points[chartData.points.length - 1].x}
              cy={chartData.points[chartData.points.length - 1].y}
              r="3"
              fill={color}
            />
          </svg>
        </div>

        {/* Y-axis labels on the right: max at top, current value at bottom */}
        <div className="flex flex-col justify-between pl-2 py-1 text-xs text-tg-hint" style={{ height }}>
          <span>{formatNumber(chartData.maxVal)}</span>
          <span className="font-medium text-tg-text">{formatNumber(currentValue ?? chartData.endVal)}</span>
        </div>
      </div>
    </div>
  );
}

interface DonutChartProps {
  data: Record<string, number>;
  size?: number;
  strokeWidth?: number;
  colors?: string[];
}

const CHART_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
];

export function DonutChart({
  data,
  size = 120,
  strokeWidth = 16,
  colors = CHART_COLORS,
}: DonutChartProps) {
  const chartData = useMemo(() => {
    const entries = Object.entries(data)
      .filter(([, value]) => value > 0)
      .sort(([, a], [, b]) => b - a);

    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    if (total === 0) return null;

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    let currentOffset = 0;
    const segments = entries.map(([label, value], index) => {
      const percentage = (value / total) * 100;
      const segmentLength = (value / total) * circumference;
      const dashArray = `${segmentLength} ${circumference - segmentLength}`;
      const rotation = (currentOffset / total) * 360 - 90;
      currentOffset += value;

      return {
        label,
        value,
        percentage,
        dashArray,
        rotation,
        color: colors[index % colors.length],
      };
    });

    return { segments, radius, circumference };
  }, [data, size, strokeWidth, colors]);

  if (!chartData) {
    return (
      <div
        className="flex items-center justify-center text-tg-hint text-sm"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  const center = size / 2;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {chartData.segments.map((segment, index) => (
          <circle
            key={segment.label}
            cx={center}
            cy={center}
            r={chartData.radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={strokeWidth}
            strokeDasharray={segment.dashArray}
            strokeLinecap="round"
            transform={`rotate(${segment.rotation} ${center} ${center})`}
            className="transition-all duration-500"
            style={{ animationDelay: `${index * 100}ms` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold">{chartData.segments[0]?.percentage.toFixed(0)}%</div>
          <div
            className="text-xs text-tg-hint truncate max-w-[70px]"
            title={chartData.segments[0]?.label}
          >
            {chartData.segments[0]?.label}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DonutLegendProps {
  data: Record<string, number>;
  colors?: string[];
  maxItems?: number;
}

export function DonutLegend({ data, colors = CHART_COLORS, maxItems = 5 }: DonutLegendProps) {
  const entries = Object.entries(data)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxItems);

  return (
    <div className="space-y-2">
      {entries.map(([label, value], index) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors[index % colors.length] }}
          />
          <span className="text-sm flex-1 truncate">{label}</span>
          <span className="text-sm font-medium text-tg-hint">{value}%</span>
        </div>
      ))}
    </div>
  );
}

interface PeakHoursChartProps {
  hours: number[];
}

export function PeakHoursChart({ hours }: PeakHoursChartProps) {
  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const peakSet = new Set(hours);

  return (
    <div className="flex gap-0.5 items-end h-12">
      {allHours.map((hour) => {
        const isPeak = peakSet.has(hour);
        const intensity = isPeak ? 1 : 0.2;
        return (
          <div
            key={hour}
            className="flex-1 rounded-t transition-all duration-300"
            style={{
              height: isPeak ? '100%' : '30%',
              backgroundColor: isPeak ? '#3B82F6' : 'rgba(255,255,255,0.1)',
              opacity: intensity,
            }}
            title={`${hour}:00`}
          />
        );
      })}
    </div>
  );
}

interface ViewSourcesBarProps {
  data: Record<string, number>;
}

const SOURCE_COLORS: Record<string, string> = {
  'Followers': '#10B981',
  'Channels': '#3B82F6',
  'Groups': '#8B5CF6',
  'Search': '#F59E0B',
  'Other': '#6B7280',
  'PM': '#EC4899',
  'URL': '#06B6D4',
};

export function ViewSourcesBar({ data }: ViewSourcesBarProps) {
  const entries = Object.entries(data)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden">
        {entries.map(([source, value]) => (
          <div
            key={source}
            className="transition-all duration-500"
            style={{
              width: `${(value / total) * 100}%`,
              backgroundColor: SOURCE_COLORS[source] || '#6B7280',
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.slice(0, 4).map(([source, value]) => (
          <div key={source} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: SOURCE_COLORS[source] || '#6B7280' }}
            />
            <span className="text-xs text-tg-hint">{source}</span>
            <span className="text-xs font-medium">{value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: number;
  color?: 'default' | 'green' | 'red' | 'amber' | 'blue';
}

export function StatsCard({ title, value, subtitle, icon, trend, color = 'default' }: StatsCardProps) {
  const colorClasses = {
    default: 'text-tg-text',
    green: 'text-green-600',
    red: 'text-red-500',
    amber: 'text-amber-600',
    blue: 'text-blue-500',
  };

  return (
    <div className="p-4 rounded-2xl bg-tg-bg-secondary border border-tg-separator">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-tg-hint uppercase tracking-wide">{title}</span>
        {icon && <span className="text-tg-hint">{icon}</span>}
      </div>
      <div className="flex items-end gap-2">
        <span className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</span>
        {trend !== undefined && (
          <span className={`text-sm font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      {subtitle && <span className="text-xs text-tg-hint mt-1 block">{subtitle}</span>}
    </div>
  );
}
