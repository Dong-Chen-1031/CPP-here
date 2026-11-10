#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long k;
    cin >> n >> k;

    unordered_map<long long, int> seen;
    long long pairs = 0;
    for (int i = 0; i < n; i++) {
        long long a;
        cin >> a;
        pairs += seen[k - a];
        seen[a]++;
    }

    cout << pairs << '\n';
    return 0;
}
