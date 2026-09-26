// @cpp_version c++17
// @label stl_sort
// 一般使用者的典型程式：拉進幾個 STL 標頭，編譯成本中等。
#include <algorithm>
#include <iostream>
#include <map>
#include <string>
#include <vector>

int main() {
    std::vector<int> v = {5, 3, 9, 1, 4, 8, 2, 7, 6};
    std::sort(v.begin(), v.end());
    for (int x : v) std::cout << x << ' ';
    std::cout << '\n';

    std::map<std::string, int> freq;
    for (const std::string& w : {"apple", "banana", "apple", "cherry", "banana"})
        freq[w]++;
    for (const auto& [key, count] : freq) std::cout << key << ": " << count << '\n';

    return 0;
}
