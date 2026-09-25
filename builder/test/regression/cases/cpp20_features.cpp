// @std: c++20 c++23
#include <bits/stdc++.h>
using namespace std;
template <class T> concept Number = integral<T> || floating_point<T>;
auto twice(Number auto x) { return x * 2; }
struct P {
    int a, b;
    auto operator<=>(const P &) const = default;
};
int main() {
    vector<int> v{5, 1, 4, 2, 3};
    ranges::sort(v);
    auto even = v | views::filter([](int x) { return x % 2 == 0; }) | views::transform([](int x) { return x * 10; });
    for (int x : even) cout << x << ' ';
    span<int> s(v.data(), 3);
    cout << s.size() << ' ' << twice(21) << ' ' << (P{1, 2} < P{1, 3}) << ' ' << popcount(255u) << ' ' << bit_width(8u) << '\n';
    cout << fixed << setprecision(5) << numbers::pi << ' ' << v.front() << ' ' << set<int>(v.begin(), v.end()).contains(3) << '\n';
}
