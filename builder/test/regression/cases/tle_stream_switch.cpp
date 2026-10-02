// @expect: tle
// @std: c++17
// The first write after a quiet stretch reaches the page at once, also when it
// switches between stdout and stderr (CPP-164)
#include <bits/stdc++.h>
using namespace std;
static void wait_ms(int ms) {
    auto end = chrono::steady_clock::now() + chrono::milliseconds(ms);
    while (chrono::steady_clock::now() < end) {}
}
int main() {
    cout << "answer\n" << flush;
    wait_ms(200);
    cerr << "debug\n";
    wait_ms(200);
    cout << "more\n" << flush;
    volatile unsigned long long spin = 0;
    while (true) spin = spin + 1;
}
