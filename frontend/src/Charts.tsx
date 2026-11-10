import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents, type Total } from "./analytics";

// Fixed palette: mid-tone hues that read on both light and dark backgrounds.
const PALETTE = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
const OTHER = "#9ca3af";
const AXIS = { fontSize: 12, fill: "var(--muted)" };

/** Same category -> same color in every chart (by position in the full category list). */
export function categoryColors(allCategories: string[]) {
  return (name: string) => {
    const i = allCategories.indexOf(name);
    return i === -1 ? OTHER : PALETTE[i % PALETTE.length];
  };
}

const dollars = (v: unknown) => formatCents(Math.round(Number(v) * 100));
const axisDollars = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" };

function RankedBars({ totals, colorOf, label }: { totals: Total[]; colorOf: (name: string) => string; label: string }) {
  const data = totals.map((t) => ({ name: t.name, dollars: t.cents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} accessibilityLayer>
        <XAxis type="number" tickFormatter={axisDollars} tick={AXIS} />
        <YAxis type="category" dataKey="name" width={150} tick={AXIS} interval={0} />
        <Tooltip formatter={dollars} contentStyle={tooltipStyle} cursor={{ fillOpacity: 0.1 }} />
        <Bar dataKey="dollars" name={label} radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((d) => (
            <Cell key={d.name} fill={colorOf(d.name)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryChart({ totals, colorOf }: { totals: Total[]; colorOf: (name: string) => string }) {
  return <RankedBars totals={totals} colorOf={colorOf} label="Spent" />;
}

export function MerchantChart({ totals }: { totals: Total[] }) {
  return <RankedBars totals={totals} colorOf={() => PALETTE[0]} label="Spent" />;
}

export function TrendChart({
  series,
  data,
  colorOf,
}: {
  series: string[];
  data: Record<string, string | number>[];
  colorOf: (name: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: 8, right: 16 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tick={AXIS} />
        <YAxis tickFormatter={axisDollars} tick={AXIS} width={64} />
        <Tooltip formatter={dollars} contentStyle={tooltipStyle} cursor={{ fillOpacity: 0.1 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Bar key={s} dataKey={s} stackId="spend" fill={s === "Other" ? OTHER : colorOf(s)} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaceChart({
  data,
  currentLabel,
  previousLabel,
}: {
  data: { day: number; current: number | null; previous: number | null }[];
  currentLabel: string;
  previousLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ left: 8, right: 16 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="day" tick={AXIS} />
        <YAxis tickFormatter={axisDollars} tick={AXIS} width={64} />
        <Tooltip formatter={dollars} labelFormatter={(d) => `Day ${d}`} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="previous" name={previousLabel} stroke={OTHER} strokeDasharray="5 4" dot={false} strokeWidth={2} />
        <Line dataKey="current" name={currentLabel} stroke={PALETTE[0]} dot={false} strokeWidth={2.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}
