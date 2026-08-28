// Change detection: robust (median / MAD) binary segmentation per series.
import type { Dataset, Metric, Repo, ValueKey } from "./data";
import { METRICS, SEVERITIES, isTime } from "./data";

export type FindingKind = "step" | "spike" | "recovered";

export interface Finding {
	id: string;
	repo: Repo;
	metric: Metric;
	kind: FindingKind;
	/** run index where the new level starts */
	at: number;
	/** run index where a recovered change ended (first run back at baseline) */
	endAt: number | null;
	/** median of the baseline runs */
	before: number;
	/** median of the runs at the new level */
	after: number;
	sd: number;
	z: number;
	/** defined runs at the new level */
	runs: number;
	worse: boolean;
}

const median = (xs: number[]): number => {
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** robust sd: 1.4826 × MAD, floored so a flat baseline can't make everything "significant" */
function robustSd(xs: number[], key: ValueKey): number {
	const m = median(xs);
	const mad = median(xs.map((x) => Math.abs(x - m)));
	const floor = isTime(key) ? Math.max(0.015 * Math.abs(m), 0.05) : 0.25;
	return Math.max(1.4826 * mad, floor);
}

interface Point {
	i: number;
	v: number;
}

/** indices (into pts) where a new segment starts, via recursive binary segmentation */
function segment(
	pts: Point[],
	key: ValueKey,
	threshold: number,
	minLeft: number,
	minRight: number,
	depth = 0,
): number[] {
	if (depth > 3 || pts.length < minLeft + minRight) return [];
	let best = { s: -1, z: 0 };
	for (let s = minLeft; s <= pts.length - minRight; s++) {
		const left = pts.slice(0, s).map((p) => p.v);
		const right = pts.slice(s).map((p) => p.v);
		const mL = median(left);
		const mR = median(right);
		if (mL === mR) continue;
		const z = Math.abs(mR - mL) / robustSd(left, key);
		if (z > best.z) best = { s, z };
	}
	if (best.s < 0 || best.z < threshold) return [];
	return [
		...segment(pts.slice(0, best.s), key, threshold, minLeft, minRight, depth + 1),
		best.s,
		...segment(pts.slice(best.s), key, threshold, minLeft, minRight, depth + 1).map(
			(b) => b + best.s,
		),
	];
}

function detectSeries(
	repo: Repo,
	m: Metric,
	vals: (number | null)[],
	threshold: number,
): Finding[] {
	const pts: Point[] = [];
	vals.forEach((v, i) => {
		if (v !== null) pts.push({ i, v });
	});
	if (pts.length < 5) return [];
	const out: Finding[] = [];
	const bounds = [0, ...segment(pts, m.key, threshold, 3, 2), pts.length];
	const levels = bounds
		.slice(0, -1)
		.map((b, k) => median(pts.slice(b, bounds[k + 1]).map((p) => p.v)));

	for (let k = 1; k < levels.length; k++) {
		const after = levels[k];
		// baseline: walk back over earlier segments until it holds >= 5 runs, so a short
		// intermediate level can't make a partial rebound look like a fresh regression
		let from = k - 1;
		while (from > 0 && bounds[k] - bounds[from] < 5) from--;
		const base = pts.slice(bounds[from], bounds[k]).map((p) => p.v);
		const before = median(base);
		const sd = robustSd(base, m.key);
		const z = Math.abs(after - before) / sd;
		if (z < threshold) continue;
		const isLast = k === levels.length - 1;
		// recovered = a later level returns to within 1 sd of this one's baseline
		const recoveredAt = isLast
			? -1
			: levels.slice(k + 1).findIndex((l) => Math.abs(l - before) <= sd);
		const kind: FindingKind = recoveredAt >= 0 ? "recovered" : "step";
		out.push({
			id: `${repo.slug}:${m.key}:${pts[bounds[k]].i}`,
			repo,
			metric: m,
			kind,
			at: pts[bounds[k]].i,
			endAt: recoveredAt >= 0 ? pts[bounds[k + 1 + recoveredAt]].i : null,
			before,
			after,
			sd,
			z,
			runs: bounds[k + 1] - bounds[k],
			worse: after > before,
		});
	}

	// spike: the latest run alone deviates from everything before it (no segment boundary there)
	const last = pts[pts.length - 1];
	const lastBoundary = bounds[bounds.length - 2];
	const prior = pts
		.slice(lastBoundary, -1)
		.map((p) => p.v)
		.slice(-10);
	if (prior.length >= 3) {
		const m0 = median(prior);
		const sd = robustSd(prior, m.key);
		const z = Math.abs(last.v - m0) / sd;
		if (z >= threshold && last.v !== m0) {
			out.push({
				id: `${repo.slug}:${m.key}:spike`,
				repo,
				metric: m,
				kind: "spike",
				at: last.i,
				endAt: null,
				before: m0,
				after: last.v,
				sd,
				z,
				runs: 1,
				worse: last.v > m0,
			});
		}
	}
	return out;
}

const KIND_RANK: Record<FindingKind, number> = { step: 0, spike: 1, recovered: 2 };
/** what a maintainer wants to see first — σ is not comparable across metrics, so rank by metric then recency */
const METRIC_RANK: Record<string, number> = {
	panics: 0,
	parse: 1,
	checkMs: 2,
	scannerMs: 3,
	errors: 4,
	warnings: 5,
	infos: 6,
};

/** every detected change, most important first */
export function detectFindings(dataset: Dataset, threshold: number): Finding[] {
	const out: Finding[] = [];
	for (const repo of dataset.repos) {
		for (const m of [...METRICS, ...SEVERITIES]) {
			out.push(
				...detectSeries(
					repo,
					m,
					repo.cells.map((c) => c[m.key]),
					threshold,
				),
			);
		}
	}
	return out.sort(
		(a, b) =>
			KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
			Number(b.worse) - Number(a.worse) ||
			b.at - a.at ||
			METRIC_RANK[a.metric.key] - METRIC_RANK[b.metric.key] ||
			b.z - a.z,
	);
}

/** one finding per "slug:key" that is in effect at the latest run: a persisting step, else a spike */
export function activeFindings(
	dataset: Dataset,
	threshold: number,
): Map<string, Finding> {
	const map = new Map<string, Finding>();
	for (const f of detectFindings(dataset, threshold)) {
		if (f.kind === "recovered") continue;
		const key = `${f.repo.slug}:${f.metric.key}`;
		const cur = map.get(key);
		if (
			!cur ||
			(cur.kind === "spike" && f.kind === "step") ||
			(cur.kind === f.kind && f.at > cur.at)
		)
			map.set(key, f);
	}
	return map;
}

/** text colour for a significant delta — colour never stands alone: pair with ▲/▼ and weight */
export const deltaColor = (f: Finding): string =>
	f.worse ? "var(--worse)" : "var(--better)";
export const deltaGlyph = (f: Finding): string => (f.worse ? "▲" : "▼");
