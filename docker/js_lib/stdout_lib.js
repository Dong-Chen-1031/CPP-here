// Replaces Emscripten's FILESYSTEM=0 fd_write, which pushes stdout into a JS
// array one byte at a time and only flushes on '\n': output without newlines
// grows that array until the tab runs out of memory (C++ Here CPP-8).
//
// Here every write is decoded as a whole block and handed to out()/err()
// straight away, so print/printErr receive raw chunks that may contain (or
// lack) newlines. The byte count is enforced at this single choke point, which
// is the only place the no-newline case can be caught.
addToLibrary({
    // A string so it is emitted as runtime code instead of being evaluated by
    // the JS compiler. The limit is 32 MiB; keep it in sync with
    // OUTPUT_LIMIT_BYTES in C++ Here's frontend/src/config/runLimits.ts.
    $outputState:
        "{ total: 0, limit: 33554432, decoders: [null, new TextDecoder(), new TextDecoder()] }",
    $flushOutputDecoders__deps: ["$outputState"],
    $flushOutputDecoders: () => {
        for (var fd = 1; fd <= 2; fd++) {
            var rest = outputState.decoders[fd].decode();
            if (rest) (fd === 1 ? out : err)(rest);
        }
    },
    fd_write__deps: ["$outputState", "$flushOutputDecoders"],
    fd_write__postset: () => addAtExit("flushOutputDecoders()"),
    fd_write: (fd, iov, iovcnt, pnum) => {
        if (fd !== 1 && fd !== 2) return 8; // WASI EBADF
        var num = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = {{{ makeGetValue('iov', C_STRUCTS.iovec.iov_base, '*') }}};
            var len = {{{ makeGetValue('iov', C_STRUCTS.iovec.iov_len, '*') }}};
            iov += {{{ C_STRUCTS.iovec.__size__ }}};
            outputState.total += len;
            if (outputState.total > outputState.limit) {
                abort("Output Limit Exceeded");
            }
            // Re-read HEAPU8 every time: memory growth swaps the view.
            var text = outputState.decoders[fd].decode(
                HEAPU8.subarray(ptr, ptr + len),
                { stream: true },
            );
            if (text) (fd === 1 ? out : err)(text);
            num += len;
        }
        {{{ makeSetValue('pnum', 0, 'num', SIZE_TYPE) }}};
        return 0;
    },
});
