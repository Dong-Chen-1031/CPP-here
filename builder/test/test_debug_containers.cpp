#include <bits/stdc++.h>
using namespace std;

int main() {
    // Basic data types
    int num = 42;
    char ch = 'A';
    long long bigNum = 1234567890LL;
    string text = "Hello World";
    
    // Array
    array<int, 5> arr = {1, 2, 3, 4, 5};
    
    // Sequence containers
    vector<int> vec = {10, 20, 30, 40, 50};
    deque<int> dq = {1, 2, 3, 4};
    list<int> lst = {100, 200, 300};
    
    // Associative containers
    set<int> s = {5, 3, 8, 1, 9};
    multiset<int> ms = {5, 3, 8, 1, 9, 5};
    map<string, int> mp = {{"apple", 1}, {"banana", 2}, {"cherry", 3}};
    multimap<string, int> mmp = {{"apple", 1}, {"apple", 2}, {"banana", 3}};
    
    // Unordered containers
    unordered_set<int> us = {10, 20, 30};
    unordered_multiset<int> ums = {10, 20, 30, 10};
    unordered_map<string, int> um = {{"key1", 100}, {"key2", 200}};
    unordered_multimap<string, int> umm = {{"key1", 100}, {"key1", 101}, {"key2", 200}};
    
    // Container adapters
    stack<int> st;
    st.push(1);
    st.push(2);
    st.push(3);
    
    queue<int> q;
    q.push(10);
    q.push(20);
    q.push(30);
    
    priority_queue<int> pq;
    pq.push(30);
    pq.push(10);
    pq.push(20);
    
    cout << "Testing all container types..." << endl;
    
    // This is where we'll set breakpoints to test debugging
    cout << "Basic types: " << num << ", " << ch << ", " << bigNum << ", " << text << endl;
    cout << "Container sizes: vec=" << vec.size() << ", dq=" << dq.size() << ", lst=" << lst.size() << endl;
    cout << "Set sizes: s=" << s.size() << ", ms=" << ms.size() << ", mp=" << mp.size() << endl;
    cout << "Unordered sizes: us=" << us.size() << ", um=" << um.size() << endl;
    cout << "Adapter sizes: st=" << st.size() << ", q=" << q.size() << ", pq=" << pq.size() << endl;
    
    return 0;
}