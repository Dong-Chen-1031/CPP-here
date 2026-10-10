// @std: c++17
// A 4 MB array on the stack, as in `int main() { int a[1 << 20]; ... }`. Needs
// the 8 MB stack: with wasm-ld's default 64 KB it silently overwrites globals.
#include <cstdio>
int sum(volatile int* a, int n) {
    int s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
int main() {
    volatile int a[1 << 20];
    for (int i = 0; i < (1 << 20); i++) a[i] = i & 7;
    printf("%d\n", sum(a, 1 << 20));
}
