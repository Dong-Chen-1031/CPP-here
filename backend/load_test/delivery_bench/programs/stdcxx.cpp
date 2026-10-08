#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n = 0;
    cin >> n;
    vector<long long> v(n);
    for (auto &x : v) cin >> x;
    sort(v.begin(), v.end());
    map<long long, int> cnt;
    set<long long> seen;
    priority_queue<long long> pq;
    unordered_map<long long, long long> um;
    for (auto x : v) {
        cnt[x]++;
        seen.insert(x);
        pq.push(x);
        um[x % 7] += x;
    }
    string s = to_string(accumulate(v.begin(), v.end(), 0LL));
    reverse(s.begin(), s.end());
    deque<int> dq{1, 2, 3};
    cout << fixed << setprecision(3) << (n ? (double)v.back() / n : 0.0) << ' '
         << seen.size() << ' ' << (pq.empty() ? 0 : pq.top()) << ' ' << s << ' '
         << dq.size() << ' ' << um.size() << '\n';
}
