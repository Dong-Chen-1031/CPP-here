import asyncio
import shlex
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from aiodocker import DockerError
from services.resource_manager import resource_manager
from settings import DOCKER_POOL_SIZE
from utils.log import logger


class BuildError(Exception):
    def __init__(self, msg: str, build_logs: str = ""):
        super().__init__(msg)
        self.build_logs = build_logs


class ContainerPool:
    def __init__(self):
        self.pool: asyncio.Queue = asyncio.Queue()
        self._replenish_tasks: set[asyncio.Task] = set()

    @property
    def docker(self):
        return resource_manager.docker

    async def _create_container(self):
        config = {
            "Image": "ghcr.io/dong-chen-1031/safe-cpp2wasm:latest",
            "Cmd": ["sleep", "infinity"],
            "AttachStdout": True,
            "AttachStderr": True,
            "Tty": False,
            "HostConfig": {
                "NetworkMode": "none",  # --network none
                "NanoCpus": 1_000_000_000,  # --cpus="1.0"
                "Memory": 1_073_741_824,  # --memory="1G"
                "PidsLimit": 50,  # --pids-limit 50
                "Ulimits": [
                    {"Name": "fsize", "Soft": 50_000_000, "Hard": 50_000_000}
                ],  # --ulimit fsize=50000000:50000000
                "CapDrop": ["ALL"],  # --cap-drop ALL
                "SecurityOpt": ["no-new-privileges:true"],
            },
        }
        container = await self.docker.containers.create(
            config=config,
            name=f"cpp-here-worker-{str(uuid.uuid4())[:12].replace('-', '')}",
        )
        await container.start()
        return container

    async def _replenish(self):
        if self.pool.qsize() >= DOCKER_POOL_SIZE:
            return
        try:
            container = await self._create_container()
            await self.pool.put(container)
        except Exception as e:
            logger.error(f"Failed to replenish container pool: {e}")

    async def startup(self):
        needed = max(0, DOCKER_POOL_SIZE - self.pool.qsize())
        if needed > 0:
            await asyncio.gather(*[self._replenish() for _ in range(needed)])

    @asynccontextmanager
    async def acquire(self):
        try:
            container = self.pool.get_nowait()
            task = asyncio.create_task(self._replenish())
            self._replenish_tasks.add(task)
            task.add_done_callback(self._replenish_tasks.discard)
        except asyncio.QueueEmpty:
            container = await self._create_container()
        try:
            yield container
        finally:
            try:
                await container.delete(force=True)
            except Exception:
                logger.warning(
                    "Failed to delete container, it may have already been removed."
                )

    async def shutdown(self):
        for task in list(self._replenish_tasks):
            task.cancel()
        if self._replenish_tasks:
            await asyncio.gather(*self._replenish_tasks, return_exceptions=True)
        while True:
            try:
                container = self.pool.get_nowait()
                try:
                    await container.delete(force=True)
                except Exception:
                    logger.warning(
                        "Failed to delete container, it may have already been removed."
                    )
            except asyncio.QueueEmpty:
                break
        logger.info("Container pool shutdown complete")


container_pool = ContainerPool()


async def build(
    code: str,
    name: str = "output.js",
    output_dir: Path | None = None,
    cpp_version: str = "c++17",
) -> str:
    if output_dir is None:
        output_dir = Path.cwd() / "output"

    cmd = (
        f"mkdir -p /tmp/out && "
        f"printf '%s' {shlex.quote(code)} > /tmp/source.cpp && "
        f"timeout 30s emcc /tmp/source.cpp -o /tmp/out/{shlex.quote(name)} "
    ) + " ".join(
        [
            f"-std={cpp_version} ",
            "-ftemplate-depth=50 ",
            "-sMODULARIZE=1 ",
            # "-sMINIMAL_RUNTIME=1  "
            '-sEXPORT_NAME="createMyModule" ',
            '-sENVIRONMENT="worker" ',
            "-sEXIT_RUNTIME=1 ",
            "-sFILESYSTEM=0 ",
            "--js-library /tmp/stdin_lib.js ",
            # '-sINCOMING_MODULE_JS_API=\'["print","printErr","stdin","instantiateWasm","onRuntimeInitialized"]\' '
            # '-sINCOMING_MODULE_JS_API=\'["wasm", "stdin", "print", "printErr"]\' '
            "-fconstexpr-depth=50 ",
            "-fmacro-backtrace-limit=10 ",
            "-sSTACK_SIZE=8388608 ",  # 8 MB stack
            "-sINITIAL_MEMORY=33554432 ",  # 初始 32 MB
            "-sALLOW_MEMORY_GROWTH=1 ",  # 按需成長，上限為瀏覽器可用記憶體
        ]
    )

    async with container_pool.acquire() as container:
        try:
            execute = await container.exec(
                ["sh", "-c", cmd],
                stdout=True,
                stderr=True,
            )

            log_parts: list[str] = []

            async def _drain():
                async with execute.start(detach=False) as stream:
                    while True:
                        msg = await stream.read_out()
                        if msg is None:
                            break
                        log_parts.append(msg.data.decode(errors="replace"))

            try:
                await asyncio.wait_for(_drain(), timeout=60)
            except asyncio.TimeoutError:
                logger.warning("Container exec timeout")
                raise BuildError("Build timed out")

            exec_info = await execute.inspect()
            exit_code = exec_info["ExitCode"]
            output = "".join(log_parts)

            if exit_code != 0:
                logger.info(f"Build failed (exit {exit_code})\n{output}")
                shutil.rmtree(output_dir, ignore_errors=True)
                raise BuildError(f"Build failed (exit {exit_code})", build_logs=output)

            tar = await container.get_archive("/tmp/out")
            output_dir.mkdir(parents=True, exist_ok=True)
            for member in tar.getmembers():
                if member.isfile():
                    file_obj = tar.extractfile(member)
                    if file_obj:
                        (output_dir / Path(member.name).name).write_bytes(
                            file_obj.read()
                        )

            return output

        except DockerError as e:
            if e.status == 404:
                logger.error("Docker image not found. Auto-pulling image.")
                await resource_manager.docker.images.pull(
                    "ghcr.io/dong-chen-1031/safe-cpp2wasm:latest"
                )
            raise BuildError("Build failed due to Docker error.", build_logs=output)
