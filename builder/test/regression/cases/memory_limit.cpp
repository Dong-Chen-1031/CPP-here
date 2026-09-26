// @std: c++17
// @expect: limit-memory
// Grows past -sMAXIMUM_MEMORY=512MB; -sABORTING_MALLOC makes it abort (OOM)
#include <vector>
#include <cstdio>
int main() {
    std::vector<std::vector<char>> blocks;
    for (int i = 0; i < 100; i++) blocks.emplace_back(64 << 20, char(i));
    std::printf("%zu\n", blocks.size());
}
