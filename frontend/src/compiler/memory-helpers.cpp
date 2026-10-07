// This is a separate translation unit so user macros cannot change it.
extern "C" {
__attribute__((import_module("env"), import_name("memory_limit"), noreturn))
void cpp_here_memory_limit();
void* __real_malloc(__SIZE_TYPE__);
void* __real_calloc(__SIZE_TYPE__, __SIZE_TYPE__);
void* __real_realloc(void*, __SIZE_TYPE__);
void* __wrap_malloc(__SIZE_TYPE__ n) {
    void* p = __real_malloc(n);
    if (!p && n) cpp_here_memory_limit();
    return p;
}
void* __wrap_calloc(__SIZE_TYPE__ n, __SIZE_TYPE__ s) {
    void* p = __real_calloc(n, s);
    if (!p && n && s) cpp_here_memory_limit();
    return p;
}
void* __wrap_realloc(void* old, __SIZE_TYPE__ n) {
    void* p = __real_realloc(old, n);
    if (!p && n) cpp_here_memory_limit();
    return p;
}
}
