// @std: c++17 c++20 c++23
#include <bits/stdc++.h>
using namespace std;
template <class T> auto describe(T v) {
    if constexpr (is_integral_v<T>) return "int:" + to_string(v);
    else return string("other");
}
int main() {
    map<string, int> m{{"a", 1}, {"b", 2}};
    for (auto &[k, v] : m) cout << k << v << ' ';
    optional<int> o;
    variant<int, string> var = string("v");
    string_view sv = "view";
    cout << o.value_or(-1) << ' ' << get<string>(var) << ' ' << sv.substr(1) << ' ' << describe(5) << ' ' << describe(1.5) << '\n';
    auto [q, r] = pair{17 / 5, 17 % 5};
    cout << q << r << ' ' << clamp(15, 0, 10) << ' ' << gcd(24, 36) << ' ' << lcm(4, 10) << '\n';
}
