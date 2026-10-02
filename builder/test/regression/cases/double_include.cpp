// Things people put around the include: pragmas before it, including it twice,
// `#define int long long` after it. The PCH must not change the meaning.
#pragma GCC optimize("O3")
#include <bits/stdc++.h>
#include <bits/stdc++.h>
#include <vector>
#define int long long
using namespace std;
signed main() {
    int x = 3000000000;
    vector<int> v{x, 1, 2};
    sort(v.begin(), v.end());
    cout << v[2] * 2 << ' ' << sizeof(int) << ' ' << __gcd(x, 1500000000LL) << '\n';
}
