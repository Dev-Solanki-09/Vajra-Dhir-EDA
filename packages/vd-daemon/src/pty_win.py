"""Cross-platform local PTY session manager (Windows ConPTY via ctypes, POSIX via pty/termios)."""

from __future__ import annotations

import os
import pathlib
import sys
from typing import Optional

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    HANDLE = wintypes.HANDLE
    DWORD = wintypes.DWORD
    BOOL = wintypes.BOOL
    LPCWSTR = wintypes.LPCWSTR
    LPWSTR = wintypes.LPWSTR
    LPVOID = ctypes.c_void_p
    SIZE_T = ctypes.c_size_t
    HPCON = HANDLE

    PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016
    EXTENDED_STARTUPINFO_PRESENT = 0x00080000
    CREATE_UNICODE_ENVIRONMENT = 0x00000400
    STARTF_USESTDHANDLES = 0x00000100

    class COORD(ctypes.Structure):
        _fields_ = [("X", ctypes.c_short), ("Y", ctypes.c_short)]

    class STARTUPINFOW(ctypes.Structure):
        _fields_ = [
            ("cb", DWORD),
            ("lpReserved", LPWSTR),
            ("lpDesktop", LPWSTR),
            ("lpTitle", LPWSTR),
            ("dwX", DWORD),
            ("dwY", DWORD),
            ("dwXSize", DWORD),
            ("dwYSize", DWORD),
            ("dwXCountChars", DWORD),
            ("dwYCountChars", DWORD),
            ("dwFillAttribute", DWORD),
            ("dwFlags", DWORD),
            ("wShowWindow", wintypes.WORD),
            ("cbReserved2", wintypes.WORD),
            ("lpReserved2", ctypes.POINTER(ctypes.c_byte)),
            ("hStdInput", HANDLE),
            ("hStdOutput", HANDLE),
            ("hStdError", HANDLE),
        ]

    class STARTUPINFOEXW(ctypes.Structure):
        _fields_ = [
            ("StartupInfo", STARTUPINFOW),
            ("lpAttributeList", LPVOID),
        ]

    class PROCESS_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("hProcess", HANDLE),
            ("hThread", HANDLE),
            ("dwProcessId", DWORD),
            ("dwThreadId", DWORD),
        ]

    _kernel32.CreatePipe.argtypes = [ctypes.POINTER(HANDLE), ctypes.POINTER(HANDLE), LPVOID, DWORD]
    _kernel32.CreatePipe.restype = BOOL

    _kernel32.CreatePseudoConsole.argtypes = [COORD, HANDLE, HANDLE, DWORD, ctypes.POINTER(HPCON)]
    _kernel32.CreatePseudoConsole.restype = ctypes.c_long  # HRESULT

    _kernel32.ResizePseudoConsole.argtypes = [HPCON, COORD]
    _kernel32.ResizePseudoConsole.restype = ctypes.c_long

    _kernel32.ClosePseudoConsole.argtypes = [HPCON]
    _kernel32.ClosePseudoConsole.restype = None

    _kernel32.InitializeProcThreadAttributeList.argtypes = [LPVOID, DWORD, DWORD, ctypes.POINTER(SIZE_T)]
    _kernel32.InitializeProcThreadAttributeList.restype = BOOL

    _kernel32.UpdateProcThreadAttribute.argtypes = [
        LPVOID,
        DWORD,
        ctypes.c_size_t,
        LPVOID,
        SIZE_T,
        LPVOID,
        ctypes.POINTER(SIZE_T),
    ]
    _kernel32.UpdateProcThreadAttribute.restype = BOOL

    _kernel32.DeleteProcThreadAttributeList.argtypes = [LPVOID]
    _kernel32.DeleteProcThreadAttributeList.restype = None

    _kernel32.CreateProcessW.argtypes = [
        LPCWSTR,
        LPWSTR,
        LPVOID,
        LPVOID,
        BOOL,
        DWORD,
        LPVOID,
        LPCWSTR,
        ctypes.POINTER(STARTUPINFOEXW),
        ctypes.POINTER(PROCESS_INFORMATION),
    ]
    _kernel32.CreateProcessW.restype = BOOL

    _kernel32.ReadFile.argtypes = [HANDLE, LPVOID, DWORD, ctypes.POINTER(DWORD), LPVOID]
    _kernel32.ReadFile.restype = BOOL

    _kernel32.WriteFile.argtypes = [HANDLE, LPVOID, DWORD, ctypes.POINTER(DWORD), LPVOID]
    _kernel32.WriteFile.restype = BOOL

    _kernel32.TerminateProcess.argtypes = [HANDLE, wintypes.UINT]
    _kernel32.TerminateProcess.restype = BOOL

    _kernel32.CloseHandle.argtypes = [HANDLE]
    _kernel32.CloseHandle.restype = BOOL


