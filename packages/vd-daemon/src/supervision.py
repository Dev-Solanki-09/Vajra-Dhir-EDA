"""
Orphan-safe child process supervision for vd-daemon:
- Windows: Win32 Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
- POSIX/Linux: PR_SET_PDEATHSIG(SIGTERM) + process-group reaper
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


class SupervisedProcessGroup:
    """Tracks spawned worker children and ensures orphan-free termination on close/exit."""

    def __init__(self) -> None:
        self._children: list[subprocess.Popen] = []
        self._job_handle = None
        if sys.platform == "win32":
            kernel32 = ctypes.windll.kernel32
            kernel32.CreateJobObjectW.restype = wintypes.HANDLE
            kernel32.SetInformationJobObject.argtypes = [
                wintypes.HANDLE,
                ctypes.c_int,
                ctypes.c_void_p,
                wintypes.DWORD,
            ]
            kernel32.SetInformationJobObject.restype = wintypes.BOOL
            kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
            kernel32.AssignProcessToJobObject.restype = wintypes.BOOL

            job = kernel32.CreateJobObjectW(None, None)
            if job:
                info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                ok = kernel32.SetInformationJobObject(
                    job,
                    JOB_OBJECT_EXTENDED_LIMIT_INFO_CLASS,
                    ctypes.byref(info),
                    ctypes.sizeof(info),
                )
                if ok:
                    self._job_handle = job
                else:
                    kernel32.CloseHandle(job)

    def spawn(self, cmd: list[str], cwd: str | None = None) -> subprocess.Popen:
        kwargs: dict = {"cwd": cwd}
        if sys.platform == "win32":
            proc = subprocess.Popen(cmd, **kwargs)
            if self._job_handle:
                ctypes.windll.kernel32.AssignProcessToJobObject(self._job_handle, int(proc._handle))
        else:
            def _set_pdeathsig() -> None:
                try:
                    libc = ctypes.CDLL("libc.so.6")
                    libc.prctl(PR_SET_PDEATHSIG, signal.SIGTERM)
                except OSError:
                    pass
                os.setsid()

            proc = subprocess.Popen(cmd, preexec_fn=_set_pdeathsig, **kwargs)
        self._children.append(proc)
        return proc

    def close(self) -> None:
        if sys.platform == "win32" and self._job_handle:
            ctypes.windll.kernel32.TerminateJobObject(self._job_handle, 1)
            ctypes.windll.kernel32.CloseHandle(self._job_handle)
            self._job_handle = None
        for proc in self._children:
            if proc.poll() is None:
                try:
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
        self._children.clear()

    def __enter__(self) -> "SupervisedProcessGroup":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
