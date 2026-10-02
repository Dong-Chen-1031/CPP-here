// @std: c++17
// Multi-byte UTF-8 left in the stdio buffer at exit: goes through the exit
// fflush(0) and then the TextDecoder flush in stdout_lib.js
#include <cstdio>
int main() { std::printf("答案：%d，結束", 7); }
