#include <cstdio>

int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) != 2) a = b = 0;
    printf("%d\n", a + b);
}
