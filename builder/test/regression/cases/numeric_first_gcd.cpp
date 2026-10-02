// <numeric> before bits/stdc++.h: libc++'s own __gcd is already declared (C++17
// on) and can't be renamed, so the header falls back to overloads
#include <numeric>
#include <bits/stdc++.h>
using namespace std;
int main() {
    cout << __gcd(4, 6) << ' ' << __gcd(-4, 6) << ' ' << __gcd(12u, 18u) << ' ' << __gcd(12LL, 8LL) << '\n';
}
