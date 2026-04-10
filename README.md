# C++ Here - Online C++ Editor

> This readme also has a [Traditional Chinese version](README-TW.md).

C++ Here is a lightweight and fast online C++ execution and validation platform. It allows users to write, compile, and test C++ code directly in their browsers.

![Screenshot](screenshot/image.png)

> Try it now: https://cpp.doong.me

## Features

- **Online Compilation & Instant Execution**
  Compiles C++ code into WebAssembly modules and executes them directly in the frontend, without any resource limitations. It eliminates the need for backend compilation for every test, significantly improving execution speed.

- **Test Case Support**
  Users can add multiple test cases for their code. The system will automatically execute and display the results of each test case, helping users verify the correctness of their code.

- **Designed for Competitive Programming**
  The features and interface design of C++ Here are particularly suitable for the needs of Competitive Programming, allowing users to quickly test and verify their solutions.

- **Real-time Error Prompts**
  If an error occurs during compilation, the system will highlight the error location and provide detailed error messages, helping users quickly locate the problem and fix the code.

- **Multi-platform Support**
  Whether on a desktop browser or a mobile device, C++ Here provides a smooth user experience, allowing users to write and test C++ code anytime, anywhere.

- **Simple Yet Powerful Editor**
  The frontend uses a minimalist interface but has complete features, providing a good user experience.

- **Smart Compilation Cache (Catch)**
  The backend implements a compilation result caching feature. When a user submits code identical to a past submission, the system will automatically compare hash values and return the cached execution result directly, significantly reducing duplicate compilation time and server computational load.

- **Modern and Fluid UI**
  The frontend is built with the Astro framework combined with React components, ensuring ultimate page load speeds and smooth interactive experiences.

- **i18n**
  Supports a multi-language interface, allowing users to switch the interface language according to their preference to enhance user experience.

- **Security**
  The backend uses sandbox technology to isolate the execution environment, ensuring that the code submitted by users does not pose a security threat to the server.

- **Open Source**
  The source code of C++ Here is completely open. We welcome the community to participate and contribute to keep the project growing and improving.

- **Free to Use**
  C++ Here provides completely free online C++ editing and execution services, making it easy for everyone to learn and use C++.

- **Simple and Elegant, Without Losing Power**
  Although feature-rich, the user interface of C++ Here remains simple and elegant, allowing users to focus on the code itself instead of being distracted by too many functional options.

- **Import Test Data**
  Import test data from competitive programming platforms with one click via a browser extension, supporting over 100 mainstream CP platforms.

## Tech Stack

- **Frontend**: Astro, Bun, Motion, React, Shadcn, Tailwind CSS, TypeScript, axios, cloudflare turnstile, codemirror, i18next, Jotai Atom, lucide
- **Browser Extension**: Bun, TypeScript, esbuild, web-ext
- **Backend**: FastAPI, PyJWT, PyTurnstile, Python, SQLAlchemy, Uvicorn, aiodocker, aiofiles, aiosqlite, apscheduler

## Principles and Advantages

The main difference between C++ Here and other online C++ editors is that we compile C++ files into WebAssembly and execute them directly in the frontend. The advantages of this approach are:

1. **Fast**: Since the compiled WebAssembly modules can run directly in the browser, there is no need to rely on the backend for execution every time, significantly improving execution speed.
2. **Secure**: WebAssembly runs in the browser and features sandbox isolation, which effectively prevents malicious code from threatening the system.
3. **Concurrent**: Executing WebAssembly modules on the frontend can leverage the browser's multi-threading capabilities for more efficient concurrent execution, which is particularly suitable for handling numerous test cases in competitive programming.
4. **Unlimited**: Because the execution happens on the frontend, users are not constrained by backend computing resources. They can freely write and test code without worrying about overloading the server.

## Contributing

Any contributions are greatly appreciated. If you have a suggestion that would make this project better, please fork the repo and create a Pull Request. You can also [open an issue](https://github.com/Dong-Chen-1031/Cpp-Here/issues).

## License

Published under the [MIT License](LICENSE).
