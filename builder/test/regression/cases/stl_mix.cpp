// Typical competitive-programming program
#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<long long> a(n);
    for (auto &x : a) cin >> x;
    sort(a.begin(), a.end());
    map<long long, int> cnt;
    for (auto x : a) cnt[x]++;
    set<long long> s(a.begin(), a.end());
    priority_queue<long long, vector<long long>, greater<long long>> pq(a.begin(), a.end());
    unordered_map<string, int> um;
    um["x"] = 7;
    deque<int> dq{1, 2, 3};
    dq.push_front(0);
    string t = "hello";
    reverse(t.begin(), t.end());
    cout << a.front() << ' ' << a.back() << ' ' << cnt.size() << ' ' << s.size() << '\n';
    cout << pq.top() << ' ' << um["x"] << ' ' << dq.front() << ' ' << t << '\n';
    cout << fixed << setprecision(4) << sqrt(2.0) << ' ' << accumulate(a.begin(), a.end(), 0LL) << '\n';
    cout << *lower_bound(a.begin(), a.end(), 4) << ' ' << bitset<8>(37) << ' ' << __builtin_popcount(255) << '\n';
    long long big = LLONG_MAX;
    cout << big << ' ' << INT_MIN << ' ' << numeric_limits<double>::max() << '\n';
}
