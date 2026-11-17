// Times in-browser builds in a worker that has already compiled (the toolchain
// loaded, V8 tiered up) and is warmed up for the program, as the editor does
// in the background: the same four programs, each compiled ROUNDS times with
// one number changed so that the build cache never answers. WARM=0 skips the
// warm-ups: builds then have no PCH of their own includes. Run from `frontend`
// after `npm run toolchain`.
import { createServer } from "vite";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toolchainId } from "../../scripts/toolchain-id.mjs";
import { testEnv } from "./test-env.mjs";

const frontend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const server = await createServer({
    configFile: false,
    optimizeDeps: {
        entries: ["test/browser/index.html"],
        include: ["@bjorn3/browser_wasi_shim"],
    },
    root: frontend,
    publicDir: path.join(frontend, "public"),
    plugins: [toolchainId(), testEnv()],
    server: { host: "127.0.0.1", port: 5183 },
});
await server.listen();
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox"],
});
const STD = process.env.STD || "c++17";
const ROUNDS = Number(process.env.ROUNDS || 7);

// A shortest-path solution with the containers a contest program uses.
const body = (n) => `using namespace std;
typedef long long ll;
const int N = 200005;
vector<pair<int, int>> adj[N];
ll dist[N];
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m;
    cin >> n >> m;
    for (int i = 0; i < m; i++) {
        int a, b, w;
        cin >> a >> b >> w;
        adj[a].push_back({b, w});
        adj[b].push_back({a, w});
    }
    fill(dist, dist + N, (ll)4e18 + ${n});
    priority_queue<pair<ll, int>, vector<pair<ll, int>>, greater<pair<ll, int>>> pq;
    dist[1] = 0;
    pq.push({0, 1});
    while (!pq.empty()) {
        pair<ll, int> top = pq.top();
        pq.pop();
        if (top.first > dist[top.second]) continue;
        for (size_t i = 0; i < adj[top.second].size(); i++) {
            pair<int, int> e = adj[top.second][i];
            if (dist[e.first] > top.first + e.second) {
                dist[e.first] = top.first + e.second;
                pq.push({dist[e.first], e.first});
            }
        }
    }
    map<string, int> count;
    string word;
    while (cin >> word) count[word]++;
    vector<ll> answer(dist + 1, dist + n + 1);
    sort(answer.begin(), answer.end());
    for (size_t i = 0; i < answer.size(); i++) cout << answer[i] << ' ';
    for (map<string, int>::iterator it = count.begin(); it != count.end(); ++it)
        cout << it->first << ' ' << it->second << '\\n';
}
`;
const programs = {
    "hello, <iostream>": (n) =>
        `#include <iostream>\nint main() { int x = ${n}; std::cout << x * 2; }\n`,
    "hello, <bits/stdc++.h>": (n) =>
        `#include <bits/stdc++.h>\nusing namespace std;\nint main() { vector<int> v(${n}); sort(v.begin(), v.end()); cout << v.size(); }\n`,
    "shortest path, six headers": (n) =>
        "#include <iostream>\n#include <vector>\n#include <algorithm>\n#include <map>\n#include <string>\n#include <queue>\n" +
        body(n),
    "shortest path, <bits/stdc++.h>": (n) =>
        "#include <bits/stdc++.h>\n" + body(n),
};

const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("page:", e.message));
    await page.goto("http://127.0.0.1:5183/test/browser/index.html");
    await page.waitForFunction(() => !!window.compilerTest);
    const compile = (source) =>
        page.evaluate(
            async ({ source, std }) => {
                const t = performance.now();
                const result = await window.compilerTest.compileLocal(
                    source,
                    std,
                );
                return {
                    ok: result.ok,
                    errors: result.errors,
                    ms: Math.round(performance.now() - t),
                };
            },
            { source, std: STD },
        );
    // Downloads the compiler and loads it; a warm-up does neither.
    assert.equal((await compile("int main() {}\n")).ok, true);
    const rows = [];
    let n = 0;
    for (const [name, program] of Object.entries(programs)) {
        const times = [];
        let warmUpMs = 0;
        if (process.env.WARM !== "0")
            warmUpMs = await page.evaluate(
                async ({ source, std }) => {
                    const t = performance.now();
                    await window.compilerTest.warm(std, source, true);
                    return Math.round(performance.now() - t);
                },
                { source: program(0), std: STD },
            );
        // The first two builds of a kind tier up its paths through clang.
        for (let round = -2; round < ROUNDS; round++) {
            const build = await compile(program(++n));
            assert.equal(build.ok, true, build.errors.join("\n"));
            if (round >= 0) times.push(build.ms);
        }
        rows.push({
            program: name,
            "warm-up (ms)": warmUpMs,
            "median (ms)": median(times),
            "min (ms)": Math.min(...times),
            "max (ms)": Math.max(...times),
        });
    }
    console.table(rows);
} finally {
    await browser.close();
    await server.close();
}
