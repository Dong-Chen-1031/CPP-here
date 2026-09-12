import asyncio
import shlex
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from aiodocker import DockerError

from services.resource_manager import resource_manager
from settings import settings
from utils.log import logger
from utils.scheduler import scheduler

BUILDER_IMAGE = "ghcr.io/dong-chen-1031/safe-cpp2wasm:latest"
WORKER_NAME_PREFIX = "cpp-here-worker-"

INSTANCE_ID = uuid.uuid4().hex

TTL_SAFETY_MARGIN = 120
MAINTENANCE_INTERVAL = 60


class BuildError(Exception):
    def __init__(self, msg: str, build_logs: str = ""):
        super().__init__(msg)
        self.build_logs = build_logs


class ContainerPool:
    def __init__(self):
        self.pool: asyncio.Queue = asyncio.Queue()
        self._replenish_tasks: set[asyncio.Task] = set()
        # Container id -> monotonic creation time, so expiry is checked locally
        # instead of costing an inspect call on every acquire.
        self._born: dict[str, float] = {}
        self._closing = False
        self._maintenance_job = None

    @property
    def docker(self):
        return resource_manager.docker

    async def _create_container(self):
        config = {
            "Image": BUILDER_IMAGE,
            "Cmd": ["sleep", str(settings.DOCKER_WORKER_TTL)],
            "AttachStdout": True,
            "AttachStderr": True,
            "Tty": False,
            "Labels": {
                "app": "cpp-here",
                "component": "builder",
                "owner": INSTANCE_ID,
            },
            "Env": ["EMCC_CORES=1"],
            "HostConfig": {
                "AutoRemove": True,
                "NetworkMode": "none",
                "NanoCpus": 1_000_000_000,
                "Memory": 1_073_741_824,
                "PidsLimit": 256,
                "Ulimits": [{"Name": "fsize", "Soft": 50_000_000, "Hard": 50_000_000}],
                "CapDrop": ["ALL"],
                "SecurityOpt": ["no-new-privileges:true"],
            },
        }
        container = await self.docker.containers.create(
            config=config,
            name=f"{WORKER_NAME_PREFIX}{str(uuid.uuid4())[:12].replace('-', '')}",
        )
        await container.start()
        self._born[container.id] = time.monotonic()
        return container

    async def _destroy(self, container):
        self._born.pop(container.id, None)
        try:
            await container.delete(force=True)
        except DockerError as e:
            if e.status not in (404, 409):
                logger.warning(f"Failed to delete worker {container.id[:12]}: {e}")
        except Exception as e:
            logger.warning(f"Failed to delete worker {container.id[:12]}: {e}")

    def _is_usable(self, container) -> bool:
        """Whether the worker will outlive a build that starts right now."""
        born = self._born.get(container.id)
        if born is None:
            return False
        age = time.monotonic() - born
        return age < settings.DOCKER_WORKER_TTL - TTL_SAFETY_MARGIN

    async def _replenish(self):
        if self._closing or self.pool.qsize() >= settings.DOCKER_POOL_SIZE:
            return
        try:
            container = await self._create_container()
            if self._closing:
                await self._destroy(container)
                return
            await self.pool.put(container)
        except Exception as e:
            logger.error(f"Failed to replenish container pool: {e}")

    def _spawn_replenish(self):
        task = asyncio.create_task(self._replenish())
        self._replenish_tasks.add(task)
        task.add_done_callback(self._replenish_tasks.discard)

    async def _sweep_orphans(self):
        """Delete workers left running by a previous process that died uncleanly.

        Matching is by name prefix rather than label so workers created before
        labelling existed are cleaned up too; the owner label then protects the
        containers this process is currently using.
        """
        try:
            containers = await self.docker.containers.list(all=True)
        except Exception as e:
            logger.error(f"Failed to list containers for orphan sweep: {e}")
            return

        orphans = []
        for container in containers:
            info = container._container
            names = info.get("Names") or []
            if not any(n.lstrip("/").startswith(WORKER_NAME_PREFIX) for n in names):
                continue
            if (info.get("Labels") or {}).get("owner") == INSTANCE_ID:
                continue
            orphans.append(container)

        if not orphans:
            return
        logger.warning(f"Sweeping {len(orphans)} orphaned worker container(s)")
        await asyncio.gather(*[self._destroy(c) for c in orphans])

    async def _maintain(self):
        """Drop expired workers from the pool and top it back up.

        Without this the pool would bleed out during quiet periods: workers now
        expire on their own, and acquire() only replenishes when it takes one.
        """
        if self._closing:
            return
        keep = []
        while True:
            try:
                container = self.pool.get_nowait()
            except asyncio.QueueEmpty:
                break
            if self._is_usable(container):
                keep.append(container)
            else:
                await self._destroy(container)
        for container in keep:
            self.pool.put_nowait(container)

        needed = max(0, settings.DOCKER_POOL_SIZE - self.pool.qsize())
        if needed > 0:
            await asyncio.gather(*[self._replenish() for _ in range(needed)])

    async def _ensure_image(self):
        """Pull the builder image once at startup instead of on the failure path.

        The per-request 404 recovery could never run: the image is resolved in
        _create_container(), which is called outside the build()'s try block.
        """
        try:
            await self.docker.images.inspect(BUILDER_IMAGE)
        except DockerError:
            logger.info(f"Builder image {BUILDER_IMAGE} not found locally, pulling...")
            await self.docker.images.pull(BUILDER_IMAGE)

    async def startup(self):
        try:
            await self._ensure_image()
        except Exception as e:
            # Don't block startup: builds will fail loudly with a BuildError instead.
            logger.error(f"Failed to ensure builder image {BUILDER_IMAGE}: {e}")

        if settings.DOCKER_ORPHAN_SWEEP:
            await self._sweep_orphans()

        needed = max(0, settings.DOCKER_POOL_SIZE - self.pool.qsize())
        if needed > 0:
            await asyncio.gather(*[self._replenish() for _ in range(needed)])

        self._maintenance_job = scheduler.add_job(
            self._maintain,
            "interval",
            seconds=MAINTENANCE_INTERVAL,
            id="container-pool-maintenance",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

    @asynccontextmanager
    async def acquire(self):
        container = None
        while container is None:
            try:
                candidate = self.pool.get_nowait()
            except asyncio.QueueEmpty:
                container = await self._create_container()
                break
            self._spawn_replenish()
            if self._is_usable(candidate):
                container = candidate
            else:
                await self._destroy(candidate)
        try:
            yield container
        finally:
            await self._destroy(container)

    async def shutdown(self):
        self._closing = True
        if self._maintenance_job is not None:
            try:
                self._maintenance_job.remove()
            except Exception:
                pass
            self._maintenance_job = None

        for task in list(self._replenish_tasks):
            task.cancel()
        if self._replenish_tasks:
            await asyncio.gather(*self._replenish_tasks, return_exceptions=True)
        while True:
            try:
                container = self.pool.get_nowait()
            except asyncio.QueueEmpty:
                break
            await self._destroy(container)
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
            # EMCC_CORES doesn't reach wasm-ld's own thread pool, which is what
            # actually blew up under load; cap it to match the container's 1 CPU.
            "-Wl,--threads=1 ",
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

    # Initialised up front: the DockerError handler below reports it even when
    # the failure happens before the build logs are collected.
    output = ""

    try:
        # acquire() itself can raise DockerError (it creates a container when the
        # pool is empty), so the try block has to wrap it too.
        async with container_pool.acquire() as container:
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
            except TimeoutError as e:
                logger.warning("Container exec timeout")
                raise BuildError("Build timed out") from e

            exec_info = await execute.inspect()
            exit_code = exec_info["ExitCode"]
            output = "".join(log_parts)

            if exit_code != 0:
                logger.warning(
                    f"Build failed (exit {exit_code})",
                    extra={
                        "code": code,
                        "cpp_version": cpp_version,
                        "output": output,
                        "exit_code": exit_code,
                        "command": cmd,
                    },
                )
                logger.debug(output)
                await asyncio.to_thread(shutil.rmtree, output_dir, ignore_errors=True)
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
        logger.error(f"Docker error during build (status {e.status}): {e}")
        raise BuildError("Build failed due to Docker error.", build_logs=output) from e
