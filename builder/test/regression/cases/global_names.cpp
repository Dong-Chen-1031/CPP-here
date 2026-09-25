// @std: c++17
// Without bits/stdc++.h no PCH is used, so names that would clash with it
// (count, next, left from using namespace std) stay usable.
#include <cstdio>
int count = 3, next = 4, left = 5;
int main() { std::printf("%d\n", count + next + left); }
