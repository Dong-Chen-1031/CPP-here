// A #define before the include has to reach the header, so this source must
// not get the PCH (which is loaded before line 1): with it, NDEBUG would come
// too late and the assert would fire.
#define NDEBUG
#include <bits/stdc++.h>
int main() {
    assert(false);
    std::puts("ok");
}
