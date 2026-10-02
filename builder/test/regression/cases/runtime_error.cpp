// @std: c++17
// @expect: runtime-error divide by zero
#include <cstdio>
int main() {
    volatile int zero = 0;
    std::printf("%d\n", 1 / zero);
}
