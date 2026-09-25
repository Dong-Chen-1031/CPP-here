// @std: c++17
// @expect: compile-error recursive template instantiation exceeded maximum depth of 50
// -ftemplate-depth=50 must still apply when the PCH is used
#include <bits/stdc++.h>
template <int N> struct F { static const int v = F<N - 1>::v + 1; };
template <> struct F<0> { static const int v = 0; };
int main() { return F<100>::v; }
