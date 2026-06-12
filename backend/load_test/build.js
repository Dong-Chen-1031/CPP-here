/**
 * k6 load test — POST /build
 *
 * 使用 CAPTCHA_TEST_TOKEN 繞過人機驗證。
 *
 * 執行方式：
 *   k6 run -e CAPTCHA_TEST_TOKEN=<your_token> build.js
 *
 * 若後端設定了 BYPASS_CAPTCHA=true，可省略 token 環境變數。
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const CAPTCHA_TEST_TOKEN = __ENV.CAPTCHA_TEST_TOKEN || "";

const buildDuration = new Trend("build_duration", true);
const buildErrorRate = new Rate("build_errors");
const requestErrorRate = new Rate("request_errors");
const buildCount = new Counter("build_requests_total");

// export const options = {
//     stages: [
//         { duration: "10s", target: 10 },
//         { duration: "30s", target: 50 },
//         { duration: "10s", target: 10 },
//     ],
//     thresholds: {
//         http_req_failed: ["rate<0.05"],
//         build_duration: ["p(95)<30000"], // 編譯最多 30s
//         request_errors: ["rate<0.05"],
//     },
// };

export const options = {
    scenarios: {
        ramp_up: {
            executor: "constant-arrival-rate",
            rate: 1,
            timeUnit: "1s",
            duration: "1m",
            preAllocatedVUs: 50, // 預先分配
            maxVUs: 100, // 不夠時最多可以開到這個數
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.05"],
        build_duration: ["p(95)<30000"], // 編譯最多 30s
        request_errors: ["rate<0.05"],
    },
};

const HEADERS = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CAPTCHA_TEST_TOKEN}`,
};

/** 測試用 C++ 程式碼集合，每次隨機選一個 */
const CPP_SAMPLES = [
    {
        code: `#include <iostream>
int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}`,
        cpp_version: "c++17",
        label: "hello_world",
    },
    {
        code: `#include <iostream>
#include <vector>
#include <algorithm>
int main() {
    std::vector<int> v = {5, 3, 1, 4, 2};
    std::sort(v.begin(), v.end());
    for (auto x : v) std::cout << x << " ";
    return 0;
}`,
        cpp_version: "c++17",
        label: "sort_vector",
    },
    {
        code: `#include <iostream>
#include <string>
int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}
int main() {
    for (int i = 0; i < 10; i++)
        std::cout << fibonacci(i) << " ";
    return 0;
}`,
        cpp_version: "c++14",
        label: "fibonacci",
    },
    {
        code: `#include <iostream>
#include <map>
#include <string>
int main() {
    std::map<std::string, int> freq;
    std::string words[] = {"apple", "banana", "apple", "cherry", "banana", "apple"};
    for (auto& w : words) freq[w]++;
    for (auto& [k, v] : freq) std::cout << k << ": " << v << "\\n";
    return 0;
}`,
        cpp_version: "c++20",
        label: "word_frequency",
    },
    {
        // 故意有編譯錯誤，測試 error 回應
        code: `#include <iostream>
int main() {
    undeclared_variable = 42;
    return 0;
}`,
        cpp_version: "c++17",
        label: "compile_error",
    },
];

export default function () {
    const sample = CPP_SAMPLES[Math.floor(Math.random() * CPP_SAMPLES.length)];
    const uniqueCode = `// run-id: ${uuidv4()}\n${sample.code}`;
    const payload = JSON.stringify({
        code: uniqueCode,
        cpp_version: sample.cpp_version,
    });

    const res = http.post(`${BASE_URL}/build`, payload, {
        headers: HEADERS,
        tags: { sample: sample.label },
        timeout: "60s",
    });

    buildCount.add(1);
    buildDuration.add(res.timings.duration);

    const reqOk = check(res, {
        "build: status 200": (r) => r.status === 200,
        "build: response has ok field": (r) => r.json("ok") !== undefined,
    });
    requestErrorRate.add(!reqOk);

    if (res.status === 200) {
        const body = res.json();
        buildErrorRate.add(!body.ok);
    }

    // sleep(Math.random() * 5 + 5);
}
