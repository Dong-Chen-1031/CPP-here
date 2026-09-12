// @cpp_version c++20
// @label template_heavy
// 重編譯樣本：大量模板實例化 + constexpr 運算，用來壓 CPU-bound 的編譯路徑。
#include <array>
#include <iostream>
#include <tuple>
#include <utility>

template <int N>
struct Fib {
    static constexpr long long value = Fib<N - 1>::value + Fib<N - 2>::value;
};
template <>
struct Fib<0> {
    static constexpr long long value = 0;
};
template <>
struct Fib<1> {
    static constexpr long long value = 1;
};

template <std::size_t N>
constexpr std::array<long long, N> sieve_sums() {
    std::array<long long, N> out{};
    for (std::size_t i = 0; i < N; ++i) {
        long long acc = 0;
        for (std::size_t j = 2; j <= i; ++j)
            if (i % j == 0) acc += static_cast<long long>(j);
        out[i] = acc;
    }
    return out;
}

template <std::size_t... Is>
void print_fibs(std::index_sequence<Is...>) {
    ((std::cout << Fib<Is>::value << ' '), ...);
    std::cout << '\n';
}

int main() {
    print_fibs(std::make_index_sequence<40>{});

    constexpr auto sums = sieve_sums<256>();
    long long total = 0;
    for (long long s : sums) total += s;
    std::cout << "divisor sum total = " << total << '\n';

    return 0;
}
