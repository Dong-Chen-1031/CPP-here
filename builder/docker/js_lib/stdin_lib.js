addToLibrary({
  fd_read: function (fd, iov, iovcnt, pnum) {
    if (fd !== 0) return 8; // WASI EBADF
    var num = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[(iov >> 2) + i * 2];
      var len = HEAPU32[(iov >> 2) + i * 2 + 1];
      for (var j = 0; j < len; j++) {
        var c = Module["stdin"] ? Module["stdin"]() : null;
        if (c === null || c === undefined) {
          HEAPU32[pnum >> 2] = num;
          return 0;
        }
        HEAPU8[ptr + j] = c;
        num++;
      }
    }
    HEAPU32[pnum >> 2] = num;
    return 0;
  },
});
