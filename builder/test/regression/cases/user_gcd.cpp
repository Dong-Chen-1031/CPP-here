// A user's own non-template __gcd wins over GCC's std::__gcd template, as with
// GCC; it must not be ambiguous
#include <bits/stdc++.h>
using namespace std;
long long __gcd(long long a, long long b) { return b ? __gcd(b, a % b) : a; }
int main() {
    cout << __gcd(4LL, 6LL) << ' ' << __gcd(9, 6) << '\n';
}
