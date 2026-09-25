// @std: c++17
// @expect: limit-output
#include <cstdio>
int main() {
    while (true) std::fputs("spam spam spam spam spam spam spam spam\n", stdout);
}
