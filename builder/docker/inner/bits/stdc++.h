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

// GCC's std::__gcd accepts any integer type, but libc++'s internal __gcd
// only accepts unsigned types (and is only declared from C++17 on), so the
// common `__gcd(a, b)` on int / long long fails to compile. Add non-template
// overloads for every integer type: same-type calls prefer them over libc++'s
// template, including libc++'s own calls from std::gcd, which give the same
// results. The body copies GCC's (negative inputs give the same results as GCC).
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
_CPP_HERE_GCD(signed char)
_CPP_HERE_GCD(short)
_CPP_HERE_GCD(int)
_CPP_HERE_GCD(long)
_CPP_HERE_GCD(long long)
_CPP_HERE_GCD(unsigned char)
_CPP_HERE_GCD(unsigned short)
_CPP_HERE_GCD(unsigned int)
_CPP_HERE_GCD(unsigned long)
_CPP_HERE_GCD(unsigned long long)
#ifdef __SIZEOF_INT128__
_CPP_HERE_GCD(__int128)
_CPP_HERE_GCD(unsigned __int128)
#endif
#undef _CPP_HERE_GCD
} // namespace std

#endif // _CPP_HERE_BITS_STDCXX_H
