// 載入 Emscripten 產生的膠水程式碼 (my_app.js)
importScripts('output/build.js');

self.onmessage = async (e) => {
  const { taskId, inputData } = e.data;

  // 1. 將輸入字串轉為 Uint8Array 緩衝區
  // 記得加上 \n，否則 C++ 的 std::cin 或 scanf 可能會一直等待換行
  const encoder = new TextEncoder();
  const inputBuffer = encoder.encode(inputData + "\n");
  let inputIndex = 0;

  // 2. 定義 Module 配置物件
  const wasmConfig = {
    // 攔截 stdout (printf / std::cout)
    print: function(text) {
      self.postMessage({ type: 'stdout', taskId, content: text });
    },

    // 攔截 stderr (fprintf(stderr, ...) / std::cerr)
    printErr: function(text) {
      self.postMessage({ type: 'stderr', taskId, content: text });
    },

    // 關鍵：直接實作 stdin 讀取邏輯 (不需 FS)
    stdin: function() {
      if (inputIndex < inputBuffer.length) {
        return inputBuffer[inputIndex++];
      }
      return null; // 回傳 null 代表 EOF (End of File)
    },

    // 初始化完成後的回調
    onRuntimeInitialized: function() {
      self.postMessage({ type: 'status', taskId, content: 'Running' });
    }
  };

  try {
    // 3. 執行工廠函式
    // 這會載入 .wasm 並自動呼叫 C++ 的 main()
    const instance = await createMyModule(wasmConfig);
    
    // 執行完畢
    self.postMessage({ type: 'exit', taskId });
  } catch (err) {
    self.postMessage({ type: 'error', taskId, content: err.message });
  }
};