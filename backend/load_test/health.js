/**
 * k6 load test — GET /health & GET /status
 *
 * 執行方式：
 *   k6 run health.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

const healthDuration = new Trend("health_duration", true);
const statusDuration = new Trend("status_duration", true);
const errorRate = new Rate("errors");

export const options = {
    stages: [
        // { duration: "10s", target: 100 },
        { duration: "10s", target: 300 },
        // { duration: "10s", target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.01"],
        health_duration: ["p(95)<200"],
        status_duration: ["p(95)<500"],
    },
};

export default function () {
    // GET /health
    const healthRes = http.get(`${BASE_URL}/health`);
    const healthOk = check(healthRes, {
        "health status 200": (r) => r.status === 200,
        'health body has "ok"': (r) => r.json("status") === "ok",
    });
    healthDuration.add(healthRes.timings.duration);
    errorRate.add(!healthOk);

    // GET /status
    const statusRes = http.get(`${BASE_URL}/status`);
    const statusOk = check(statusRes, {
        "status 200": (r) => r.status === 200,
        "status has total_count": (r) => r.json("total_count") !== undefined,
    });
    statusDuration.add(statusRes.timings.duration);
    errorRate.add(!statusOk);

    sleep(0.5);
}
