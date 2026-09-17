"""Win32 Job Object wrapper: the Windows replacement for the POSIX process group.

The Linux host stack starts a room with `start_new_session=True` and kills the
tree with `os.killpg`; Windows has no process group with kill-on-close
semantics, and its answer is a Job Object: the child joins at creation, the job
kills the whole tree with one call, and `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`
guarantees that closing our last handle leaves nothing behind.

This module is the **only** place in the stack that calls Win32 job APIs. The
launcher speaks ordinary verbs (`assign`, `kill`, `close`, `accounting`); the
ctypes surface lives here and is imported lazily so Linux test runs can import
the package without the Windows-only externals being resolved.

The spike's first-hand finding is recorded in the port's capability declaration,
not here: the job works on this machine (assign + kill observed), the
AppContainer does not.
"""
from __future__ import annotations

import ctypes
import sys
from dataclasses import dataclass
from typing import Any


JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
JobObjectExtendedLimitInformation = 9
PROCESS_SET_QUOTA = 0x0100
PROCESS_TERMINATE = 0x0001


class JobError(RuntimeError):
    """A typed Win32 job failure."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


@dataclass(frozen=True)
class JobAccounting:
    """The numbers `QueryInformationJobObject` gives back, as evidence."""

    active_processes: int
    total_processes: int
    total_terminated: int
    peak_processes: int
    peak_job_memory: int


class _IO_COUNTERS(ctypes.Structure):
    _fields_ = [
        ("ReadOperationCount", ctypes.c_ulonglong),
        ("WriteOperationCount", ctypes.c_ulonglong),
        ("OtherOperationCount", ctypes.c_ulonglong),
        ("ReadTransferCount", ctypes.c_ulonglong),
        ("WriteTransferCount", ctypes.c_ulonglong),
        ("OtherTransferCount", ctypes.c_ulonglong),
    ]


class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_longlong),
        ("PerJobUserTimeLimit", ctypes.c_longlong),
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


class _JOBOBJECT_BASIC_ACCOUNTING_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("TotalUserTime", ctypes.c_longlong),
        ("TotalKernelTime", ctypes.c_longlong),
        ("ThisPeriodTotalUserTime", ctypes.c_longlong),
        ("ThisPeriodTotalKernelTime", ctypes.c_longlong),
        ("TotalPageFaultCount", ctypes.c_uint32),
        ("TotalProcesses", ctypes.c_uint32),
        ("ActiveProcesses", ctypes.c_uint32),
        ("TotalTerminatedProcesses", ctypes.c_uint32),
    ]


class Job:
    """One job object; assign the child at creation, kill or close exactly once."""

    def __init__(self, name: str | None = None) -> None:
        if sys.platform != "win32":
            raise JobError("JOB_PLATFORM_UNSUPPORTED", "Job Objects exist on Windows only")
        self._kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self._handle = self._kernel32.CreateJobObjectW(None, name)
        if not self._handle:
            raise JobError("JOB_CREATE_FAILED", f"CreateJobObjectW failed: {ctypes.get_last_error()}")
        limits = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self._kernel32.SetInformationJobObject(
            self._handle, JobObjectExtendedLimitInformation,
            ctypes.byref(limits), ctypes.sizeof(limits),
        ):
            self.close()
            raise JobError(
                "JOB_LIMIT_FAILED",
                f"SetInformationJobObject failed: {ctypes.get_last_error()}",
            )
        self._closed = False

    @property
    def handle(self) -> int:
        return int(self._handle)

    def assign(self, process_handle: int) -> None:
        """Put one process (and everything it spawns) into this job."""
        if self._closed:
            raise JobError("JOB_CLOSED", "this job was already closed")
        if not self._kernel32.AssignProcessToJobObject(
            self._handle, ctypes.c_void_p(process_handle),
        ):
            raise JobError(
                "JOB_ASSIGN_FAILED",
                f"AssignProcessToJobObject failed: {ctypes.get_last_error()}",
            )

    def assign_pid(self, pid: int) -> None:
        """Assign a process by pid (opens the handle with the rights we hold).

        The usual race applies - a grandchild spawned between creation and this
        call is outside the job - so the caller assigns immediately after
        CreateProcess/Popen, and the process-tree kill is validated by the
        conformance gate rather than assumed.
        """
        if self._closed:
            raise JobError("JOB_CLOSED", "this job was already closed")
        handle = self._kernel32.OpenProcess(
            PROCESS_SET_QUOTA | PROCESS_TERMINATE, False, pid,
        )
        if not handle:
            raise JobError(
                "JOB_OPEN_FAILED",
                f"OpenProcess({pid}) failed: {ctypes.get_last_error()}",
            )
        try:
            self.assign(handle)
        finally:
            self._kernel32.CloseHandle(handle)

    def kill(self, exit_code: int = 1) -> None:
        """Terminate every process in the tree."""
        if self._closed:
            return
        if not self._kernel32.TerminateJobObject(self._handle, exit_code):
            raise JobError(
                "JOB_KILL_FAILED",
                f"TerminateJobObject failed: {ctypes.get_last_error()}",
            )

    def accounting(self) -> JobAccounting:
        info = _JOBOBJECT_BASIC_ACCOUNTING_INFORMATION()
        returned = ctypes.c_ulong(0)
        if not self._kernel32.QueryInformationJobObject(
            self._handle, 1, ctypes.byref(info), ctypes.sizeof(info), ctypes.byref(returned),
        ):
            raise JobError(
                "JOB_QUERY_FAILED",
                f"QueryInformationJobObject failed: {ctypes.get_last_error()}",
            )
        peak = 0
        extended = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        if self._kernel32.QueryInformationJobObject(
            self._handle, JobObjectExtendedLimitInformation,
            ctypes.byref(extended), ctypes.sizeof(extended), ctypes.byref(returned),
        ):
            peak = int(extended.PeakJobMemoryUsed)
        return JobAccounting(
            active_processes=int(info.ActiveProcesses),
            total_processes=int(info.TotalProcesses),
            total_terminated=int(info.TotalTerminatedProcesses),
            peak_processes=int(info.TotalProcesses),
            peak_job_memory=peak,
        )

    def close(self) -> None:
        """Close the last handle: KILL_ON_JOB_CLOSE reaps whatever is left."""
        if not self._closed and self._handle:
            self._kernel32.CloseHandle(self._handle)
            self._closed = True
            self._handle = None

    def __enter__(self) -> "Job":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()


__all__ = [
    "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE",
    "Job",
    "JobAccounting",
    "JobError",
]
