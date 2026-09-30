// @std: c++98
// C++98 has no PCH; bits/stdc++.h must still compile there.
#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> v;
    for (int i = 5; i > 0; --i) v.push_back(i);
    sort(v.begin(), v.end());
    map<string, int> m;
    m["a"] = v[0];
    m["b"] = v[4];
    for (map<string, int>::iterator it = m.begin(); it != m.end(); ++it)
        cout << it->first << '=' << it->second << ' ';
    cout << __gcd(12, 18) << '\n';
}
