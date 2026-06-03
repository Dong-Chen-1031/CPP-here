# C++ Here - Online C++ Editor

C++ Here is a next-generation in-browser (online) C++ editor built for competitive programming, engineered to be fast, lightweight, and full-featured.

> [!NOTE]
> This readme also has a [Traditional Chinese version](README-TW.md).

> [!TIP]
> Try it now: https://cpp.doong.me

![Screenshot](screenshot/image.png)

## Features

- **Error Highlighting**
  > When an error occurs, the editor automatically analyzes it, highlights the corresponding line, and provides detailed diagnostics so users can quickly identify and fix the problem.

- **Built-in Test Case Support**
  > With the built-in test case system, users can input test data and run all test cases with one click. All test cases are executed in parallel inside browser workers, and clear color indicators make results easy to understand at a glance.

- **Automatic Code Formatting**
  > Integrates Clang-format WASM to format code with one click, with multiple style presets available.

- **Internationalization and Localization (i18n)**
  > Currently supports English and Traditional Chinese, and automatically switches based on browser language. More languages are planned, and contributions are welcome on [Crowdin](https://crowdin.com/project/cpp-here).

- **Auto-completion**
  > Provides C++ syntax auto-completion optimized for competitive programming.

- **Responsive Design (RWD)**
  > A well-designed responsive interface makes C++ Here easy to use on both desktop and mobile.

- **Online Compilation and Instant Execution**
  > Compiles C++ code into WebAssembly modules and executes them directly on the frontend, without resource limitations and without requiring backend compilation for each test run, greatly improving execution speed.

- **Simple but Powerful Editor**
  > The frontend offers a clean interface while remaining feature-complete. It is built with Astro and React components to deliver excellent load speed and smooth interactions.

- **Smart Compilation Cache**
  > The backend implements compilation-result caching. When users submit code identical to previous submissions, the system compares hash values and returns cached results directly, significantly reducing duplicate compilation time and server load.

- **One-click Test Data Import**
  > Import test data from competitive programming platforms with one click via the browser extension, with support for over 100 major platforms.

- **Open Source and Free**
  > C++ Here is fully open-source and welcomes community contributions for continuous improvement. It is also completely free to use for online C++ editing and execution.

## Tech Stack & Dependencies

- **Frontend**: Astro, Bun, Motion, React, Shadcn, Tailwind CSS, TypeScript, axios, cloudflare turnstile, codemirror, i18next, Jotai Atom, lucide
- **Browser Extension**: Bun, TypeScript, esbuild, web-ext
- **Backend**: FastAPI, PyJWT, PyTurnstile, Python, SQLAlchemy, Uvicorn, aiodocker, aiofiles, aiosqlite, apscheduler, [safe-cpp2wasm](https://github.com/Dong-Chen-1031/safe-cpp2wasm/)

## Principles and Advantages

The main difference between C++ Here and other online C++ editors is that we use [safe-cpp2wasm](https://github.com/Dong-Chen-1031/safe-cpp2wasm/) to compile C++ files into WebAssembly and execute them directly in the frontend. The advantages of this approach are:

1. **Fast**: Since the compiled WebAssembly modules can run directly in the browser, there is no need to rely on the backend for execution every time, significantly improving execution speed.
2. **Secure**: WebAssembly runs in the browser and features sandbox isolation, which effectively prevents malicious code from threatening the system.
3. **Concurrent**: Executing WebAssembly modules on the frontend can leverage the browser's multi-threading capabilities for more efficient concurrent execution, which is particularly suitable for handling numerous test cases in competitive programming.
4. **Unlimited**: Because the execution happens on the frontend, users are not constrained by backend computing resources. They can freely write and test code without worrying about overloading the server.

## Local Development

### Frontend

Bun is required. Using npm may lead to issues.

1. Clone
```shell
git clone https://github.com/Dong-Chen-1031/CPP-here.git
cd CPP-here
```

2. Install dependencies
```shell
bun install
```

3. Run frontend
```shell
bun run frontend
```

### Backend

Python 3.14 + UV is recommended.
Make sure Docker is running.

1. Clone
```shell
git clone https://github.com/Dong-Chen-1031/CPP-here.git
cd CPP-here
```

2. Install dependencies
```shell
uv venv
source .venv/bin/activate  # Adjust for your operating system
uv pip install -r backend/requirements.txt
```

3. Pull Docker image
```shell
docker pull ghcr.io/dong-chen-1031/safe-cpp2wasm:latest
```

4. Run backend
```shell
bun run backend
```

### Run Frontend and Backend Together (Recommended)

1. Complete the environment setup above.
2. Start both frontend and backend with one command:
```shell
bun run dev
```

## Deployment

### Full deployment with Docker Compose

```shell
curl -sS "https://cpp.doong.me/script/docker-compose.yml" > docker-compose.yml
docker compose up --pull always
```

> [!TIP]
> - Add `-d` to the second command to run in background mode.
> - You can modify environment variables based on the comments inside `docker-compose.yml`.

> [!WARNING]
> Since the backend needs to create ephemeral containers to build user code, Docker Compose mounts the Docker socket into the container. On operating systems other than Linux and macOS, additional adjustments may be required.

<details>
<summary>Build Docker images manually</summary>

#### Clone

```shell
git clone https://github.com/Dong-Chen-1031/CPP-here.git
cd CPP-here
```

#### Build frontend

```shell
docker build \
  -f ./docker/frontend/Dockerfile \
  -t cpp-here-frontend:latest \
  .
```

#### Build backend

```shell
docker build \
  -f ./docker/backend/Dockerfile \
  -t cpp-here-backend:latest \
  .
```

</details>

### Deploy frontend

- The frontend uses Astro SSG mode. After running `bun run build`, it outputs a **fully static** website that can be easily deployed to services such as Cloudflare Pages and GitHub Pages. This approach is highly recommended because it improves loading speed and reduces backend workload.

- Deploy frontend with Docker Compose in one command (the image uses Caddy as the web server):
```shell
curl -sS "https://cpp.doong.me/script/frontend/docker-compose.yml" > docker-compose.yml
docker compose up --pull always
```

### Deploy backend

Docker Compose is recommended for backend deployment, as it automatically handles dependencies, versions, and environment setup.

```shell
curl -sS "https://cpp.doong.me/script/backend/docker-compose.yml" > docker-compose.yml
docker compose up --pull always
```

> [!WARNING]
> Since the backend needs to create ephemeral containers to build user code, Docker Compose mounts the Docker socket into the container. On operating systems other than Linux and macOS, additional adjustments may be required.

## Contributing

Any contributions are greatly appreciated. If you have suggestions for improvement, please fork this repository and create a Pull Request. You can also [open an issue](https://github.com/Dong-Chen-1031/Cpp-Here/issues).

## License

This project is licensed under the [MIT LICENSE](LICENSE).
