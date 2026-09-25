// @expect: compile-error compile_error.cpp:6:7: error: no member named 'push_bak'
#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> v;
    v.push_bak(1);
}
