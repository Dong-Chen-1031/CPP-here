/**
 * k6 load test — 完整流程（health → status → build）
 *
 * 模擬真實使用者行為：先確認服務存活，再送出編譯請求。
 *
 * 執行方式：
 *   k6 run -e CAPTCHA_TEST_TOKEN=<your_token> full_flow.js
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const CAPTCHA_TEST_TOKEN = __ENV.CAPTCHA_TEST_TOKEN || "";

const buildDuration = new Trend("build_duration", true);
const errorRate = new Rate("errors");

export const options = {
    scenarios: {
        // 輕量持續流量：只打 health / status
        light_polling: {
            executor: "constant-arrival-rate",
            rate: 5,
            timeUnit: "1s",
            duration: "60s",
            preAllocatedVUs: 5,
            maxVUs: 20,
            exec: "pollEndpoints",
        },
        // 模擬真實使用者：帶認證送 build 請求
        build_users: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "15s", target: 5 },
                { duration: "30s", target: 10 },
                { duration: "15s", target: 0 },
            ],
            exec: "buildFlow",
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.05"],
        build_duration: ["p(90)<30000"],
        errors: ["rate<0.05"],
    },
};

const BUILD_HEADERS = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CAPTCHA_TEST_TOKEN}`,
};

// ── Scenario: pollEndpoints ────────────────────────────────────────────────
export function pollEndpoints() {
    group("health", () => {
        const r = http.get(`${BASE_URL}/health`);
        errorRate.add(
            !check(r, {
                "health 200": (res) => res.status === 200,
            }),
        );
    });

    group("status", () => {
        const r = http.get(`${BASE_URL}/status`);
        errorRate.add(
            !check(r, {
                "status 200": (res) => res.status === 200,
            }),
        );
    });

    sleep(0.2);
}

// ── Scenario: buildFlow ────────────────────────────────────────────────────
export function buildFlow() {
    // Step 1: 確認服務存活
    group("pre-check health", () => {
        const r = http.get(`${BASE_URL}/health`);
        check(r, { "pre-check 200": (res) => res.status === 200 });
    });

    // Step 2: 送出編譯請求
    group("build", () => {
        const payload = JSON.stringify({
            code: `#include <iostream>
#include <numeric>
#include <vector>
int main() {
    std::vector<int> v(100);
    std::iota(v.begin(), v.end(), 1);
    long long sum = 0;
    for (auto x : v) sum += x;
    std::cout << "Sum 1..100 = " << sum << std::endl;
    return 0;
}`,
            cpp_version: "c++20",
        });

        const r = http.post(`${BASE_URL}/build`, payload, {
            headers: BUILD_HEADERS,
            timeout: "60s",
        });

        buildDuration.add(r.timings.duration);

        const ok = check(r, {
            "build 200": (res) => res.status === 200,
            "build ok field": (res) => res.json("ok") !== undefined,
        });
        errorRate.add(!ok);
    });

    sleep(Math.random() * 3 + 2);
}
