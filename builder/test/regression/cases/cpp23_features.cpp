// @std: c++23
#include <bits/stdc++.h>
using namespace std;
expected<int, string> parse(string_view s) {
    if (s.empty()) return unexpected("empty");
    return int(s.size());
}
int main() {
    vector<int> v{3, 1, 2};
    auto w = v | views::transform([](int x) { return x + 1; }) | ranges::to<vector>();
    cout << w[0] << w[1] << w[2] << ' ' << parse("abc").value() << ' ' << parse("").error() << ' ';
    string s = "hello world";
    cout << s.contains("wor") << ' ' << int(to_underlying(byte{7})) << '\n' << flush;
    flat_map<int, char> fm{{2, 'b'}, {1, 'a'}};
    println("{} {}{} {:>4}", fm.size(), fm.begin()->second, fm.rbegin()->second, 3.5);
}
