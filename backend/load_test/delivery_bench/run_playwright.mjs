// Drives bench.html in headless Chromium.
//
//   node run_playwright.mjs --base https://cpp-api-insiders.doong.me [--iters 10]
//        [--cold-iters 8] [--profiles none,net,mobile,far] [--label name] [--out file]
//        [--samples a,b] [--chromium /path/to/chromium]
//
// Two kinds of runs per profile:
//   warm  one browser context for everything, so connections to both hosts
//         stay open (a user running code for the second time)
//   cold  a new browser context per run: the page host is warm because the
//         page was just loaded from it (like the frontend domain), the alt
//         host is not (a user's first run, if the wasm is on another domain)
import { chromium } from "playwright";
import fs from "node:fs";

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => {
        if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
        return acc;
    }, []),
);
const BASE = (args.base || "http://127.0.0.1:8001").replace(/\/$/, "");
const ITERS = Number(args.iters || 10);
const COLD_ITERS = Number(args["cold-iters"] || 8);
const PROFILES = (args.profiles || "none,net,mobile,far").split(",");
const LABEL = args.label || "playwright";
const OUT = args.out || `results-${LABEL}-${Date.now()}.json`;
const SAMPLES = args.samples?.split(",");

// latency is added per request by DevTools, on top of the real path
const PROFILE_DEFS = {
    none: {},
    net: { latency: 40, down: 10e6 / 8, up: 5e6 / 8 },
    mobile: { latency: 40, down: 10e6 / 8, up: 5e6 / 8, cpu: 4 },
    // roughly a user in Taiwan reaching an origin in Europe through Cloudflare
    far: { latency: 250, down: 20e6 / 8, up: 10e6 / 8 },
};

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
// --chromium /usr/bin/chromium for machines Playwright ships no build for
const browser = await chromium.launch({ proxy, executablePath: args.chromium });

async function openPage(profile) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const p = PROFILE_DEFS[profile];
    if (p.down) {
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: p.latency,
            downloadThroughput: p.down,
            uploadThroughput: p.up,
        });
    }
    if (p.cpu) await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
    await page.goto(`${BASE}/bench/?headless`);
    await page.waitForFunction(() => window.bench);
    return { context, page };
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const all = { label: LABEL, base: BASE, startedAt: new Date().toISOString(), runs: [], conns: [] };

for (const profile of PROFILES) {
    // ---------- warm ----------
    const { context, page } = await openPage(profile);
    const info = await page.evaluate(() => window.bench.info());
    const modes = await page.evaluate(() => Object.keys(window.bench.MODES));
    all.env = await page.evaluate(() => window.bench.env());
    all.info = info;
    const samples = SAMPLES || info.samples.map((s) => s.name);
    const hosts = info.alt_base ? ["same", "alt"] : ["same"];
    console.log(`[${profile}] edge=${info.colo} samples=${samples} hosts=${hosts}`);

    if (info.alt_base) {
        all.conns.push({ profile, kind: "warm-ctx alt first", ...(await page.evaluate((b) => window.bench.ping(b), info.alt_base)) });
        all.conns.push({ profile, kind: "warm-ctx alt again", ...(await page.evaluate((b) => window.bench.ping(b), info.alt_base)) });
    }
    all.conns.push({ profile, kind: "warm-ctx page host", ...(await page.evaluate((b) => window.bench.ping(b), BASE)) });

    const combos = [];
    for (const sample of samples) {
        for (const files of hosts)
            for (const mode of modes)
                if (!(files === "alt" && mode.startsWith("C"))) combos.push({ sample, files, mode });
        // Same URL every time + cacheable: a rebuild of unchanged code
        combos.push({ sample, files: "same-cached", mode: "B-stream", nonce: `cache-${profile}-${sample}-${Date.now()}` });
    }
    const call = (c) =>
        page.evaluate(
            (c) => window.bench.runOne({ ...c, files: c.files === "same-cached" ? "same" : c.files }),
            c,
        );
    for (const c of combos) await call(c).catch(() => {}); // warm-up, discarded
    for (let i = 0; i < ITERS; i++) {
        for (const c of shuffle([...combos])) {
            try {
                const r = await call(c);
                all.runs.push({ ...r, files: c.files, profile, phase: "warm", iter: i });
            } catch (e) {
                console.error(`[${profile}] warm ${c.sample} ${c.mode} ${c.files}: ${e.message.split("\n")[0]}`);
            }
        }
        process.stdout.write(`  warm iter ${i + 1}/${ITERS}\r`);
    }
    await context.close();
    console.log();

    // ---------- cold ----------
    const coldCombos = [];
    for (const sample of samples) {
        coldCombos.push({ sample, files: "same", mode: "B-stream" });
        coldCombos.push({ sample, files: "same", mode: modes.includes("C-native") ? "C-native" : "C-atob" });
        if (info.alt_base) {
            coldCombos.push({ sample, files: "alt", mode: "B-stream" });
            coldCombos.push({ sample, files: "alt", mode: "A-stream" });
        }
    }
    for (let i = 0; i < COLD_ITERS; i++) {
        for (const c of shuffle([...coldCombos])) {
            const { context, page } = await openPage(profile);
            try {
                const r = await page.evaluate((c) => window.bench.runOne(c), c);
                all.runs.push({ ...r, profile, phase: "cold", iter: i });
            } catch (e) {
                console.error(`[${profile}] cold ${c.sample} ${c.mode} ${c.files}: ${e.message.split("\n")[0]}`);
            }
            await context.close();
        }
        process.stdout.write(`  cold iter ${i + 1}/${COLD_ITERS}\r`);
    }
    console.log();
    fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
}

await browser.close();
fs.writeFileSync(OUT, JSON.stringify(all, null, 1));

// Upload so every run (browser UI or this script) ends up in one place
try {
    await fetch(`${BASE}/bench/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: LABEL, source: "playwright", env: all.env, conns: all.conns, results: all.runs }),
    });
} catch (e) {
    console.error(`upload failed: ${e.message}`);
}

// ---------- summary ----------
const q = (arr, p) => {
    const s = arr.filter(Number.isFinite).sort((a, b) => a - b);
    if (!s.length) return NaN;
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const groups = new Map();
for (const r of all.runs) {
    const k = [r.profile, r.phase, r.sample, r.files, r.mode].join("\t");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
}
console.log(["profile", "phase", "sample", "files", "mode", "n", "json", "ready", "p25", "p75", "exit"].join("\t"));
for (const [k, rs] of [...groups].sort()) {
    const f = (fn, p = 0.5) => q(rs.map(fn), p).toFixed(1);
    console.log([k, rs.length, f((r) => r.json_ms), f((r) => r.ready_ms), f((r) => r.ready_ms, 0.25), f((r) => r.ready_ms, 0.75), f((r) => r.exit_ms)].join("\t"));
}
console.log(`saved ${OUT}`);
