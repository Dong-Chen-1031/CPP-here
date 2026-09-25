// @cpp_version c++17
// @label hello
// 最輕量的基準：幾乎只量到 emcc 的固定啟動成本。
#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
