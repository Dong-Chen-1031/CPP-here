// C++ includes used for precompiling -*- C++ -*-
  
 // Copyright (C) 2003-2020 Free Software Foundation, Inc.
 //
 // This file is part of the GNU ISO C++ Library.  This library is free
 // software; you can redistribute it and/or modify it under the
 // terms of the GNU General Public License as published by the
 // Free Software Foundation; either version 3, or (at your option)
 // any later version.
  
 // This library is distributed in the hope that it will be useful,
 // but WITHOUT ANY WARRANTY; without even the implied warranty of
 // MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 // GNU General Public License for more details.
  
 // Under Section 7 of GPL version 3, you are granted additional
 // permissions described in the GCC Runtime Library Exception, version
 // 3.1, as published by the Free Software Foundation.
  
 // You should have received a copy of the GNU General Public License and
 // a copy of the GCC Runtime Library Exception along with this program;
 // see the files COPYING3 and COPYING.RUNTIME respectively.  If not, see
 // <http://www.gnu.org/licenses/>.
  
 /** @file stdc++.h
  *  This is an implementation file for a precompiled header.
  */
  
#ifndef _CPP_HERE_BITS_STDCXX_H
#define _CPP_HERE_BITS_STDCXX_H

// libc++'s internal std::__gcd (C++17 on, unsigned types only) would clash
// with GCC's std::__gcd defined at the end of this file, so rename it while
// the libc++ headers are included; libc++'s own callers (std::gcd) are renamed
// with it. Not possible when the source included it before this header: see
// the end of the file.
#if !defined(_LIBCPP___NUMERIC_GCD_LCM_H) || _LIBCPP_STD_VER < 17
#define _CPP_HERE_RENAMED_GCD
#define __gcd __cpp_here_libcpp_gcd
#endif

 // 17.4.1.2 Headers
  
 // C
 #ifndef _GLIBCXX_NO_ASSERT
 #include <cassert>
 #endif
 #include <cctype>
 #include <cerrno>
 #include <cfloat>
 #include <ciso646>
 #include <climits>
 #include <clocale>
 #include <cmath>
 #include <csetjmp>
 #include <csignal>
 #include <cstdarg>
 #include <cstddef>
 #include <cstdio>
 #include <cstdlib>
 #include <cstring>
 #include <ctime>
 #include <cwchar>
 #include <cwctype>
  
 #if __cplusplus >= 201103L
 #include <ccomplex>
 #include <cfenv>
 #include <cinttypes>
 #include <cstdalign>
 #include <cstdbool>
 #include <cstdint>
 #include <ctgmath>
 #include <cuchar>
 #endif
  
 // C++
 #include <algorithm>
 #include <bitset>
 #include <complex>
 #include <deque>
 #include <exception>
 #include <fstream>
 #include <functional>
 #include <iomanip>
 #include <ios>
 #include <iosfwd>
 #include <iostream>
 #include <istream>
 #include <iterator>
 #include <limits>
 #include <list>
 #include <locale>
 #include <map>
 #include <memory>
 #include <new>
 #include <numeric>
 #include <ostream>
 #include <queue>
 #include <set>
 #include <sstream>
 #include <stack>
 #include <stdexcept>
 #include <streambuf>
 #include <string>
 #include <typeinfo>
 #include <utility>
 #include <valarray>
 #include <vector>
  
 #if __cplusplus >= 201103L
 #include <array>
 #include <atomic>
 #include <chrono>
 #include <codecvt>
 #include <condition_variable>
 #include <forward_list>
 #include <future>
 #include <initializer_list>
 #include <mutex>
 #include <random>
 #include <ratio>
 #include <regex>
 #include <scoped_allocator>
 #include <system_error>
 #include <thread>
 #include <tuple>
 #include <typeindex>
 #include <type_traits>
 #include <unordered_map>
 #include <unordered_set>
 #endif
  
 #if __cplusplus >= 201402L
 #include <shared_mutex>
 #endif
  
 #if __cplusplus >= 201703L
 #include <any>
 #include <charconv>
 // #include <execution>
 #include <filesystem>
 #include <optional>
 #include <memory_resource>
 #include <string_view>
 #include <variant>
 #endif
  
 #if __cplusplus > 201703L
 #include <bit>
 #include <compare>
 #include <concepts>
 #include <numbers>
 #include <ranges>
 #include <span>
 #include <stop_token>
 // #include <syncstream>
 #include <version>
 #endif

// C++23 headers (newer GCC versions of this file include them too); guarded
// with __has_include since libc++ does not ship all of them yet
#if __cplusplus > 202002L
#if __has_include(<expected>)
#include <expected>
#endif
#if __has_include(<flat_map>)
#include <flat_map>
#endif
#if __has_include(<flat_set>)
#include <flat_set>
#endif
#if __has_include(<mdspan>)
#include <mdspan>
#endif
#if __has_include(<print>)
#include <print>
#endif
#if __has_include(<spanstream>)
#include <spanstream>
#endif
#if __has_include(<stacktrace>)
#include <stacktrace>
#endif
#if __has_include(<stdfloat>)
#include <stdfloat>
#endif
#endif

// GCC's std::__gcd, which competitive programmers use on any integer type.
// libc++'s internal one only accepts unsigned types (and is only declared from
// C++17 on), so `__gcd(a, b)` on int / long long would not compile.
#ifdef _CPP_HERE_RENAMED_GCD
#undef __gcd
#undef _CPP_HERE_RENAMED_GCD
// The same template as GCC's, so it behaves the same: a user's own
// non-template __gcd wins over it, `__gcd<long long>(a, b)` works and the
// result has the arguments' type.
namespace std {
template <typename _EuclideanRingElement>
inline _LIBCPP_CONSTEXPR_SINCE_CXX14 _EuclideanRingElement
__gcd(_EuclideanRingElement __m, _EuclideanRingElement __n) {
  while (__n != 0) {
    _EuclideanRingElement __t = __m % __n;
    __m = __n;
    __n = __t;
  }
  return __m;
}
} // namespace std
#else
// The source included libc++'s __gcd before this header (C++17 on), so its
// template can't be renamed or replaced. Add non-template overloads for the
// signed integer types instead: same-type calls prefer them over libc++'s
// template, which keeps handling the unsigned ones with the same results.
// Unlike GCC, a user's own non-template __gcd on one of these types is then
// ambiguous, but only in sources that include e.g. <numeric> first.
namespace std {
#define _CPP_HERE_GCD(_Tp)                                                \
  inline _LIBCPP_CONSTEXPR_SINCE_CXX14 _Tp __gcd(_Tp __m, _Tp __n) {      \
    while (__n != 0) {                                                    \
      _Tp __t = __m % __n;                                                \
      __m = __n;                                                          \
      __n = __t;                                                          \
    }                                                                     \
    return __m;                                                           \
  }
_CPP_HERE_GCD(char)
_CPP_HERE_GCD(signed char)
_CPP_HERE_GCD(short)
_CPP_HERE_GCD(int)
_CPP_HERE_GCD(long)
_CPP_HERE_GCD(long long)
#ifdef __SIZEOF_INT128__
_CPP_HERE_GCD(__int128)
#endif
#undef _CPP_HERE_GCD
} // namespace std
#endif

#endif // _CPP_HERE_BITS_STDCXX_H