class WorkspacePty:
    """Bounded interactive shell process scoped to a workspace root directory."""

    def __init__(self, cwd: pathlib.Path, cols: int = 100, rows: int = 30) -> None:
        self.cwd = pathlib.Path(cwd).resolve()
        self.closed = False
        self._hpc: Optional[int] = None
        self._in_write: Optional[int] = None
        self._out_read: Optional[int] = None
        self._h_process: Optional[int] = None
        self._h_thread: Optional[int] = None
        self._master_fd: Optional[int] = None
        self._pid: Optional[int] = None

        if sys.platform == "win32":
            self._spawn_win_conpty(cols, rows)
        else:
            self._spawn_posix_pty(cols, rows)

    def _spawn_win_conpty(self, cols: int, rows: int) -> None:
        in_read, in_write = HANDLE(), HANDLE()
        out_read, out_write = HANDLE(), HANDLE()
        if not _kernel32.CreatePipe(ctypes.byref(in_read), ctypes.byref(in_write), None, 0):
            raise ctypes.WinError(ctypes.get_last_error())
        if not _kernel32.CreatePipe(ctypes.byref(out_read), ctypes.byref(out_write), None, 0):
            _kernel32.CloseHandle(in_read)
            _kernel32.CloseHandle(in_write)
            raise ctypes.WinError(ctypes.get_last_error())

        hpc = HPCON()
        hr = _kernel32.CreatePseudoConsole(COORD(cols, rows), in_read, out_write, 0, ctypes.byref(hpc))
        if hr != 0:
            _kernel32.CloseHandle(in_read)
            _kernel32.CloseHandle(out_write)
            _kernel32.CloseHandle(in_write)
            _kernel32.CloseHandle(out_read)
            raise OSError(f"CreatePseudoConsole failed: HRESULT 0x{hr & 0xFFFFFFFF:08X}")

        size = SIZE_T(0)
        _kernel32.InitializeProcThreadAttributeList(None, 1, 0, ctypes.byref(size))
        attr_buf = ctypes.create_string_buffer(size.value)
        if not _kernel32.InitializeProcThreadAttributeList(attr_buf, 1, 0, ctypes.byref(size)):
            _kernel32.ClosePseudoConsole(hpc)
            _kernel32.CloseHandle(in_read)
            _kernel32.CloseHandle(out_write)
            _kernel32.CloseHandle(in_write)
            _kernel32.CloseHandle(out_read)
            raise ctypes.WinError(ctypes.get_last_error())

        # On 64-bit Windows, hpcon is passed directly as lpValue handle value
        if not _kernel32.UpdateProcThreadAttribute(
            attr_buf,
            0,
            PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
            ctypes.c_void_p(hpc.value),
            ctypes.sizeof(HPCON),
            None,
            None,
        ):
            _kernel32.DeleteProcThreadAttributeList(attr_buf)
            _kernel32.ClosePseudoConsole(hpc)
            _kernel32.CloseHandle(in_read)
            _kernel32.CloseHandle(out_write)
            _kernel32.CloseHandle(in_write)
            _kernel32.CloseHandle(out_read)
            raise ctypes.WinError(ctypes.get_last_error())

        si = STARTUPINFOEXW()
        si.StartupInfo.cb = ctypes.sizeof(STARTUPINFOEXW)
        # Prevent inheriting the daemon's own stdin/stdout/stderr so ConPTY owns console I/O.
        si.StartupInfo.dwFlags = STARTF_USESTDHANDLES
        si.lpAttributeList = ctypes.cast(attr_buf, LPVOID)
        pi = PROCESS_INFORMATION()

        shell_cmd = os.environ.get("VD_PTY_SHELL") or "cmd.exe /K chcp 65001 >nul"
        cmd_buf = ctypes.create_unicode_buffer(shell_cmd)
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        env_block = "\0".join(f"{k}={v}" for k, v in env.items()) + "\0\0"
        env_buf = ctypes.create_unicode_buffer(env_block)

        ok = _kernel32.CreateProcessW(
            None,
            cmd_buf,
            None,
            None,
            False,
            EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
            env_buf,
            str(self.cwd),
            ctypes.byref(si),
            ctypes.byref(pi),
        )
        _kernel32.DeleteProcThreadAttributeList(attr_buf)
        _kernel32.CloseHandle(in_read)
        _kernel32.CloseHandle(out_write)
        if not ok:
            err = ctypes.get_last_error()
            _kernel32.ClosePseudoConsole(hpc)
            _kernel32.CloseHandle(in_write)
            _kernel32.CloseHandle(out_read)
            raise ctypes.WinError(err)

        self._hpc = hpc
        self._in_write = in_write
        self._out_read = out_read
        self._h_process = pi.hProcess
        self._h_thread = pi.hThread

    def _spawn_posix_pty(self, cols: int, rows: int) -> None:
        import fcntl
        import pty
        import struct
        import termios

        pid, master_fd = pty.fork()
        if pid == 0:
            os.chdir(str(self.cwd))
            os.environ["PYTHONIOENCODING"] = "utf-8"
            os.environ["TERM"] = "xterm-256color"
            sh = os.environ.get("SHELL", "/bin/sh")
            os.execvp(sh, [sh])
        self._pid = pid
        self._master_fd = master_fd
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def read(self, n: int = 4096) -> bytes:
        if self.closed:
            return b""
        if sys.platform == "win32":
            assert self._out_read is not None
            buf = ctypes.create_string_buffer(n)
            read_bytes = DWORD(0)
            ok = _kernel32.ReadFile(self._out_read, buf, n, ctypes.byref(read_bytes), None)
            if not ok or read_bytes.value == 0:
                return b""
            return buf.raw[: read_bytes.value]
        assert self._master_fd is not None
        try:
            return os.read(self._master_fd, n)
        except OSError:
            return b""

    def write(self, data: bytes) -> None:
        if self.closed or not data:
            return
        if sys.platform == "win32":
            assert self._in_write is not None
            written = DWORD(0)
            buf = ctypes.create_string_buffer(data, len(data))
            _kernel32.WriteFile(self._in_write, buf, len(data), ctypes.byref(written), None)
        else:
            assert self._master_fd is not None
            os.write(self._master_fd, data)

    def resize(self, cols: int, rows: int) -> None:
        if self.closed:
            return
        cols = max(10, min(int(cols), 400))
        rows = max(4, min(int(rows), 200))
        if sys.platform == "win32" and self._hpc is not None:
            _kernel32.ResizePseudoConsole(self._hpc, COORD(cols, rows))
        elif self._master_fd is not None:
            import fcntl
            import struct
            import termios

            fcntl.ioctl(self._master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        if sys.platform == "win32":
            if self._h_process is not None:
                _kernel32.TerminateProcess(self._h_process, 0)
                _kernel32.CloseHandle(self._h_process)
            if self._h_thread is not None:
                _kernel32.CloseHandle(self._h_thread)
            if self._hpc is not None:
                _kernel32.ClosePseudoConsole(self._hpc)
            if self._in_write is not None:
                _kernel32.CloseHandle(self._in_write)
            if self._out_read is not None:
                _kernel32.CloseHandle(self._out_read)
        else:
            if self._master_fd is not None:
                try:
                    os.close(self._master_fd)
                except OSError:
                    pass
            if self._pid is not None:
                try:
                    os.kill(self._pid, 9)
                except OSError:
                    pass
