#include <bits/stdc++.h>
using namespace std;

// A deliberately heavy program: regex, iostreams of several types and many
// container instantiations, to see how delivery scales with a bigger .wasm.
template <class K, class V>
string dump(const map<K, V> &m) {
    ostringstream os;
    for (auto &[k, v] : m) os << k << ':' << v << ' ';
    return os.str();
}

int main() {
    string line;
    getline(cin, line);
    regex word(R"((\w+))");
    map<string, int> freq;
    for (sregex_iterator it(line.begin(), line.end(), word), end; it != end; ++it)
        freq[(*it)[1]]++;
    map<int, double> md{{1, 1.5}, {2, 2.5}};
    map<long long, string> ms{{3, "x"}};
    unordered_map<string, vector<int>> um;
    multiset<double> mset{1.0, 2.0};
    bitset<128> bs(12345);
    complex<double> c(1, 2);
    function<int(int)> fib = [&](int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); };
    tuple<int, string, double> t{1, "a", 2.0};
    wstringstream ws;
    ws << L"wide " << 42;
    stringstream ss;
    ss << hex << 255 << ' ' << scientific << 3.14159 << ' ' << c << ' ' << bs.count();
    cout << dump(freq) << dump(md) << dump(ms) << um.size() << mset.size() << ' '
         << fib(10) << get<1>(t) << ' ' << ss.str() << ' ' << ws.str().size() << endl;
    cerr << put_time(localtime(new time_t(0)), "%Y") << endl;
}
