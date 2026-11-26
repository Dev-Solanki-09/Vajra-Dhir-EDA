"""
Orphan-safe child process supervision for vd-daemon:
- Windows: isolated WinDLL("kernel32") Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
- POSIX/Linux: pre-loaded libc PR_SET_PDEATHSIG(SIGTERM) + ppid race guard + process-group reaper
"""

import ctypes
import ctypes.wintypes as wintypes
import os
import signal
import subprocess
import sys

JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
JOB_OBJECT_EXTENDED_LIMIT_INFO_CLASS = 9
PR_SET_PDEATHSIG = 1

_POSIX_LIBC = None
if sys.platform != "win32":
    try:
        _POSIX_LIBC = ctypes.CDLL("libc.so.6")
        _POSIX_LIBC.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong]
        _POSIX_LIBC.prctl.restype = ctypes.c_int
    except OSError:
        _POSIX_LIBC = None


if sys.platform == "win32":
    class _IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_uint64),
            ("WriteOperationCount", ctypes.c_uint64),
            ("OtherOperationCount", ctypes.c_uint64),
            ("ReadTransferCount", ctypes.c_uint64),
            ("WriteTransferCount", ctypes.c_uint64),
            ("OtherTransferCount", ctypes.c_uint64),
        ]

    class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", ctypes.c_uint32),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", ctypes.c_uint32),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", ctypes.c_uint32),
            ("SchedulingClass", ctypes.c_uint32),
        ]

    class _JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", _JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", _IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    def _load_kernel32() -> ctypes.WinDLL:
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.SetInformationJobObject.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            ctypes.c_void_p,
            wintypes.DWORD,
        ]
        k32.SetInformationJobObject.restype = wintypes.BOOL
        k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        k32.AssignProcessToJobObject.restype = wintypes.BOOL
        k32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
        k32.TerminateJobObject.restype = wintypes.BOOL
        k32.CloseHandle.argtypes = [wintypes.HANDLE]
        k32.CloseHandle.restype = wintypes.BOOL
        return k32
else:
    def _load_kernel32():
        return None


class SupervisedProcessGroup:
    """Tracks spawned worker children and ensures orphan-free termination on close/exit."""

    def __init__(self) -> None:
        self._children: list[subprocess.Popen] = []
        self._k32 = _load_kernel32()
        self._job_handle = None
        if sys.platform == "win32" and self._k32 is not None:
            job = self._k32.CreateJobObjectW(None, None)
            if job:
                info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                ok = self._k32.SetInformationJobObject(
                    job,
                    JOB_OBJECT_EXTENDED_LIMIT_INFO_CLASS,
                    ctypes.byref(info),
                    ctypes.sizeof(info),
                )
                if ok:
                    self._job_handle = job
                else:
                    self._k32.CloseHandle(job)

    def spawn(self, cmd: list[str], cwd: str | None = None, **extra_kwargs) -> subprocess.Popen:
        kwargs: dict = {"cwd": cwd, **extra_kwargs}
        if sys.platform == "win32":
            proc = subprocess.Popen(cmd, **kwargs)
            if self._job_handle and self._k32 is not None:
                if not self._k32.AssignProcessToJobObject(self._job_handle, wintypes.HANDLE(int(proc._handle))):
                    err = ctypes.get_last_error()
                    proc.kill()
                    raise OSError(err, "AssignProcessToJobObject failed")
        else:
            parent_pid = os.getpid()

            def _set_pdeathsig() -> None:
                if _POSIX_LIBC is not None:
                    _POSIX_LIBC.prctl(PR_SET_PDEATHSIG, signal.SIGTERM)
                if os.getppid() != parent_pid:
                    os._exit(1)
                os.setsid()

            proc = subprocess.Popen(cmd, preexec_fn=_set_pdeathsig, **kwargs)
        self._children.append(proc)
        return proc

    def close(self) -> None:
        if sys.platform == "win32" and self._job_handle and self._k32 is not None:
            self._k32.TerminateJobObject(self._job_handle, 1)
            self._k32.CloseHandle(self._job_handle)
            self._job_handle = None
        for proc in self._children:
            if proc.poll() is None:
                try:
                    if sys.platform != "win32":
                        try:
                            os.killpg(proc.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:
                    try:
                        if sys.platform != "win32":
                            os.killpg(proc.pid, signal.SIGKILL)
                        proc.kill()
                    except Exception:
                        pass
        self._children.clear()

    def __enter__(self) -> "SupervisedProcessGroup":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
