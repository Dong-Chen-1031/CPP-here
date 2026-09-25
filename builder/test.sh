cd /docker
docker build -t cpp-wasm-sandbox:v1 . 
cd .. 
./build.sh test/helloworld.cpp