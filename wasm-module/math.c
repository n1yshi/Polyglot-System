#include <emscripten.h>
#include <stdint.h>
#include <math.h>

EMSCRIPTEN_KEEPALIVE
uint64_t fibonacci(int n) {
    if (n <= 1) return n;
    
    uint64_t a = 0, b = 1, temp;
    for (int i = 2; i <= n; i++) {
        temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}

EMSCRIPTEN_KEEPALIVE
int prime_check(uint64_t n) {
    if (n < 2) return 0;
    if (n == 2) return 1;
    if (n % 2 == 0) return 0;
    
    for (uint64_t i = 3; i * i <= n; i += 2) {
        if (n % i == 0) return 0;
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE
double fast_sqrt(double x) {
    return sqrt(x);
}

EMSCRIPTEN_KEEPALIVE
double fast_sin(double x) {
    return sin(x);
}

EMSCRIPTEN_KEEPALIVE
double fast_cos(double x) {
    return cos(x);
}

EMSCRIPTEN_KEEPALIVE
double fast_pow(double base, double exp) {
    return pow(base, exp);
}