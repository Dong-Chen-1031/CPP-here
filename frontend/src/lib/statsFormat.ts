export type StatFormat = "count" | "bytes";

function compact(n: number, unit: number, suffix: string): string {
    return (n / unit).toFixed(1).replace(/\.0$/, "") + suffix;
}

export function formatCount(n: number | undefined): string {
    if (n === undefined) return "-";
    if (n >= 1_000_000) return compact(n, 1_000_000, "M+");
    if (n >= 1_000) return compact(n, 1_000, "K+");
    return String(Math.round(n));
}

export function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) return "-";
    if (bytes >= 1_073_741_824) return compact(bytes, 1_073_741_824, " GB+");
    if (bytes >= 1_048_576) return compact(bytes, 1_048_576, " MB+");
    if (bytes >= 1_024) return compact(bytes, 1_024, " KB+");
    return Math.round(bytes) + " B";
}

export function formatStat(format: StatFormat, n: number | undefined) {
    return format === "bytes" ? formatBytes(n) : formatCount(n);
}
