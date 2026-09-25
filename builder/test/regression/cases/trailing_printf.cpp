// @std: c++98 c++11 c++17 c++23
// C stdio output still buffered at exit must be flushed: stdout_lib.js replaces
// fd_write and, before the fix, dropped Emscripten's exit fflush(0), so this
// printed nothing. (Keep it C stdio only: libc++ flushes stdout when cout is
// destroyed, which would hide the bug.)
#include <cstdio>
int main() {
    std::printf("answer: %d", 42);
    std::fprintf(stderr, "to stderr");
    return 0;
}
