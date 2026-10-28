// @std: c++11 c++17
// long double I/O through iostream and printf/scanf. WASI's libc leaves long
// double formatting out unless linked with -lc-printscan-long-double, and the
// program then traps at the first one.
#include <bits/stdc++.h>
int main() {
    long double a, b;
    std::cin >> a;
    scanf("%Lf", &b);
    std::cout << a << " " << std::fixed << std::setprecision(3) << a / 2
              << "\n";
    printf("%.2Lf %Lg\n", b * 2, b);
}
