// @std: c++17
// clock() for timing, as in `clock() / CLOCKS_PER_SEC`. WASI has no process
// clocks: without its emulation (from the wall clock) this fails to link.
#include <bits/stdc++.h>
int main() {
    clock_t start = clock();
    volatile long long s = 0;
    for (int i = 0; i < 1000000; i++) s += i;
    clock_t end = clock();
    printf("%d %d\n", start != (clock_t)-1 && end >= start,
           CLOCKS_PER_SEC > 0);
}
