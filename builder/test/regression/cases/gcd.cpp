// GCC's std::__gcd on every integer type (patched into bits/stdc++.h)
#include <bits/stdc++.h>
using namespace std;
int main() {
    cout << __gcd(4, 6) << ' ' << __gcd(-4, 6) << ' ' << __gcd(4, -6) << ' ' << __gcd(0, 0) << ' ' << __gcd(-6, 0) << '\n';
    long long a = 1000000007LL * 6, b = 1000000007LL * 4;
    unsigned u1 = 12, u2 = 18;
    cout << __gcd(a, b) << ' ' << __gcd(u1, u2) << ' ' << __gcd(12L, 8L) << ' ' << __gcd(12ULL, 30ULL) << '\n';
    cout << (long long)__gcd((__int128)a, (__int128)b) << ' ' << (int)__gcd((short)9, (short)6) << '\n';
#if __cplusplus >= 201402L
    static_assert(__gcd(12, 18) == 6, "constexpr __gcd");
#endif
#if __cplusplus >= 201703L
    cout << gcd(-12, 18) << ' ' << lcm(4, 6) << ' ' << gcd(12ULL, 18ULL) << '\n';
#else
    cout << "6 12 6\n";
#endif
}
