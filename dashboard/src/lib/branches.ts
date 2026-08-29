export function selectBiomeBranch(
	branches: string[],
	requested: string | null,
): string | null {
	if (requested && branches.includes(requested)) return requested;
	if (branches.includes("main")) return "main";
	return branches[0] ?? null;
}
