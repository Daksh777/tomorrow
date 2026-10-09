import type { Forecast } from "./types";

export const CURVE_FROM = 6;
export const CURVE_TO = 23;

export interface CurveGeometry {
  baseline: string;
  band: string;
  forecast: string;
  x: (hour: number) => number;
  y: (value: number) => number;
  ticks: { h: number; x: number; label: string }[];
  width: number;
  height: number;
}

/** One shared geometry for the phone card and the WhatsApp image. */
export function curveGeometry(
  f: Pick<Forecast, "hourly" | "lo" | "hi" | "baseline">,
  width: number,
  height: number,
  pad = 8,
  /** Extra values the scale must fit (Google's live readings). */
  extra: number[] = [],
): CurveGeometry {
  const span = CURVE_TO - CURVE_FROM;
  const x = (h: number) => pad + ((h - CURVE_FROM) / span) * (width - pad * 2);
  const maxV = Math.max(
    ...f.hourly.slice(CURVE_FROM, CURVE_TO + 1).map((v) => v ?? 0),
    40,
    ...f.hi.slice(CURVE_FROM, CURVE_TO + 1).map((v) => v ?? 0),
    ...f.baseline.slice(CURVE_FROM, CURVE_TO + 1).map((v) => v ?? 0),
    ...extra,
  );
  const y = (v: number) => height - pad - (v / maxV) * (height - pad * 2);

  const hours: number[] = [];
  for (let h = CURVE_FROM; h <= CURVE_TO; h++) if (f.hourly[h] !== null) hours.push(h);

  const line = (arr: (number | null)[]) =>
    hours.map((h, i) => `${i ? "L" : "M"}${x(h).toFixed(1)},${y(arr[h] as number).toFixed(1)}`).join(" ");

  const band =
    hours.length < 2
      ? ""
      : hours.map((h, i) => `${i ? "L" : "M"}${x(h).toFixed(1)},${y(f.hi[h] as number).toFixed(1)}`).join(" ") +
        " " +
        [...hours].reverse().map((h) => `L${x(h).toFixed(1)},${y(f.lo[h] as number).toFixed(1)}`).join(" ") +
        " Z";

  const labels: Record<number, string> = { 6: "6a", 9: "9a", 12: "12p", 15: "3p", 18: "6p", 21: "9p" };
  return {
    baseline: line(f.baseline),
    band,
    forecast: line(f.hourly),
    x,
    y,
    ticks: Object.entries(labels).map(([h, label]) => ({ h: Number(h), x: x(Number(h)), label })),
    width,
    height,
  };
}
