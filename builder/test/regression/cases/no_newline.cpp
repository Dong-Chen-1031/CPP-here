// Output without any newline (the reason stdout_lib.js exists, C++ Here CPP-8)
#include <cstdio>
int main() {
    for (int i = 0; i < 200000; i++) std::putchar('a' + i % 26);
    return 0;
}
