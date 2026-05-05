import asyncio
import os
import shlex
from pathlib import Path

from aiodocker import DockerError
from services.resource_manager import resource_manager
from settings import CACHE_PATH, HOST_CACHE_PATH
from utils.log import logger


class BuildError(Exception):
    def __init__(self, msg: str, build_logs: str = ""):
        super().__init__(msg)
        self.build_logs = build_logs


async def build(
    code: str, name: str = "output.js", output_dir: Path | None = None
) -> str:
    docker = resource_manager.docker
    if docker is None:
        raise RuntimeError("Docker client not initialized")

    if output_dir is None:
        output_dir = Path(os.getcwd()) / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(output_dir, 0o777)

    # Translate container-internal path to host path for Docker bind mount.
    # When running inside Docker Compose, the daemon resolves bind paths against
    # the host filesystem, not the container filesystem.
    container_cache_root = (Path(os.getcwd()) / CACHE_PATH).resolve()
    try:
        rel = output_dir.absolute().resolve().relative_to(container_cache_root)
        host_output_dir = Path(HOST_CACHE_PATH) / rel
    except ValueError:
        host_output_dir = output_dir.absolute()

    cmd = (
        f"printf '%s' {shlex.quote(code)} > /tmp/source.cpp && "
        f"timeout 30s emcc /tmp/source.cpp -o /out/{shlex.quote(name)} "
    ) + " ".join(
        [
            "-ftemplate-depth=50 ",
            "-sMODULARIZE=1 ",
            # "-sMINIMAL_RUNTIME=1 "
            '-sEXPORT_NAME="createMyModule" ',
            '-sENVIRONMENT="worker" ',
            "-sEXIT_RUNTIME=1 ",
            "-sFILESYSTEM=0 ",
            "--js-library /tmp/stdin_lib.js ",
            # '-sINCOMING_MODULE_JS_API=\'["print","printErr","stdin","instantiateWasm","onRuntimeInitialized"]\' '
            # '-sINCOMING_MODULE_JS_API=\'["wasm", "stdin", "print", "printErr"]\' '
            "-fconstexpr-depth=50 ",
            "-fmacro-backtrace-limit=10 ",
        ]
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
            "Binds": [f"{host_output_dir}:/out:rw"],
        },
    }

    container = await docker.containers.create(config=config)

    try:
        await container.start()

        try:
            result = await asyncio.wait_for(container.wait(), timeout=60)
        except asyncio.TimeoutError:
            logger.warning("Container timeout, killing...")
            try:
                await container.kill()
            except Exception:
                pass
            raise BuildError("Build timed out")
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
