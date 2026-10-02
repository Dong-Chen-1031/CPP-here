// @std: c++98 c++11 c++17 c++23
// Reads until EOF through the custom fd_read (stdin_lib.js)
#include <cstdio>
#include <iostream>
#include <string>
int main() {
    long long sum = 0, x;
    int n = 0;
    std::string word;
    std::cin >> word;
    while (std::cin >> x) { sum += x; n++; }
    std::printf("%s %d %lld\n", word.c_str(), n, sum);
    return 0;
}
