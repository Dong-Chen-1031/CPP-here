import base64
import os
import shlex
from pathlib import Path

from aiodocker import DockerError
from services.resource_manager import resource_manager
from utils.log import logger

# Custom fd_read implementation for -sFILESYSTEM=0:
# Emscripten stubs out fd_read with an abort() when the filesystem is disabled.
# This library overrides that stub so Module.stdin callbacks still work.
_STDIN_LIB_JS = """\
addToLibrary({
  fd_read: function(fd, iov, iovcnt, pnum) {
    if (fd !== 0) return 8; // WASI EBADF
    var num = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[(iov >> 2) + i * 2];
      var len = HEAPU32[(iov >> 2) + i * 2 + 1];
      for (var j = 0; j < len; j++) {
        var c = Module['stdin'] ? Module['stdin']() : null;
        if (c === null || c === undefined) { HEAPU32[pnum >> 2] = num; return 0; }
        HEAPU8[ptr + j] = c;
        num++;
      }
    }
    HEAPU32[pnum >> 2] = num;
    return 0;
  }
});
"""


class BuildError(Exception):
    def __init__(self, msg: str, build_logs: str = ""):
        super().__init__(msg)
        self.build_logs = build_logs


async def build(code: str, name: str = "output.js") -> str:
    docker = resource_manager.docker
    if docker is None:
        raise RuntimeError("Docker client not initialized")

    output_dir = Path(os.getcwd()) / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    lib_b64 = base64.b64encode(_STDIN_LIB_JS.encode()).decode()
    cmd = (
        f"printf '%s' {shlex.quote(code)} > /tmp/source.cpp && "
        f"echo {shlex.quote(lib_b64)} | base64 -d > /tmp/stdin_lib.js && "
        f"timeout 30s emcc /tmp/source.cpp -o /out/{shlex.quote(name)} "
        "-ftemplate-depth=50 "
        "-sMODULARIZE=1 "
        # "-sMINIMAL_RUNTIME=1 "
        '-sEXPORT_NAME="createMyModule" '
        '-sENVIRONMENT="worker" '
        "-sEXIT_RUNTIME=1 "
        "-sFILESYSTEM=0 "
        "--js-library /tmp/stdin_lib.js "
        # '-sINCOMING_MODULE_JS_API=\'["print","printErr","stdin","instantiateWasm","onRuntimeInitialized"]\' '
        # '-sINCOMING_MODULE_JS_API=\'["wasm", "stdin", "print", "printErr"]\' '
        "-fconstexpr-depth=50 "
        "-fmacro-backtrace-limit=10"
    )

    config = {
        "Image": "ghcr.io/dong-chen-1031/safe-cpp2wasm:latest",
        "Cmd": ["sh", "-c", cmd],
        "AttachStdout": True,
        "AttachStderr": True,
        "Tty": False,
        "HostConfig": {
            "NetworkMode": "none",  # --network none
            "NanoCpus": 1_000_000_000,  # --cpus="1.0"
            "Memory": 1_073_741_824,  # --memory="1g"
            "PidsLimit": 50,  # --pids-limit 50
            "Ulimits": [
                {"Name": "fsize", "Soft": 50_000_000, "Hard": 50_000_000}
            ],  # --ulimit fsize=50000000:50000000
            "CapDrop": ["ALL"],  # --cap-drop ALL
            "SecurityOpt": ["no-new-privileges:true"],
            "Binds": [f"{output_dir}:/out:rw"],
        },
    }

    container = await docker.containers.create(config=config)

    try:
        await container.start()

        result = await container.wait()
        exit_code = result["StatusCode"]

        logs = await container.log(stdout=True, stderr=True)
        output = "".join(logs)
        if exit_code != 0:
            # logger.error(f"Build failed (exit {exit_code}):\n{output}")
            logger.info(f"Build failed (exit {exit_code})")
            raise BuildError(f"Build failed (exit {exit_code})", build_logs=output)

        return output
    except DockerError as e:
        if e.status == 404:
            logger.error("Docker image not found. Auto-pulling image.")
            await docker.images.pull("ghcr.io/dong-chen-1031/safe-cpp2wasm:latest")
        raise
    finally:
        try:
            await container.delete(force=True)
        except Exception:
            pass
