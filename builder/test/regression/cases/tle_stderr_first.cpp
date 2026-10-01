// @expect: tle
// @std: c++17
// The program's first write goes to stderr and then it hangs: the page must
// still get it before the TLE terminates the worker (CPP-164)
#include <bits/stdc++.h>
using namespace std;
int main() {
    cerr << "debug\n";
    volatile unsigned long long spin = 0;
    while (true) spin = spin + 1;
}
