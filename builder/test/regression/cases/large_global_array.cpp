// @std: c++17
// A 16 MB zero-initialized global array. Its object file holds the zeros, and
// the in-browser compiler wrote such files in O(n²) time (seconds per
// megabyte); wasm-ld leaves the zeros out of main.wasm.
#include <bits/stdc++.h>
int a[1 << 22];
int main() {
    a[(1 << 22) - 1] = 17;
    long long s = 0;
    for (int i = 0; i < (1 << 22); i++) s += a[i];
    std::cout << s << " " << sizeof(a) << "\n";
}
