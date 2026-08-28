export const formatMs = (v: number): string =>
	Math.abs(v) < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;

export const formatCount = (v: number): string =>
	Math.round(v).toLocaleString("en-US");

export const formatPct = (v: number): string =>
	`${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export const signed = (text: string, v: number): string =>
	v > 0 ? `+${text}` : v < 0 ? `−${text.replace(/^-/, "")}` : text;

export const formatDay = (iso: string): string =>
	new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(new Date(iso));

export const formatDateTime = (iso: string): string =>
	new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
	}).format(new Date(iso));

export const shortSha = (sha: string): string => sha.slice(0, 7);

export function niceTicks(lo: number, hi: number, count = 3): number[] {
	const span = hi - lo;
	if (span <= 0) return [lo];
	const raw = span / count;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const norm = raw / mag;
	const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
	const out: number[] = [];
	for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
		out.push(Number(v.toFixed(10)));
	}
	return out;
}
